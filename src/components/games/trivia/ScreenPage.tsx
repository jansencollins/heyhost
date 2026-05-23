"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { useGameTheme } from "@/lib/theme-context";
import { getFontFamily, getGoogleFontsUrl } from "@/lib/theme-fonts";
import { getPatternBg } from "@/lib/theme-patterns";
import { getCardCss, getShellCss, getHeadingCss } from "@/lib/theme-styles";
import { GamePausedOverlay } from "@/components/games/GamePausedOverlay";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  SessionAnswer,
  GameTheme,
} from "@/lib/types";

export interface TriviaScreenDevMode {
  session?: Session | null;
  players?: SessionPlayer[];
  questionState?: SessionQuestionState | null;
  currentQuestion?: GameQuestionWithChoices | null;
  answers?: SessionAnswer[];
  timeLeft?: number;
  totalQuestions?: number;
  showLeaderboard?: boolean;
  gameName?: string;
}

function FullscreenToggle({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (targetRef.current) await targetRef.current.requestFullscreen();
    } catch {
      /* no-op — browser may block */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      title={isFs ? "Exit fullscreen" : "Enter fullscreen"}
      aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
      className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full flex items-center justify-center bg-black/40 text-white backdrop-blur-sm hover:bg-black/65 transition opacity-25 hover:opacity-100 focus:opacity-100"
    >
      {isFs ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V5H5m14 0h-4v4m0 6v4h4M5 15v4h4" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4" />
        </svg>
      )}
    </button>
  );
}

// ─── Themed shell — CSS-only 16:9 box, scales via container queries ──────
// The wrapper is a `container-type: size` so its descendants can resolve
// `cqw`/`cqh`/`cqmin`. The inner uses `aspect-ratio: 16/9` and a `min()`
// width that picks the larger 16:9 box that fits the wrapper without
// overflow. Inside, `--spacing` is rebound to a cqmin-based value so all
// Tailwind size/padding/gap utilities scale with the screen (see globals.css).
function ScreenShell({ children, t, paused = false }: { children: React.ReactNode; t: GameTheme; paused?: boolean }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const fontsUrl = getGoogleFontsUrl([t.headingFont, t.bodyFont]);
  const headingFontCss = getFontFamily(t.headingFont);
  const patternBg = getPatternBg(t.pattern, t.accent);
  const styleShell = getShellCss(t);
  const headingExtra = getHeadingCss(t);
  const shellBgImage = patternBg && styleShell.backgroundImage
    ? `${patternBg}, ${styleShell.backgroundImage}`
    : (patternBg ?? styleShell.backgroundImage);
  return (
    <div
      ref={shellRef}
      className="h-full w-full overflow-hidden relative flex items-center justify-center"
      style={{
        backgroundColor: t.bg,
        containerType: "size",
      }}
    >
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <style>{`
        .themed-screen h1,.themed-screen h2,.themed-screen h3,.themed-screen h4,.themed-screen h5,.themed-screen h6{
          color:inherit;
          font-family:${headingFontCss};
          letter-spacing:${(headingExtra.letterSpacing as string) ?? "-0.02em"};
          line-height:1.05;
          text-transform:${(headingExtra.textTransform as string) ?? "none"};
        }
      `}</style>
      <FullscreenToggle targetRef={shellRef} />
      <div
        className="themed-screen flex flex-col overflow-hidden relative"
        style={{
          width: "min(100cqw, calc(100cqh * 16 / 9))",
          aspectRatio: "16 / 9",
          ...styleShell,
          backgroundColor: t.bg,
          backgroundImage: shellBgImage,
          backgroundRepeat: shellBgImage ? "repeat" : undefined,
          color: t.textPrimary,
          fontFamily: getFontFamily(t.bodyFont),
        }}
      >
        {children}
      </div>
      {paused && <GamePausedOverlay />}
    </div>
  );
}

function ScreenCard({
  children, t, glow, className = "",
}: {
  children: React.ReactNode; t: GameTheme; glow?: boolean; className?: string;
}) {
  return (
    <div className={className} style={getCardCss(t, { glow })}>
      {children}
    </div>
  );
}

