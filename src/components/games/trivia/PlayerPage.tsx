"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import { useGameTheme } from "@/lib/theme-context";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getPatternBg } from "@/lib/theme-patterns";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  GameTheme,
} from "@/lib/types";

// ─── Themed shell + helpers — mirrors TCHM's BankShell so every phase
// fits the player frame without scroll. ────────────────────────────────
function TriviaShell({ children, t }: { children: React.ReactNode; t: GameTheme }) {
  const fontsUrl = getGoogleFontsUrl([t.headingFont, t.bodyFont]);
  const headingFontCss = getFontFamily(t.headingFont);
  const patternBg = getPatternBg(t.pattern, t.accent);
  return (
    <div
      className="min-h-full h-full flex flex-col trivia-shell overflow-x-hidden"
      style={{
        backgroundColor: t.bg,
        backgroundImage: patternBg ?? undefined,
        backgroundRepeat: patternBg ? "repeat" : undefined,
        color: t.textPrimary,
        fontFamily: getFontFamily(t.bodyFont),
      }}
    >
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <style>{`
        .trivia-shell h1,.trivia-shell h2,.trivia-shell h3{
          font-family:${headingFontCss};
          letter-spacing:-0.02em;
          line-height:1.05;
        }
        .trivia-shell input::placeholder{color:${t.textDim}}
      `}</style>
      {children}
    </div>
  );
}

function TriviaCard({
  children,
  className = "",
  glow = false,
  t,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  t: GameTheme;
}) {
  return (
    <div
      className={`rounded-3xl p-4 overflow-hidden ${className}`}
      style={{
        background: t.surface,
        border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 18%, transparent)`,
        boxShadow: glow
          ? `0 0 30px ${t.accentDim}`
          : `0 8px 24px -16px rgba(0,0,0,0.45)`,
      }}
    >
      {children}
    </div>
  );
}

function TriviaButton({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = "primary",
  className = "",
  t,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "ghost";
  className?: string;
  t: GameTheme;
}) {
  const base =
    "w-full py-3.5 rounded-full font-display font-semibold text-[16px] tracking-[-0.01em] transition-[filter,transform,background] duration-200 flex items-center justify-center gap-2 active:scale-[0.98] hover:brightness-95";
  const buttonTextColor = t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A";
  const inkBorder = `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`;
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: t.accent, color: buttonTextColor, border: inkBorder },
    ghost: {
      background: "transparent",
      border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 25%, transparent)`,
      color: t.textPrimary,
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      style={variantStyles[variant]}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function PulsingDot({ t }: { t: GameTheme }) {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: t.accent }} />
      <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: t.accent }} />
    </span>
  );
}