function AvatarDisc({
  player,
  size,
  className = "",
  fontClass = "",
}: {
  player: SessionPlayer;
  size?: number;
  className?: string;
  fontClass?: string;
}) {
  const usePxSize = size !== undefined;
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className} ${fontClass}`}
      style={{
        ...(usePxSize ? { width: size, height: size, fontSize: size * 0.4 } : {}),
        backgroundColor: player.avatar_color,
        border: "2px solid rgba(255,255,255,0.5)",
      }}
    >
      {player.display_name.charAt(0).toUpperCase()}
    </div>
  );
}

export default function TriviaScreenPage({ sessionCode, devMode }: { sessionCode: string; devMode?: TriviaScreenDevMode }) {
  const t = useGameTheme();
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [questionState, setQuestionState] = useState<SessionQuestionState | null>(devMode?.questionState ?? null);
  const [currentQuestion, setCurrentQuestion] = useState<GameQuestionWithChoices | null>(devMode?.currentQuestion ?? null);
  const [answers, setAnswers] = useState<SessionAnswer[]>(devMode?.answers ?? []);
  const [timeLeft, setTimeLeft] = useState(devMode?.timeLeft ?? 0);
  const [totalQuestions, setTotalQuestions] = useState(devMode?.totalQuestions ?? 0);
  const [showLeaderboard, setShowLeaderboard] = useState(devMode?.showLeaderboard ?? false);
  const [gameName, setGameName] = useState(devMode?.gameName ?? "");

  // ─── Data loading (unchanged from previous version) ─────────────────────
  useEffect(() => {
    if (devMode) return;
    async function load() {
      const supabase = createClient();
      const { data: sessionData } = await supabase
        .from("sessions").select("*").eq("code", sessionCode.toUpperCase())
        .neq("status", "finished").maybeSingle();

      if (!sessionData) {
        const { data: finishedData } = await supabase
          .from("sessions").select("*").eq("code", sessionCode.toUpperCase())
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (finishedData) setSession(finishedData);
        return;
      }

      setSession(sessionData);

      const { data: gameData } = await supabase
        .from("games").select("title").eq("id", sessionData.game_id).maybeSingle();
      if (gameData?.title) setGameName(gameData.title);

      const { count } = await supabase
        .from("game_questions").select("id", { count: "exact" }).eq("game_id", sessionData.game_id);
      setTotalQuestions(count || 0);

      const { data: playersData } = await supabase
        .from("session_players").select("*").eq("session_id", sessionData.id).eq("is_removed", false);
      setPlayers(playersData || []);

      if (sessionData.current_question_index >= 0) {
        const { data: qsData } = await supabase
          .from("session_question_state").select("*").eq("session_id", sessionData.id)
          .eq("question_index", sessionData.current_question_index).maybeSingle();

        if (qsData) {
          setQuestionState(qsData);
          const { data: qData } = await supabase
            .from("game_questions").select("*, game_question_choices(*)").eq("id", qsData.question_id).single();
          if (qData) {
            setCurrentQuestion({
              ...qData,
              game_question_choices: qData.game_question_choices.sort(
                (a: { choice_order: number }, b: { choice_order: number }) => a.choice_order - b.choice_order
              ),
            });
          }
          const { data: answersData } = await supabase
            .from("session_answers").select("*").eq("session_id", sessionData.id).eq("question_id", qsData.question_id);
          setAnswers(answersData || []);
        }
      }
    }
    load();
  }, [sessionCode]);

  useEffect(() => {
    if (devMode) return;
    if (!session) return;
    const channel = subscribeToSession(session.id, {
      onSessionChange: (payload) => setSession(payload.new as Session),
      onPlayerChange: (payload) => {
        const p = payload.new as SessionPlayer;
        if (payload.eventType === "INSERT") {
          setPlayers((prev) => [...prev.filter((x) => x.id !== p.id), p]);
        } else if (payload.eventType === "UPDATE") {
          if (p.is_removed) setPlayers((prev) => prev.filter((x) => x.id !== p.id));
          else setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
        }
      },
      onQuestionStateChange: (payload) => {
        const qs = payload.new as SessionQuestionState;
        setQuestionState(qs);
        setShowLeaderboard(qs.show_leaderboard);
        if (payload.eventType === "INSERT") setAnswers([]);
      },
      onAnswerChange: (payload) => {
        if (payload.eventType === "INSERT") setAnswers((prev) => [...prev, payload.new as SessionAnswer]);
      },
    });
    return () => unsubscribe(channel);
  }, [session?.id]);

  useEffect(() => {
    if (devMode) return;
    if (!questionState) return;
    async function loadQ() {
      const supabase = createClient();
      const { data } = await supabase
        .from("game_questions").select("*, game_question_choices(*)").eq("id", questionState!.question_id).single();
      if (data) {
        setCurrentQuestion({
          ...data,
          game_question_choices: data.game_question_choices.sort(
            (a: { choice_order: number }, b: { choice_order: number }) => a.choice_order - b.choice_order
          ),
        });
      }
    }
    loadQ();
  }, [questionState?.question_id]);

  useEffect(() => {
    if (devMode) return;
    if (!questionState || questionState.is_paused || questionState.is_locked) return;
    if (!questionState.ends_at) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((new Date(questionState.ends_at!).getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [questionState?.ends_at, questionState?.is_paused, questionState?.is_locked]);

  // ─── Render ─────────────────────────────────────────────────────────────
  if (!session) {
    return (
      <ScreenShell t={t}>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
        </div>
      </ScreenShell>
    );
  }

  // ─── LOBBY — title/players (left) + receipt with QR (right) ─────────────
  if (session.status === "lobby") {
    const joinUrl = typeof window !== "undefined" ? `${window.location.host}/play` : "heyhostgames.com/play";
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      typeof window !== "undefined" ? `${window.location.origin}/play?code=${session.code}` : ""
    )}`;

    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex px-10 py-8 gap-6">
          {/* Col 1 — title + edition + active players (vertically centered) */}
          <div className="flex-1 min-w-0 flex flex-col justify-center min-h-0 z-10 gap-12">
            <div className="shrink-0">
              <h1
                className="text-8xl font-bold tracking-[-0.03em] leading-[0.95] whitespace-nowrap"
                style={{ fontFamily: getFontFamily(t.headingFont) }}
              >
                Straight Off The Dome
              </h1>
              {gameName && (
                <div
                  className="mt-8 rounded-full py-4 px-8 inline-flex"
                  style={{
                    background: t.accent,
                    border: `2px solid color-mix(in srgb, ${t.textPrimary} 90%, transparent)`,
                  }}
                >
                  <p
                    className="text-3xl font-bold uppercase tracking-[0.15em]"
                    style={{ color: t.buttonTextMode === "light" ? "#FFFFFF" : "#1A1A1A" }}
                  >
                    {gameName} Edition
                  </p>
                </div>
              )}
            </div>

            {/* Active Players card — natural height, sits with title block centered */}
            <div
              className="shrink-0 rounded-2xl p-8 flex flex-col overflow-hidden"
              style={{
                background: t.surface,
                border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
              }}
            >
              <h2 className="text-5xl font-bold mb-6 shrink-0" style={{ color: t.accent }}>Active Players</h2>
              {players.length > 0 ? (
                <div className="grid grid-cols-3 gap-x-8 gap-y-6">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-4">
                      <AvatarDisc player={p} size={56} fontClass="text-2xl" />
                      <span className="text-2xl font-bold uppercase tracking-wide truncate">{p.display_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-2xl text-center" style={{ color: t.textDim }}>Waiting for players to join…</p>
              )}
            </div>
          </div>

          {/* Col 2 — curved arrow pointing to the QR code */}
          <div className="w-[16%] shrink-0 flex items-center justify-center min-h-0 z-20 relative">
            <svg
              viewBox="0 0 100 300"
              className="w-full h-full overflow-visible"
              preserveAspectRatio="xMidYMid meet"
              fill="none"
              aria-hidden
            >
              <path
                d="M 20 40 C 90 70, 90 170, 25 215 S 70 280, 92 280"
                stroke={t.accent}
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 92 280 L 78 270 M 92 280 L 80 294"
                stroke={t.accent}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>

          {/* Col 3 — join card (matches Active Players surface) */}
          <div className="w-[26%] shrink-0 flex flex-col items-center justify-center min-h-0 z-10">
            <div
              className="w-full text-center rounded-2xl"
              style={{
                background: t.surface,
                border: `1.5px solid color-mix(in srgb, ${t.textPrimary} 22%, transparent)`,
                color: t.textPrimary,
              }}
            >
              <div className="px-8 py-20">
                <img
                  src="/straight-off-dome-thumb.png"
                  alt=""
                  className="w-40 h-auto mx-auto mb-6"
                />
                <p className="text-4xl font-bold uppercase tracking-wider mb-5">Join the Game</p>
                <div
                  className="border-t border-dashed my-5"
                  style={{ borderColor: `color-mix(in srgb, ${t.textPrimary} 22%, transparent)` }}
                />
                <p className="text-2xl mb-2" style={{ color: t.textMuted }}>Scan the QR code or visit</p>
                <p className="text-2xl mb-7">
                  <strong>{joinUrl}</strong> and enter the game code below:
                </p>
                <p className="text-xl uppercase tracking-wider mb-2" style={{ color: t.textDim }}>Game Code</p>
                <p
                  className="text-7xl font-bold font-mono tracking-[0.15em] mb-7"
                  style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {session.code}
                </p>
                <div
                  className="inline-block p-4 rounded-xl mx-auto"
                  style={{ background: "#ffffff" }}
                >
                  <img
                    src={qrUrl}
                    alt="QR Code"
                    className="w-56 h-56 block"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  // ─── FINISHED — podium + standings ──────────────────────────────────────
  if (session.status === "finished") {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const podium = sorted.slice(0, 3);
    const rest = sorted.slice(3, 12);
    const useTwoCols = rest.length > 6;
    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex flex-col items-center px-12 py-10 gap-8 overflow-hidden">
          <h1 className="text-7xl font-bold tracking-[-0.025em] shrink-0">Final Results</h1>

          <div className="flex items-end gap-8 shrink-0">
            {podium[1] && (
              <div className="text-center">
                <AvatarDisc player={podium[1]} className="w-24 h-24 mx-auto" fontClass="text-4xl" />
                <p className="font-semibold text-3xl mt-2">{podium[1].display_name}</p>
                <p
                  className="text-3xl tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[1].score} pts
                </p>
                <div
                  className="rounded-t-2xl w-32 h-24 mt-2 mx-auto flex items-center justify-center text-5xl font-bold"
                  style={{ background: t.surfaceLight, color: t.textDim }}
                >
                  2
                </div>
              </div>
            )}
            {podium[0] && (
              <div className="text-center">
                <div className="text-4xl mb-1" style={{ color: t.accent }}>&#x1F451;</div>
                <AvatarDisc player={podium[0]} className="w-32 h-32 mx-auto" fontClass="text-5xl" />
                <p className="font-bold text-4xl mt-2">{podium[0].display_name}</p>
                <p
                  className="text-4xl font-bold tracking-[-0.025em] tabular-nums"
                  style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[0].score} pts
                </p>
                <div
                  className="rounded-t-2xl w-40 h-36 mt-2 mx-auto flex items-center justify-center text-6xl font-bold"
                  style={{ background: t.accentDim, color: t.accent }}
                >
                  1
                </div>
              </div>
            )}
            {podium[2] && (
              <div className="text-center">
                <AvatarDisc player={podium[2]} className="w-24 h-24 mx-auto" fontClass="text-4xl" />
                <p className="font-semibold text-3xl mt-2">{podium[2].display_name}</p>
                <p
                  className="text-3xl tracking-[-0.02em] tabular-nums"
                  style={{ color: t.textMuted, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {podium[2].score} pts
                </p>
                <div
                  className="rounded-t-2xl w-32 h-16 mt-2 mx-auto flex items-center justify-center text-5xl font-bold"
                  style={{ background: t.surface, color: t.textDim }}
                >
                  3
                </div>
              </div>
            )}
          </div>

          {rest.length > 0 && (
            <div
              className={`w-full ${useTwoCols ? "grid grid-cols-2 gap-x-6 gap-y-3" : "max-w-3xl flex flex-col gap-2"} flex-1 min-h-0 overflow-hidden`}
              style={useTwoCols ? { gridTemplateRows: `repeat(${Math.ceil(rest.length / 2)}, minmax(0, 1fr))`, gridAutoFlow: "column" } : undefined}
            >
              {rest.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-5 px-6 py-3 rounded-xl"
                  style={{ background: t.surface, border: `1px solid color-mix(in srgb, ${t.textPrimary} 14%, transparent)` }}
                >
                  <span className="font-bold w-12 text-2xl" style={{ color: t.textDim }}>#{i + 4}</span>
                  <AvatarDisc player={p} className="w-16 h-16" fontClass="text-2xl" />
                  <span className="flex-1 font-semibold text-2xl truncate">{p.display_name}</span>
                  <span
                    className="text-3xl font-bold tracking-[-0.02em] tabular-nums"
                    style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                  >
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScreenShell>
    );
  }

  if (!currentQuestion || !questionState) {
    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-12 h-12 border-3 rounded-full animate-spin" style={{ borderColor: `${t.accent} transparent transparent transparent` }} />
        </div>
      </ScreenShell>
    );
  }

  // ─── LEADERBOARD between rounds ─────────────────────────────────────────
  if (questionState.show_results && showLeaderboard) {
    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 12);
    const useTwoCols = sorted.length > 8;
    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 min-h-0 flex flex-col items-center px-12 py-10 gap-6 overflow-hidden">
          <h2 className="text-7xl font-bold tracking-[-0.025em] shrink-0">Leaderboard</h2>

          <div
            className={`w-full ${useTwoCols ? "grid grid-cols-2 gap-x-6 gap-y-3" : "max-w-3xl flex flex-col gap-2"} flex-1 min-h-0 overflow-hidden`}
            style={useTwoCols ? { gridTemplateRows: `repeat(${Math.ceil(sorted.length / 2)}, minmax(0, 1fr))`, gridAutoFlow: "column" } : undefined}
          >
            {sorted.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-5 px-6 py-3 rounded-xl"
                style={{ background: t.surface, border: `1px solid color-mix(in srgb, ${t.textPrimary} 14%, transparent)` }}
              >
                <span className="font-bold text-2xl w-12" style={{ color: t.textDim }}>
                  #{i + 1}
                </span>
                <AvatarDisc player={p} className="w-16 h-16" fontClass="text-2xl" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-3xl">{p.display_name}</p>
                </div>
                <span
                  className="font-bold tracking-[-0.025em] tabular-nums text-3xl"
                  style={{ color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>
      </ScreenShell>
    );
  }

  // ─── QUESTION RESULTS — same layout as the question screen, with player
  //                          chips inside each choice and the correct answer
  //                          highlighted with the theme accent color. ──────
  if (questionState.show_results) {
    const correctChoice = currentQuestion.game_question_choices.find((c) => c.is_correct);
    return (
      <ScreenShell t={t} paused={!!session?.is_paused}>
        <div className="flex-1 flex flex-col px-10 py-8 min-h-0">
          {/* Top bar */}
          <div className="flex items-center justify-between shrink-0 mb-6">
            <div
              className="px-4 py-1.5 rounded-lg text-base font-bold"
              style={{ background: t.accentDim, color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
            >
              Question {questionState.question_index + 1}{totalQuestions > 0 ? ` of ${totalQuestions}` : ""}
            </div>
            <div
              className="px-4 py-1.5 rounded-lg text-base font-bold"
              style={{ background: t.accent, color: "#FFFFFF", fontFamily: getFontFamily(t.headingFont) }}
            >
              Correct: {correctChoice?.choice_text}
            </div>
          </div>

          {/* Prompt */}
          <ScreenCard t={t} glow className="p-10 text-center shrink-0 mb-12">
            <p className="text-6xl font-bold leading-tight">{currentQuestion.prompt}</p>
          </ScreenCard>

          {/* Choices — 2x2 grid, each with players who picked that option */}
          <div className="flex-1 grid grid-cols-2 gap-12 min-h-0">
            {currentQuestion.game_question_choices.map((choice, idx) => {
              const isCorrect = !!choice.is_correct;
              const choicePlayers = answers
                .filter((a) => a.choice_id === choice.id)
                .map((a) => players.find((p) => p.id === a.player_id))
                .filter((p): p is SessionPlayer => !!p);
              const inkColor = t.textPrimary;
              return (
                <div
                  key={choice.id}
                  className="flex flex-col gap-6 p-5 min-h-0 overflow-hidden"
                  style={{
                    background: isCorrect ? t.accentDim : t.surface,
                    border: `2px solid ${isCorrect ? t.accent : `color-mix(in srgb, ${inkColor} 14%, transparent)`}`,
                    borderRadius: t.corners === "square" ? 0 : 16,
                    color: t.textPrimary,
                  }}
                >
                  <div className="flex items-center gap-10 shrink-0">
                    <span
                      className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-bold shrink-0"
                      style={{
                        background: isCorrect ? t.accent : `color-mix(in srgb, ${inkColor} 8%, transparent)`,
                        color: isCorrect ? "#FFFFFF" : t.textPrimary,
                        fontFamily: getFontFamily(t.headingFont),
                      }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span
                      className="flex-1 text-5xl font-semibold leading-snug truncate"
                      style={{ color: isCorrect ? t.accent : t.textPrimary }}
                    >
                      {choice.choice_text}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-wrap content-start gap-4 overflow-hidden">
                    {choicePlayers.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-4 px-5 py-3 rounded-2xl"
                        style={{
                          background: `color-mix(in srgb, ${inkColor} 6%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${inkColor} 10%, transparent)`,
                        }}
                      >
                        <AvatarDisc player={p} className="w-14 h-14" fontClass="text-2xl" />
                        <span className="text-3xl font-semibold truncate max-w-[18rem]">
                          {p.display_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScreenShell>
    );
  }

  // ─── ACTIVE QUESTION — top bar (Q + timer + answered/total), prompt, choices ──
  return (
    <ScreenShell t={t} paused={!!session?.is_paused}>
      <div className="flex-1 flex flex-col px-10 py-8 min-h-0">
        {/* Top bar */}
        <div className="flex items-center justify-between shrink-0 mb-6">
          <div
            className="px-4 py-1.5 rounded-lg text-base font-bold"
            style={{ background: t.accentDim, color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
          >
            Question {questionState.question_index + 1}{totalQuestions > 0 ? ` of ${totalQuestions}` : ""}
          </div>

          {/* Timer */}
          <div
            className="text-5xl font-bold tabular-nums"
            style={{
              color: questionState.is_paused ? t.textMuted : timeLeft <= 5 ? t.danger : t.textPrimary,
              fontFamily: getFontFamily(t.headingFont),
            }}
          >
            {questionState.is_paused ? "PAUSED" : `${timeLeft}s`}
          </div>

          {/* Answer count */}
          <div
            className="px-4 py-1.5 rounded-lg text-base font-bold flex items-center gap-2"
            style={{ background: t.accentDim, color: t.accent, fontFamily: getFontFamily(t.headingFont) }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {answers.length}/{players.length}
          </div>
        </div>

        {/* Prompt */}
        <ScreenCard t={t} glow className="p-10 text-center shrink-0 mb-12">
          <p className="text-6xl font-bold leading-tight">{currentQuestion.prompt}</p>
        </ScreenCard>

        {/* Choices — 2x2 grid filling remaining space */}
        <div className="flex-1 grid grid-cols-2 gap-12 min-h-0">
          {currentQuestion.game_question_choices.map((choice, idx) => {
            const inkColor = t.textPrimary;
            return (
              <div
                key={choice.id}
                className="flex items-center gap-10 px-8"
                style={{
                  background: t.surface,
                  border: `1.5px solid color-mix(in srgb, ${inkColor} 14%, transparent)`,
                  borderRadius: t.corners === "square" ? 0 : 16,
                  color: t.textPrimary,
                }}
              >
                <span
                  className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-bold shrink-0"
                  style={{ background: `color-mix(in srgb, ${inkColor} 8%, transparent)`, color: t.textPrimary, fontFamily: getFontFamily(t.headingFont) }}
                >
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="flex-1 text-5xl font-semibold leading-snug">{choice.choice_text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}