function AvatarBubble({ player, size = 64 }: { player: SessionPlayer; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: player.avatar_color,
        fontSize: size * 0.4,
        border: "2px solid color-mix(in srgb, currentColor 20%, transparent)",
      }}
    >
      {player.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

type PlayerPhase =
  | "loading"
  | "joining"
  | "lobby"
  | "question"
  | "answered"
  | "results"
  | "leaderboard"
  | "finished"
  | "removed"
  | "error";

export interface TriviaPlayerDevMode {
  phase: "joining" | "lobby" | "question" | "answered" | "results" | "leaderboard" | "finished" | "removed" | "error";
  session?: Session | null;
  player?: SessionPlayer | null;
  players?: SessionPlayer[];
  questionState?: SessionQuestionState | null;
  currentQuestion?: GameQuestionWithChoices | null;
  selectedChoiceId?: string | null;
  timeLeft?: number;
  answerResult?: { correct: boolean; points: number } | null;
  error?: string;
}

export default function TriviaPlayerPage({ sessionCode, devMode }: { sessionCode: string; devMode?: TriviaPlayerDevMode }) {
  const t = useGameTheme();
  const [phase, setPhase] = useState<PlayerPhase>(devMode?.phase || "joining");
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [player, setPlayer] = useState<SessionPlayer | null>(devMode?.player ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [questionState, setQuestionState] =
    useState<SessionQuestionState | null>(devMode?.questionState ?? null);
  const [currentQuestion, setCurrentQuestion] =
    useState<GameQuestionWithChoices | null>(devMode?.currentQuestion ?? null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(devMode?.selectedChoiceId ?? null);
  const [timeLeft, setTimeLeft] = useState(devMode?.timeLeft ?? 0);
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(AVATAR_COLORS[0]);
  const [error, setError] = useState(devMode?.error || "");
  const [joinLoading, setJoinLoading] = useState(false);
  const [answerResult, setAnswerResult] = useState<{
    correct: boolean;
    points: number;
  } | null>(devMode?.answerResult ?? null);

  useEffect(() => {
    if (devMode) return;

    async function findSession() {
      const supabase = createClient();
      const { data } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", sessionCode.toUpperCase())
        .neq("status", "finished")
        .maybeSingle();

      if (!data) {
        setError("Game not found. Check the code and try again.");
        setPhase("error");
        return;
      }

      setSession(data);

      const { data: playersData } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", data.id)
        .eq("is_removed", false);
      setPlayers(playersData || []);

      const storedPlayerId = localStorage.getItem(`heyhost-player-${data.id}`);
      if (storedPlayerId) {
        const { data: existingPlayer } = await supabase
          .from("session_players")
          .select("*")
          .eq("id", storedPlayerId)
          .maybeSingle();

        if (existingPlayer && !existingPlayer.is_removed) {
          setPlayer(existingPlayer);
          if (data.status === "lobby") setPhase("lobby");
          else if (data.status === "playing") setPhase("question");
          else setPhase("finished");
        } else if (existingPlayer?.is_removed) {
          setPhase("removed");
        }
      }
    }

    findSession();
  }, [sessionCode]);

  useEffect(() => {
    if (devMode) return;
    if (!session) return;

    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => {
        const s = payload.new as Session;
        setSession(s);
        if (s.status === "finished") setPhase("finished");
      },
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          if (player && p.id === player.id && p.is_removed) {
            setPhase("removed");
            return;
          }
          setPlayers((prev) =>
            prev.map((x) => (x.id === p.id ? p : x)).filter((x) => !x.is_removed)
          );
        }
      },
      onQuestionStateChange: (payload) => {
        const qs = payload.new as SessionQuestionState;
        setQuestionState(qs);

        if (payload.eventType === "INSERT") {
          setSelectedChoiceId(null);
          setAnswerResult(null);
          setPhase("question");
        } else if (qs.show_leaderboard) {
          setPhase("leaderboard");
        } else if (qs.show_results) {
          setPhase("results");
        }
      },
    });

    return () => unsubscribe(channel);
  }, [session?.id, player?.id]);

  useEffect(() => {
    if (devMode) return;
    if (!questionState) return;

    async function loadQuestion() {
      const supabase = createClient();
      const { data } = await supabase
        .from("game_questions")
        .select("*, game_question_choices(*)")
        .eq("id", questionState!.question_id)
        .single();

      if (data) {
        setCurrentQuestion({
          ...data,
          game_question_choices: data.game_question_choices.sort(
            (a: { choice_order: number }, b: { choice_order: number }) =>
              a.choice_order - b.choice_order
          ),
        });
      }
    }

    loadQuestion();
  }, [questionState?.question_id]);

  useEffect(() => {
    if (devMode) return;
    if (!questionState || !player || !currentQuestion) return;

    async function checkExistingAnswer() {
      const supabase = createClient();
      const { data } = await supabase
        .from("session_answers")
        .select("*")
        .eq("session_id", session!.id)
        .eq("player_id", player!.id)
        .eq("question_id", questionState!.question_id)
        .maybeSingle();

      if (data) {
        setSelectedChoiceId(data.choice_id);
        setAnswerResult({ correct: data.is_correct, points: data.points_awarded });
        setPhase("answered");
      }
    }

    checkExistingAnswer();
  }, [questionState?.question_id, player?.id, currentQuestion?.id]);

  useEffect(() => {
    if (devMode) return;
    if (!questionState || questionState.is_paused || questionState.is_locked) return;
    if (!questionState.ends_at) return;

    const interval = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(questionState.ends_at!).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);

    return () => clearInterval(interval);
  }, [questionState?.ends_at, questionState?.is_paused, questionState?.is_locked]);

  const handleJoin = useCallback(async () => {
    if (devMode) return;
    if (!session || !displayName.trim()) {
      setError("Enter a display name");
      return;
    }

    setJoinLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { data: existing } = await supabase
        .from("session_players")
        .select("display_name")
        .eq("session_id", session.id)
        .eq("is_removed", false);

      let finalName = displayName.trim();
      const names = (existing || []).map((p) => p.display_name.toLowerCase());
      if (names.includes(finalName.toLowerCase())) {
        let counter = 2;
        while (names.includes(`${finalName.toLowerCase()}${counter}`)) counter++;
        finalName = `${finalName}${counter}`;
      }

      const { data: newPlayer, error: insertError } = await supabase
        .from("session_players")
        .insert({
          session_id: session.id,
          display_name: finalName,
          avatar_color: avatarColor,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPlayer(newPlayer);
      localStorage.setItem(`heyhost-player-${session.id}`, newPlayer.id);
      setPhase("lobby");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to join. Try again.");
    } finally {
      setJoinLoading(false);
    }
  }, [session, displayName, avatarColor]);

  const handleAnswer = useCallback(
    async (choiceId: string) => {
      if (devMode) return;
      if (!session || !player || !questionState || !currentQuestion || selectedChoiceId) return;

      setSelectedChoiceId(choiceId);
      setPhase("answered");

      const supabase = createClient();
      const startedAt = questionState.started_at ? new Date(questionState.started_at).getTime() : Date.now();
      const timeMs = Date.now() - startedAt;

      const choice = currentQuestion.game_question_choices.find((c) => c.id === choiceId);
      const isCorrect = choice?.is_correct || false;

      let points = 0;
      if (isCorrect) {
        points = 1000;
        if (session.speed_bonus) {
          const totalMs = session.timer_seconds * 1000;
          const fraction = Math.max(0, 1 - timeMs / totalMs);
          points += Math.round(500 * fraction);
        }
      }

      setAnswerResult({ correct: isCorrect, points });

      await supabase.from("session_answers").insert({
        session_id: session.id,
        player_id: player.id,
        question_id: questionState.question_id,
        choice_id: choiceId,
        is_correct: isCorrect,
        time_ms: timeMs,
        points_awarded: points,
      });
    },
    [session, player, questionState, currentQuestion, selectedChoiceId]
  );

  const buttonTextColor = t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A";

  if (phase === "error") {
    return (
      <TriviaShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(185,28,28,0.12)" }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-lg font-semibold mb-2">Oops!</p>
          <p className="text-sm text-center mb-8" style={{ color: t.textMuted }}>{error}</p>
          <Link href="/play" className="w-full max-w-xs">
            <TriviaButton t={t}>Try Again</TriviaButton>
          </Link>
        </div>
      </TriviaShell>
    );
  }

  if (phase === "removed") {
    return (
      <TriviaShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ background: "rgba(185,28,28,0.12)" }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={t.danger} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <p className="text-xl font-bold mb-2">You were removed</p>
          <p className="text-sm text-center mb-8" style={{ color: t.textMuted }}>
            The host removed you from this session.
          </p>
          <Link href="/play" className="w-full max-w-xs">
            <TriviaButton t={t}>Join Another Game</TriviaButton>
          </Link>
        </div>
      </TriviaShell>
    );
  }

  if (!session) {
    return (
      <TriviaShell t={t}>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
          <p className="text-sm" style={{ color: t.textMuted }}>Connecting…</p>
        </div>
      </TriviaShell>
    );
  }

  if (phase === "joining") {
    return (
      <TriviaShell t={t}>
        <div className="flex-1 flex flex-col justify-center px-4 py-3">
          {/* Game Code chip */}
          <div className="relative mb-3">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
              <div
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full"
                style={{ background: t.bg, border: `1px solid ${t.accent}` }}
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke={t.accent} strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <span className="font-mono font-bold text-xs tracking-[0.15em]" style={{ color: t.accent }}>
                  {sessionCode}
                </span>
              </div>
            </div>
            <div
              className="rounded-2xl overflow-hidden pt-4 pb-3 px-4 text-center"
              style={{ border: `1px solid color-mix(in srgb, ${t.textPrimary} 18%, transparent)`, background: t.surface }}
            >
              <h1 className="text-xl font-bold mb-1">Straight Off The Dome</h1>
              <p className="text-[12px]" style={{ color: t.textMuted }}>Trivia, no warm-up.</p>
            </div>
          </div>

          {/* Name Input */}
          <TriviaCard t={t} className="!p-3 mb-3">
            <label className="block text-[10px] font-medium mb-1 uppercase tracking-wider text-center" style={{ color: t.textDim }}>
              Player Name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
              className="w-full bg-transparent text-lg font-bold text-center focus:outline-none"
              style={{ color: t.textPrimary, caretColor: t.accent }}
            />
          </TriviaCard>

          {/* Color picker */}
          <div className="flex flex-col mb-3">
            <h2 className="text-sm font-bold text-center mb-2">Pick a Color</h2>
            <div className="grid grid-cols-8 gap-1.5">
              {AVATAR_COLORS.map((color) => {
                const selected = avatarColor === color;
                return (
                  <button
                    key={color}
                    onClick={() => setAvatarColor(color)}
                    className="aspect-square rounded-full transition-all relative"
                    style={{
                      backgroundColor: color,
                      border: selected
                        ? `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`
                        : "2px solid transparent",
                      boxShadow: selected ? `0 0 0 2px ${t.bg}, 0 0 0 4px ${t.accent}` : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <p className="text-xs text-center font-medium mb-2" style={{ color: t.danger }}>
              {error}
            </p>
          )}

          <TriviaButton t={t} onClick={handleJoin} loading={joinLoading}>
            Join Game
          </TriviaButton>
        </div>
      </TriviaShell>
    );
  }

  if (phase === "lobby" || (session.status === "lobby" && player)) {
    const others = players.filter((p) => p.id !== player?.id);
    return (
      <TriviaShell t={t}>
        {/* Greeting Header */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm" style={{ color: t.textMuted }}>Welcome!</p>
            <h1 className="text-2xl font-bold truncate">{player?.display_name}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PulsingDot t={t} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>LIVE</span>
          </div>
        </div>

        <div className="flex-1 px-5 pb-5 flex flex-col gap-4 overflow-y-auto">
          {/* Player card */}
          {player && (
            <TriviaCard t={t} glow className="flex items-center gap-4">
              <AvatarBubble player={player} size={64} />
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: t.textDim }}>
                  Game Code
                </p>
                <p className="text-2xl font-bold font-mono tracking-[0.15em]" style={{ color: t.accent }}>
                  {sessionCode}
                </p>
              </div>
            </TriviaCard>
          )}

          {/* Player list */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-bold">Players</h3>
              <span className="text-xs font-medium" style={{ color: t.textMuted }}>
                {players.length} {players.length === 1 ? "player" : "players"}
              </span>
            </div>
            <TriviaCard t={t} className="!p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {others.map((p) => (
                  <span
                    key={p.id}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: p.avatar_color }}
                  >
                    {p.display_name}
                  </span>
                ))}
                {others.length === 0 && (
                  <p className="text-xs py-1" style={{ color: t.textDim }}>
                    No other players yet…
                  </p>
                )}
              </div>
            </TriviaCard>
          </div>

          {/* Waiting Indicator */}
          <div
            className="flex items-center justify-center gap-3 py-3 rounded-2xl mt-auto shrink-0"
            style={{ background: t.accentDim }}
          >
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-sm font-medium" style={{ color: t.accent }}>
              Waiting for the host to start…
            </span>
          </div>
        </div>
      </TriviaShell>
    );
  }

  if ((phase === "question" || phase === "answered") && currentQuestion && questionState) {
    const choices = currentQuestion.game_question_choices;
    const choiceColors = ["#EF4444", "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6"];
    const choiceLetters = ["A", "B", "C", "D", "E"];
    const isLocked = questionState.is_locked || questionState.is_paused || !!selectedChoiceId;
    return (
      <TriviaShell t={t}>
        {/* Top bar */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
          <div
            className="px-3 py-1 rounded-lg text-sm font-bold"
            style={{ background: t.accentDim, color: t.accent }}
          >
            Question {questionState.question_index + 1}
          </div>
          <div
            className="text-2xl font-bold tabular-nums"
            style={{ color: timeLeft <= 5 ? t.danger : t.textPrimary, fontFamily: getFontFamily(t.headingFont) }}
          >
            {questionState.is_paused ? "PAUSED" : `${timeLeft}s`}
          </div>
        </div>

        <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col gap-3">
          {/* Prompt */}
          <TriviaCard t={t} glow className="text-center !p-4 shrink-0">
            <p className="text-lg font-bold leading-tight">{currentQuestion.prompt}</p>
          </TriviaCard>

          {/* Choices fill remaining space */}
          <div className="flex-1 min-h-0 flex flex-col gap-2.5">
            {choices.map((choice, idx) => {
              const color = choiceColors[idx] || t.accent;
              const isMe = selectedChoiceId === choice.id;
              return (
                <button
                  key={choice.id}
                  onClick={() => handleAnswer(choice.id)}
                  disabled={isLocked}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-white font-semibold text-base transition-all disabled:opacity-60 active:scale-[0.98] hover:brightness-95 flex-1 min-h-0"
                  style={{
                    background: color,
                    border: `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`,
                    boxShadow: isMe ? `0 0 0 3px ${t.accent}` : "none",
                  }}
                >
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: "rgba(255,255,255,0.25)", border: "1.5px solid rgba(255,255,255,0.5)" }}
                  >
                    {choiceLetters[idx]}
                  </span>
                  <span className="flex-1 text-left">{choice.choice_text}</span>
                  {isMe && (
                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {phase === "answered" && (
            <div
              className="flex items-center justify-center gap-2 py-2 rounded-full shrink-0"
              style={{ background: t.accentDim }}
            >
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
              <span className="text-xs font-medium" style={{ color: t.accent }}>
                Locked in — waiting for reveal…
              </span>
            </div>
          )}
        </div>
      </TriviaShell>
    );
  }

  if (phase === "results" && questionState && currentQuestion) {
    const correctChoice = currentQuestion.game_question_choices.find((c) => c.is_correct);
    const correctColor = "#15803D";
    const isCorrect = answerResult?.correct;
    return (
      <TriviaShell t={t}>
        <div className="flex-1 px-5 py-6 flex flex-col items-center justify-center gap-4">
          <TriviaCard t={t} glow className="w-full text-center">
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: t.textDim }}>
              Correct Answer
            </p>
            <p
              className="text-3xl font-bold tracking-[-0.025em]"
              style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
            >
              {correctChoice?.choice_text}
            </p>
          </TriviaCard>

          {answerResult && (
            <TriviaCard t={t} className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: t.textDim }}>
                  Your Result
                </span>
                <span
                  className="text-lg font-bold"
                  style={{ color: isCorrect ? correctColor : t.danger }}
                >
                  {isCorrect ? "Correct!" : "Wrong"}
                </span>
              </div>
              {answerResult.points > 0 && (
                <div
                  className="rounded-xl mt-3 py-3 text-center"
                  style={{ background: t.surfaceLight }}
                >
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: t.textDim }}>Points Earned</p>
                  <p
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                  >
                    +{answerResult.points}
                  </p>
                </div>
              )}
            </TriviaCard>
          )}

          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: t.accentDim }}
          >
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>Waiting for next question…</span>
          </div>
        </div>
      </TriviaShell>
    );
  }

  if (phase === "leaderboard") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    return (
      <TriviaShell t={t}>
        <div className="px-5 pt-6 pb-3 text-center shrink-0">
          <h1 className="text-[28px] font-bold tracking-[-0.025em] leading-[1.05]">Leaderboard</h1>
          <p className="text-[14px] mt-1.5" style={{ color: t.textMuted }}>Standings so far</p>
        </div>

        <div className="flex-1 px-5 pb-5 flex flex-col gap-3 overflow-y-auto min-h-0">
          <TriviaCard t={t} className="!p-2">
            <div>
              {sorted.slice(0, 10).map((p, i) => {
                const isMe = p.id === player?.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                    style={{
                      background: isMe ? t.accentDim : "transparent",
                      borderTop: i === 0 ? "none" : `1px solid color-mix(in srgb, ${t.textPrimary} 6%, transparent)`,
                      borderRadius: i === 0 ? "0.75rem 0.75rem 0 0" : i === Math.min(sorted.length, 10) - 1 ? "0 0 0.75rem 0.75rem" : "0",
                    }}
                  >
                    <span className="text-sm font-bold w-7 text-center" style={{ color: t.textDim }}>
                      #{i + 1}
                    </span>
                    <AvatarBubble player={p} size={36} />
                    <span className="flex-1 font-display font-semibold text-[14px] truncate">
                      {p.display_name}{isMe ? " · You" : ""}
                    </span>
                    <span
                      className="font-display font-bold text-[15px] tabular-nums"
                      style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                    >
                      {p.score}
                    </span>
                  </div>
                );
              })}
            </div>
          </TriviaCard>

          <div
            className="flex items-center justify-center gap-2 py-2 rounded-full mt-auto shrink-0"
            style={{ background: t.accentDim }}
          >
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
            <span className="text-xs font-medium" style={{ color: t.accent }}>Waiting for next question…</span>
          </div>
        </div>
      </TriviaShell>
    );
  }

  if (phase === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex((p) => p.id === player?.id) + 1;
    return (
      <TriviaShell t={t}>
        <div className="px-5 pt-6 pb-3 text-center shrink-0">
          <h1 className="text-[28px] font-bold tracking-[-0.025em] leading-[1.05]">Game Over</h1>
          <p className="text-[14px] mt-1.5" style={{ color: t.textMuted }}>Final standings</p>
        </div>

        <div className="flex-1 px-5 pb-5 flex flex-col gap-3 overflow-y-auto min-h-0">
          {player && (
            <TriviaCard t={t} glow className="text-center py-5">
              <AvatarBubble player={player} size={72} />
              <p className="text-sm mt-3 mb-1" style={{ color: t.textMuted }}>{player.display_name}</p>
              <p
                className="text-4xl font-bold tracking-[-0.025em] tabular-nums"
                style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
              >
                {player.score}
                <span
                  className="text-lg font-normal ml-1 tracking-normal"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.bodyFont) }}
                >
                  pts
                </span>
              </p>
              <div
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-1.5 rounded-full text-sm font-bold"
                style={{ background: t.accentDim, color: t.accent }}
              >
                Rank #{myRank}
              </div>
            </TriviaCard>
          )}

          <div className="shrink-0">
            <h3 className="text-sm font-bold mb-2 px-1">Final Standings</h3>
            <TriviaCard t={t} className="!p-2">
              <div>
                {sorted.slice(0, 10).map((p, i) => {
                  const isMe = p.id === player?.id;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                      style={{
                        background: isMe ? t.accentDim : "transparent",
                        borderTop: i === 0 ? "none" : `1px solid color-mix(in srgb, ${t.textPrimary} 6%, transparent)`,
                        borderRadius: i === 0 ? "0.75rem 0.75rem 0 0" : i === Math.min(sorted.length, 10) - 1 ? "0 0 0.75rem 0.75rem" : "0",
                      }}
                    >
                      <span className="text-sm font-bold w-7 text-center" style={{ color: t.textDim }}>
                        #{i + 1}
                      </span>
                      <AvatarBubble player={p} size={32} />
                      <span className="flex-1 font-display font-semibold text-[13px] truncate">
                        {p.display_name}{isMe ? " · You" : ""}
                      </span>
                      <span
                        className="font-display font-bold text-[14px] tabular-nums"
                        style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                      >
                        {p.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </TriviaCard>
          </div>

          <Link href="/play" className="mt-auto shrink-0">
            <TriviaButton t={t}>Play Again</TriviaButton>
          </Link>
        </div>
      </TriviaShell>
    );
  }

  return (
    <TriviaShell t={t}>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
        <p className="text-sm" style={{ color: t.textMuted }}>Loading…</p>
      </div>
    </TriviaShell>
  );
}
