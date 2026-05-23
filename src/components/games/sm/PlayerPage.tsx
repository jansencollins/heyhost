"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { useGameTheme } from "@/lib/theme-context";
import {
  formatCents,
  resolveCrash,
  CHIPS_PER_ROUND,
  MAX_GUESSES_PER_ROUND,
} from "@/lib/sm-scoring";
import { GamePausedOverlay } from "@/components/games/GamePausedOverlay";
import { getFontFamily } from "@/lib/theme-fonts";
import { getCardCss } from "@/lib/theme-styles";
import {
  TickerCard,
  PriceQuote,
  PriceDelta,
  PositionStepper,
  MarketButton,
} from "@/components/games/sm/MarketUI";
import type {
  Game,
  GameTheme,
  Session,
  SessionPlayer,
  StalkMarketBet,
  StalkMarketCrashEvent,
  StalkMarketQuestion,
} from "@/lib/types";

export interface SMPlayerDevMode {
  phase: "joining" | "playing" | "removed" | "error";
  session?: Session | null;
  game?: Game | null;
  player?: SessionPlayer | null;
  players?: SessionPlayer[];
  questions?: StalkMarketQuestion[];
  bets?: StalkMarketBet[];
  crashEvents?: StalkMarketCrashEvent[];
  errorMsg?: string;
}

interface Props {
  sessionCode: string;
  devMode?: SMPlayerDevMode;
}

// Whole-dollar formatter for the crash result (rounds .50 cents to nearest dollar).
function formatDollars(cents: number): string {
  const dollars = Math.round(cents / 100);
  const sign = dollars < 0 ? "−" : "";
  return `${sign}$${Math.abs(dollars).toLocaleString()}`;
}

// Stock-chart that scrolls indefinitely, showing a crash pattern: small rally,
// long accelerating drop, brief bounce — then loops seamlessly. Random scroll
// duration each mount so the rhythm can't be used to time the 10s crash window.
function CrashSpinner({ color }: { color: string }) {
  const [duration] = useState(() => (3.2 + Math.random() * 3.8).toFixed(2));
  const [curve] = useState(() => generateCrashCurve(70));

  const width = 200;
  const height = 60;
  const step = width / (curve.length - 1);

  // Two side-by-side copies of the curve for seamless looping scroll.
  const seg1 = curve.map((y, i) => `${i === 0 ? "M" : "L"} ${i * step} ${y}`).join(" ");
  const seg2 = curve.map((y, i) => `L ${i * step + width} ${y}`).join(" ");
  const linePath = `${seg1} ${seg2}`;
  const areaPath = `${linePath} L ${width * 2} ${height} L 0 ${height} Z`;

  return (
    <div className="relative w-full overflow-hidden rounded-lg" style={{ height }}>
      <svg
        viewBox={`0 0 ${width * 2} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full"
        style={{
          width: "200%",
          animation: `crash-scroll ${duration}s linear infinite`,
        }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="crash-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#crash-fade)" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <style>{`
        @keyframes crash-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function generateCrashCurve(n: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    let trend: number;
    if (progress < 0.15) {
      // small rally — climbing (Y decreases)
      trend = 30 - (progress / 0.15) * 18;
    } else if (progress < 0.92) {
      // accelerating crash
      const crashP = (progress - 0.15) / 0.77;
      trend = 12 + Math.pow(crashP, 2.2) * 42;
    } else {
      // brief bounce back toward seam value
      trend = 54 - ((progress - 0.92) / 0.08) * 24;
    }
    const jitter = (Math.random() - 0.5) * 5;
    points.push(Math.max(2, Math.min(56, trend + jitter)));
  }
  // Force first/last points to match for a seamless loop seam.
  points[points.length - 1] = points[0];
  return points;
}

const DEFAULT_PALETTE = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f97316",
];

export default function StalkMarketPlayerPage({ sessionCode, devMode }: Props) {
  const theme = useGameTheme();
  const [phase, setPhase] = useState<"loading" | "joining" | "playing" | "removed" | "error">(
    devMode?.phase ?? "loading"
  );
  const [errorMsg, setErrorMsg] = useState(devMode?.errorMsg ?? "");
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [game, setGame] = useState<Game | null>(devMode?.game ?? null);
  const [player, setPlayer] = useState<SessionPlayer | null>(devMode?.player ?? null);
  const [questions, setQuestions] = useState<StalkMarketQuestion[]>(devMode?.questions ?? []);
  const [bets, setBets] = useState<StalkMarketBet[]>(devMode?.bets ?? []);
  const [crashEvents, setCrashEvents] = useState<StalkMarketCrashEvent[]>(devMode?.crashEvents ?? []);
  const [allPlayers, setAllPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);

  // Join state
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState(DEFAULT_PALETTE[0]);
  const [joining, setJoining] = useState(false);

  const refresh = useCallback(
    async (sessionId?: string) => {
      const supabase = createClient();
      const sid = sessionId || session?.id;
      if (!sid) return;
      const { data: s } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sid)
        .single();
      if (s) setSession(s as Session);
      const { data: ps } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", sid);
      setAllPlayers((ps || []) as SessionPlayer[]);
      if (s) {
        const { data: qs } = await supabase
          .from("stalk_market_questions")
          .select("*")
          .eq("game_id", s.game_id)
          .order("question_order", { ascending: true });
        setQuestions((qs || []) as StalkMarketQuestion[]);
      }
      const { data: bs } = await supabase
        .from("stalk_market_bets")
        .select("*")
        .eq("session_id", sid);
      setBets((bs || []) as StalkMarketBet[]);
      const { data: cs } = await supabase
        .from("stalk_market_crash_events")
        .select("*")
        .eq("session_id", sid);
      setCrashEvents((cs || []) as StalkMarketCrashEvent[]);
    },
    [session]
  );

  // Initial load: find session by code, restore player from localStorage if any
  useEffect(() => {
    if (devMode) return;
    async function init() {
      const supabase = createClient();
      const code = sessionCode.toUpperCase();
      const { data: s } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", code)
        .neq("status", "finished")
        .maybeSingle();
      if (!s) {
        // Try finished sessions for replay/results
        const { data: finished } = await supabase
          .from("sessions")
          .select("*")
          .eq("code", code)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!finished) {
          setErrorMsg("Game not found.");
          setPhase("error");
          return;
        }
        setSession(finished as Session);
      } else {
        setSession(s as Session);
      }
      const sid = (s || (await supabase.from("sessions").select("id").eq("code", code).single()).data)?.id;
      if (!sid) {
        setErrorMsg("Game not found.");
        setPhase("error");
        return;
      }
      const { data: g } = await supabase
        .from("games")
        .select("*")
        .eq("id", (s as Session)?.game_id)
        .maybeSingle();
      if (g) setGame(g as Game);

      // Try to restore player
      let storedId: string | null = null;
      try {
        storedId = localStorage.getItem(`heyhost-player-${sid}`);
      } catch {}
      if (storedId) {
        const { data: existing } = await supabase
          .from("session_players")
          .select("*")
          .eq("id", storedId)
          .maybeSingle();
        if (existing && !existing.is_removed) {
          setPlayer(existing as SessionPlayer);
          setPhase("playing");
          await refresh(sid);
          return;
        }
      }

      setPhase("joining");
      await refresh(sid);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode]);

  // Realtime subscription
  useEffect(() => {
    if (devMode) return;
    if (!session) return;
    const ch = subscribeToSession(session.id, {
      onSessionChange: () => refresh(session.id),
      onPlayerChange: () => refresh(session.id),
      onSMBetChange: () => refresh(session.id),
      onSMCrashChange: () => refresh(session.id),
    });
    return () => unsubscribe(ch);
  }, [session, refresh]);

  async function handleJoin() {
    if (!session || !displayName.trim()) return;
    if (session.status !== "lobby") {
      setErrorMsg("Game has already started.");
      return;
    }
    setJoining(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("session_players")
      .insert({
        session_id: session.id,
        display_name: displayName.trim().slice(0, 24),
        avatar_color: avatarColor,
      })
      .select()
      .single();
    setJoining(false);
    if (error || !data) {
      setErrorMsg(error?.message || "Couldn't join");
      return;
    }
    setPlayer(data as SessionPlayer);
    try {
      localStorage.setItem(`heyhost-player-${session.id}`, data.id);
    } catch {}
    setPhase("playing");
  }

  // Detect removal
  useEffect(() => {
    if (devMode) return;
    if (!player) return;
    const me = allPlayers.find((p) => p.id === player.id);
    if (me && me.is_removed) {
      setPhase("removed");
    } else if (me) {
      setPlayer(me);
    }
  }, [allPlayers, player]);

  if (phase === "loading") {
    return (
      <Shell theme={theme} paused={!!session?.is_paused}>
        <Spinner />
      </Shell>
    );
  }
  if (phase === "error") {
    return (
      <Shell theme={theme} paused={!!session?.is_paused}>
        <div className="h-full w-full flex items-center justify-center px-6">
          <p className="text-coral text-center">{errorMsg}</p>
        </div>
      </Shell>
    );
  }
  if (phase === "removed") {
    return (
      <Shell theme={theme} paused={!!session?.is_paused}>
        <div className="h-full w-full flex items-center justify-center px-6">
          <p className="text-center" style={{ color: theme.textPrimary }}>
            You were removed from the game.
          </p>
        </div>
      </Shell>
    );
  }
  if (phase === "joining") {
    const palette = theme.playerColors || DEFAULT_PALETTE;
    const isDark = theme.mode === "dark";
    const titleFill = isDark ? theme.bg : "#FFFFFF";
    const shadowColor = isDark ? "#FFFFFF" : theme.textPrimary;
    return (
      <Shell theme={theme} paused={!!session?.is_paused}>
        <div className="w-full max-w-md mx-auto flex flex-col px-8 pt-7 pb-8 min-h-screen">
          {/* Top: Game Code badge + branded title card */}
          <div className="shrink-0 flex flex-col gap-2">
            <div className="flex w-full items-center justify-center gap-2">
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke={theme.accent}
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <span
                className="font-bold text-[10px] uppercase tracking-wider tabular-nums"
                style={{
                  color: theme.accent,
                  fontFamily: getFontFamily(theme.headingFont),
                }}
              >
                Game Code: {sessionCode}
              </span>
            </div>

            <div
              className="rounded-2xl overflow-hidden w-full"
              style={getCardCss(theme)}
            >
              <div
                className="flex flex-col items-center justify-center text-center px-4 py-5"
                style={{
                  background: `linear-gradient(135deg, ${theme.accent} 0%, color-mix(in srgb, ${theme.accent} 70%, ${theme.textPrimary}) 100%)`,
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-[0.3em] font-mono mb-1.5 flex items-center gap-1.5"
                  style={{
                    color: titleFill,
                    opacity: 0.7,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full inline-block animate-pulse"
                    style={{ background: titleFill }}
                  />
                  Live · Stalk Market
                </p>
                <h1
                  className="font-mono font-bold text-[28px] tracking-tight leading-[1.05] tabular-nums"
                  style={{
                    color: titleFill,
                    textShadow: `0 2px 10px ${shadowColor}33`,
                  }}
                >
                  ${(game?.title || "GUEST").toUpperCase()}
                  <span className="ml-1">▲</span>
                </h1>
                <p
                  className="text-[11px] font-mono mt-1.5 tabular-nums"
                  style={{
                    color: titleFill,
                    textShadow: `0 1px 4px ${shadowColor}66`,
                    opacity: 0.85,
                  }}
                >
                  +0.00% · OPENING BELL
                </p>
              </div>
            </div>
          </div>

          {/* Body: name + color picker */}
          <div className="flex-1 flex flex-col justify-center gap-7 min-h-0 py-4">
            <div className="w-full max-w-md mx-auto">
              <label
                className="block text-[10px] font-mono font-bold mb-1.5 uppercase tracking-[0.2em] text-center"
                style={{ color: theme.textMuted }}
              >
                <span style={{ color: theme.accent }}>$</span> Your Trader Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                maxLength={24}
                autoFocus
                className="w-full text-sm font-bold text-center focus:outline-none px-3 py-3"
                style={{
                  ...getCardCss(theme),
                  color: theme.textPrimary,
                  caretColor: theme.accent,
                }}
              />
            </div>

            <div className="flex flex-col">
              <p
                className="block text-[10px] font-mono font-bold mb-1.5 uppercase tracking-[0.2em] text-center"
                style={{ color: theme.textMuted }}
              >
                <span style={{ color: theme.accent }}>▲</span> Pick Your Position
              </p>
              <div className="grid grid-cols-4 gap-2.5 w-[70%] mx-auto">
                {palette.map((color) => {
                  const selected = avatarColor === color;
                  return (
                    <button
                      key={color}
                      onClick={() => setAvatarColor(color)}
                      className={`aspect-square rounded-full transition-all duration-200 relative ${
                        selected ? "scale-100" : "scale-[0.85]"
                      }`}
                      style={{
                        backgroundColor: color,
                        border: "2px solid rgba(255,255,255,0.5)",
                      }}
                      aria-label={color}
                    >
                      {selected && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center"
                            style={{
                              background: theme.accent,
                              border: `2px solid color-mix(in srgb, ${theme.textPrimary} 90%, transparent)`,
                              color:
                                theme.buttonTextMode === "light"
                                  ? "#FFFFFF"
                                  : "#1A1A1A",
                            }}
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMsg && (
              <p
                className="text-xs text-center font-medium"
                style={{ color: theme.danger }}
              >
                {errorMsg}
              </p>
            )}
          </div>

          {/* Bottom: Join button */}
          <div className="shrink-0 w-full max-w-md mx-auto">
            <Button
              variant="cta"
              onClick={handleJoin}
              loading={joining}
              disabled={!displayName.trim()}
              className="w-full"
              size="lg"
            >
              Join Game
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // Phase: playing
  if (!session || !game || !player) {
    return (
      <Shell theme={theme} paused={!!session?.is_paused}>
        <Spinner />
      </Shell>
    );
  }

  const isSpotlight = player.id === session.sm_spotlight_player_id;
  const currentQuestion = questions.find(
    (q) => q.id === session.sm_current_question_id
  );
  const myBets = bets.filter(
    (b) =>
      b.player_id === player.id &&
      b.question_id === session.sm_current_question_id
  );

  return (
    <Shell theme={theme} paused={!!session?.is_paused}>
      <div className="w-full max-w-md mx-auto px-4 py-4 h-full flex flex-col gap-3 overflow-hidden">
        <PlayerHeader player={player} score={player.score} isSpotlight={isSpotlight} theme={theme} />

        {session.sm_phase === "lobby" && (
          <LobbyView
            theme={theme}
            isSpotlight={isSpotlight}
            players={allPlayers}
            spotlightId={session.sm_spotlight_player_id}
          />
        )}

        {session.sm_phase === "spotlight_answer" && currentQuestion && (
          <SpotlightAnswerView
            theme={theme}
            isSpotlight={isSpotlight}
            session={session}
            question={currentQuestion}
            sessionId={session.id}
          />
        )}

        {session.sm_phase === "investing" && currentQuestion && !isSpotlight && (
          myBets.length > 0 ? (
            <WaitingView
              theme={theme}
              me={player}
              players={allPlayers}
              spotlightId={session.sm_spotlight_player_id}
              allBets={bets}
              questions={questions}
              currentQuestionId={currentQuestion.id}
            />
          ) : (
            <InvestingView
              theme={theme}
              session={session}
              question={currentQuestion}
              playerId={player.id}
              existingBets={myBets}
            />
          )
        )}

        {session.sm_phase === "investing" && isSpotlight && currentQuestion && (
          <SpectatorView
            theme={theme}
            text={`The room is investing in guesses about you. Your answer: "${
              session.sm_current_spotlight_answer || ""
            }"`}
          />
        )}

        {session.sm_phase === "adjudication" && (
          <SpectatorView theme={theme} text="The host is grading guesses…" />
        )}

        {session.sm_phase === "reveal" && currentQuestion && (
          <RevealView
            theme={theme}
            session={session}
            myBets={myBets}
            allBets={bets}
            players={allPlayers}
            currentQuestionId={currentQuestion.id}
            meId={player.id}
            spotlightId={session.sm_spotlight_player_id}
          />
        )}

        {session.sm_phase === "crash" && currentQuestion && !isSpotlight && (
          <CrashView
            theme={theme}
            session={session}
            playerId={player.id}
            questionId={currentQuestion.id}
            existingEvent={
              crashEvents.find(
                (e) =>
                  e.player_id === player.id &&
                  e.question_id === currentQuestion.id
              ) || null
            }
            allCrashEvents={crashEvents.filter(
              (e) => e.question_id === currentQuestion.id
            )}
            players={allPlayers}
            devMode={!!devMode}
          />
        )}
        {session.sm_phase === "crash" && isSpotlight && (
          <SpectatorView
            theme={theme}
            text="The market crashed. Watch your bettors panic."
          />
        )}

        {session.sm_phase === "leaderboard" &&
          session.status !== "finished" && (
            <LeaderboardView
              theme={theme}
              players={allPlayers.filter((p) => !p.is_removed)}
              spotlightId={session.sm_spotlight_player_id}
              meId={player.id}
            />
          )}

        {session.status === "finished" && (
          <FinishedView
            theme={theme}
            me={player}
            players={allPlayers.filter((p) => !p.is_removed)}
            spotlightId={session.sm_spotlight_player_id}
            allBets={bets}
            questions={questions}
          />
        )}
      </div>
    </Shell>
  );
}

// ─── Subviews ───

function Shell({ theme, children, paused = false }: { theme: { bg: string }; children: React.ReactNode; paused?: boolean }) {
  return (
    <div
      // h-full takes 100% of the parent (which the html/body chain sets to
      // viewport height in production, or the dev-preview frame's height in
      // the dev page). Using h-full instead of 100dvh keeps the page from
      // overflowing when it's rendered inside a fixed-size frame.
      className="h-full w-full flex items-start justify-center relative overflow-hidden"
      style={{ background: theme.bg }}
    >
      {children}
      {paused && <GamePausedOverlay />}
    </div>
  );
}

function PlayerHeader({
  player,
  score,
  isSpotlight,
  theme,
}: {
  player: SessionPlayer;
  score: number;
  isSpotlight: boolean;
  theme: GameTheme;
}) {
  const overlay = theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)";
  const top = `color-mix(in srgb, ${theme.bg} 92%, ${overlay})`;
  const bottom = `color-mix(in srgb, ${theme.bg} 86%, ${overlay})`;
  const initial = (player.display_name || "?").charAt(0).toUpperCase();
  const direction: "up" | "down" | "neutral" =
    score > 0 ? "up" : score < 0 ? "down" : "neutral";
  const scoreColor =
    direction === "up"
      ? theme.accent
      : direction === "down"
        ? theme.danger
        : theme.textPrimary;
  return (
    <div
      className="flex items-center justify-between rounded-lg border px-3.5 py-3"
      style={{
        background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`,
        borderColor: theme.border,
        boxShadow: `0 1px 2px ${theme.textPrimary}08, 0 8px 24px -12px ${theme.textPrimary}10`,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-base"
          style={{
            background: player.avatar_color,
            color: "#ffffff",
            boxShadow: `0 0 0 2px ${theme.bg}, 0 2px 6px ${player.avatar_color}55`,
          }}
        >
          {initial}
        </div>
        <div className="min-w-0">
          <p
            className="font-bold text-base leading-tight truncate"
            style={{
              color: theme.textPrimary,
              fontFamily: getFontFamily(theme.headingFont),
            }}
          >
            {player.display_name}
          </p>
          {isSpotlight ? (
            <p
              className="text-xs font-semibold mt-0.5 flex items-center gap-1"
              style={{ color: "#f59e0b" }}
            >
              <span>★</span>
              <span>Spotlight</span>
            </p>
          ) : (
            <p className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
              Trader
            </p>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs" style={{ color: theme.textMuted }}>
          Total
        </p>
        <p
          className="font-bold text-base tabular-nums leading-tight inline-flex items-baseline gap-1"
          style={{ color: scoreColor }}
        >
          {direction !== "neutral" && (
            <span className="text-[0.7em]">
              {direction === "up" ? "▲" : "▼"}
            </span>
          )}
          {formatCents(score)}
        </p>
      </div>
    </div>
  );
}

function LobbyView({
  theme,
  isSpotlight,
  players,
  spotlightId,
}: {
  theme: GameTheme;
  isSpotlight: boolean;
  players: SessionPlayer[];
  spotlightId: string | null;
}) {
  const active = players.filter((p) => !p.is_removed);
  const spotlight = active.find((p) => p.id === spotlightId) || null;
  const bettors = active.filter((p) => p.id !== spotlightId);

  const steps: { title: string; body: string }[] = isSpotlight
    ? [
        { title: "You're the subject", body: "Every round the room is trying to guess something about you." },
        { title: "Answer honestly", body: "When a question comes up, type your real answer. The room can't see it yet." },
        { title: "Watch the chaos", body: "Bettors place chips on what they think you said. Your answer is revealed last." },
        { title: "Knowability score", body: "At the end of the game you'll get a score based on how well the room knew you." },
      ]
    : [
        { title: "Each round, a question", body: "The Spotlight gets a personal question and types an answer in private." },
        { title: "Place your bets", body: "You get $100 (ten chips) per round. Spread them across guesses for what they said." },
        { title: "Reveal", body: "The Spotlight's answer is shown. Chips on the right guess get paid out; chips on wrong guesses are lost." },
        { title: "Highest total wins", body: "Whoever has the most cash after all rounds takes the night." },
      ];

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      <TickerCard theme={theme}>
        <p
          className="text-sm font-semibold text-center mb-3"
          style={{ color: theme.textPrimary }}
        >
          Waiting for host to start the game
        </p>
        {active.length === 0 ? (
          <p
            className="text-xs italic py-2"
            style={{ color: theme.textMuted }}
          >
            Waiting for players to join…
          </p>
        ) : (
          <div className="space-y-1.5">
            {spotlight && (
              <PlayerListRow
                theme={theme}
                player={spotlight}
                badge="★ Spotlight"
                badgeColor="#f59e0b"
                highlight
              />
            )}
            {bettors.length > 0 && (
              <div className="grid grid-cols-2 gap-x-1.5 gap-y-1.5">
                {bettors.map((p) => (
                  <PlayerListRow key={p.id} theme={theme} player={p} />
                ))}
              </div>
            )}
          </div>
        )}
      </TickerCard>

      <TickerCard theme={theme} title="How to play" tall>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold tabular-nums"
                style={{
                  background: theme.accent,
                  color: theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a",
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold leading-tight"
                  style={{ color: theme.textPrimary }}
                >
                  {s.title}
                </p>
                <p
                  className="text-xs mt-0.5 leading-relaxed"
                  style={{ color: theme.textMuted }}
                >
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </TickerCard>
    </div>
  );
}

function PlayerListRow({
  theme,
  player,
  badge,
  badgeColor,
  highlight = false,
}: {
  theme: GameTheme;
  player: SessionPlayer;
  badge?: string;
  badgeColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 ${highlight ? "pb-2 mb-1" : "py-1"}`}
      style={
        highlight
          ? {
              borderBottom: `1px solid color-mix(in srgb, ${theme.textPrimary} 50%, transparent)`,
            }
          : undefined
      }
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
        style={{ background: player.avatar_color, color: "#ffffff" }}
      >
        {(player.display_name || "?").charAt(0).toUpperCase()}
      </span>
      <span
        className="text-xs font-semibold truncate flex-1 min-w-0"
        style={{ color: theme.textPrimary }}
      >
        {player.display_name}
      </span>
      {badge && (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
          style={{
            background: badgeColor ? `${badgeColor}22` : `${theme.accent}22`,
            color: badgeColor || theme.accent,
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function SpotlightAnswerView({
  theme,
  isSpotlight,
  session,
  question,
  sessionId,
}: {
  theme: GameTheme;
  isSpotlight: boolean;
  session: Session;
  question: StalkMarketQuestion;
  sessionId: string;
}) {
  const [text, setText] = useState(session.sm_current_spotlight_answer || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(
    !!session.sm_current_spotlight_answer && session.sm_current_spotlight_answer !== ""
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // If a different question loaded, reset the local state.
  useEffect(() => {
    setText(session.sm_current_spotlight_answer || "");
    setSaved(
      !!session.sm_current_spotlight_answer && session.sm_current_spotlight_answer !== ""
    );
  }, [question.id, session.sm_current_spotlight_answer]);

  const remaining = session.sm_phase_end_timestamp
    ? Math.max(0, Math.ceil((new Date(session.sm_phase_end_timestamp).getTime() - now) / 1000))
    : 0;

  if (!isSpotlight) {
    return (
      <SpectatorView
        theme={theme}
        text={`Spotlight is answering: "${question.prompt}"`}
      />
    );
  }

  async function submit() {
    setSaving(true);
    await fetch("/api/sm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_spotlight_answer",
        sessionId,
        answer: text.trim(),
      }),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      <TickerCard theme={theme}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-medium" style={{ color: theme.textMuted }}>
            Your turn
          </p>
          <p
            className="text-xs font-semibold tabular-nums"
            style={{ color: theme.accent }}
          >
            {remaining}s left
          </p>
        </div>
        <p
          className="text-[15px] leading-snug font-semibold"
          style={{ color: theme.textPrimary }}
        >
          {question.prompt}
        </p>
      </TickerCard>

      <TickerCard theme={theme} title="Your answer" tall>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="Type your honest answer…"
          className="w-full px-3 py-2 rounded-md text-sm bg-transparent focus:outline-none min-h-[100px] flex-1"
          style={{
            border: `1px solid ${theme.border}`,
            color: theme.textPrimary,
          }}
          maxLength={200}
        />
        <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
          Bettors won&apos;t see this until the host reveals it.
        </p>
      </TickerCard>

      <MarketButton
        theme={theme}
        variant={saved ? "outline" : "primary"}
        onClick={submit}
        disabled={!text.trim() || saved || saving}
      >
        {saved ? "Submitted ✓" : "Submit answer"}
      </MarketButton>
    </div>
  );
}

function InvestingView({
  theme,
  session,
  question,
  playerId,
  existingBets,
}: {
  theme: GameTheme;
  session: Session;
  question: StalkMarketQuestion;
  playerId: string;
  existingBets: StalkMarketBet[];
}) {
  // Local guesses (text + chips); sync from existingBets if user already submitted
  const [guesses, setGuesses] = useState<{ text: string; chips: number }[]>(
    existingBets.length > 0
      ? existingBets.map((b) => ({ text: b.guess_text, chips: b.chips }))
      : [{ text: "", chips: 0 }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(existingBets.length > 0);

  const totalChips = guesses.reduce((s, g) => s + g.chips, 0);
  const remaining = CHIPS_PER_ROUND - totalChips;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const remainingS = session.sm_phase_end_timestamp
    ? Math.max(
        0,
        Math.ceil((new Date(session.sm_phase_end_timestamp).getTime() - now) / 1000)
      )
    : 0;

  function updateText(idx: number, text: string) {
    setGuesses((gs) => gs.map((g, i) => (i === idx ? { ...g, text } : g)));
    setSubmitted(false);
  }
  function addChip(idx: number) {
    if (remaining <= 0) return;
    setGuesses((gs) =>
      gs.map((g, i) => (i === idx ? { ...g, chips: g.chips + 1 } : g))
    );
    setSubmitted(false);
  }
  function removeChip(idx: number) {
    setGuesses((gs) =>
      gs.map((g, i) =>
        i === idx ? { ...g, chips: Math.max(0, g.chips - 1) } : g
      )
    );
    setSubmitted(false);
  }
  function addGuess() {
    if (guesses.length >= MAX_GUESSES_PER_ROUND) return;
    setGuesses([...guesses, { text: "", chips: 0 }]);
  }
  function removeGuess(idx: number) {
    setGuesses(guesses.filter((_, i) => i !== idx));
  }

  async function submit() {
    setError("");
    const valid = guesses.filter((g) => g.text.trim() && g.chips > 0);
    if (valid.length === 0) {
      setError("Place at least one guess");
      return;
    }
    if (valid.reduce((s, g) => s + g.chips, 0) !== CHIPS_PER_ROUND) {
      setError("Must place all 10 chips");
      return;
    }
    // Dedup check (case-insensitive)
    const seen = new Set<string>();
    for (const g of valid) {
      const key = g.text.trim().toLowerCase();
      if (seen.has(key)) {
        setError(`Duplicate guess: "${g.text}"`);
        return;
      }
      seen.add(key);
    }
    setSubmitting(true);
    const res = await fetch("/api/sm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit_bets",
        sessionId: session.id,
        questionId: question.id,
        playerId,
        bets: valid.map((g) => ({
          guess_text: g.text.trim(),
          chips: g.chips,
        })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Submit failed");
      return;
    }
    setSubmitted(true);
  }

  const allocated = totalChips * 10;
  const availableFmt = `$${(remaining * 10).toFixed(2)}`;
  const allocatedFmt = `$${allocated.toFixed(0)}`;
  const allocatedPct = Math.round((allocated / (CHIPS_PER_ROUND * 10)) * 100);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0" style={{ color: theme.textPrimary }}>
      {/* Question card */}
      <TickerCard theme={theme}>
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-xs font-medium" style={{ color: theme.textMuted }}>
            Round {(session.sm_current_question_order || 0) + 1}
          </p>
          <p
            className="text-xs font-semibold tabular-nums"
            style={{ color: theme.accent }}
          >
            {remainingS}s left
          </p>
        </div>
        <p
          className="text-[15px] leading-snug font-semibold"
          style={{ color: theme.textPrimary }}
        >
          {question.prompt}
        </p>
      </TickerCard>

      {/* Cash card — accent-color hero card */}
      {(() => {
        const onAccent = theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a";
        const onAccentMuted = `${onAccent === "#ffffff" ? "rgba(255,255,255,0.78)" : "rgba(26,26,26,0.7)"}`;
        const chipBg = onAccent === "#ffffff" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
        const trackBg = onAccent === "#ffffff" ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.15)";
        return (
          <section
            className="rounded-lg p-3"
            style={{
              background: `linear-gradient(180deg, ${theme.accent} 0%, color-mix(in srgb, ${theme.accent} 80%, black) 100%)`,
              boxShadow: `0 1px 2px ${theme.textPrimary}10, 0 12px 32px -16px ${theme.accent}80`,
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <p
                className="text-xs font-semibold"
                style={{ color: onAccentMuted }}
              >
                Cash left
              </p>
              {allocated > 0 && (
                <span
                  className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                  style={{ background: chipBg, color: onAccent }}
                >
                  ▲ {allocatedFmt} ({allocatedPct}%)
                </span>
              )}
            </div>
            <p
              className="text-2xl font-bold tabular-nums tracking-tight"
              style={{
                color: onAccent,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {availableFmt}
            </p>
            <p className="text-xs mt-0.5" style={{ color: onAccentMuted }}>
              {remaining} of {CHIPS_PER_ROUND} chips left · {allocatedFmt} on the table
            </p>
            <div
              className="mt-2 h-1 rounded-full overflow-hidden"
              style={{ background: trackBg }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${(totalChips / CHIPS_PER_ROUND) * 100}%`,
                  background: onAccent,
                }}
              />
            </div>
          </section>
        );
      })()}

      {/* Guesses */}
      <TickerCard
        theme={theme}
        title="Your guesses"
        tall
        action={
          <span className="text-xs" style={{ color: theme.textMuted }}>
            {guesses.length} / {MAX_GUESSES_PER_ROUND}
          </span>
        }
      >
        <div className="space-y-2">
          {guesses.map((g, idx) => (
            <div
              key={idx}
              className="rounded-md p-2.5"
              style={{
                // Nested row: stronger overlay than the parent card so it reads
                // as inset. Still derived from bg so it follows palette changes.
                background: (() => {
                  const overlay = theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)";
                  const top = `color-mix(in srgb, ${theme.bg} 86%, ${overlay})`;
                  const bottom = `color-mix(in srgb, ${theme.bg} 80%, ${overlay})`;
                  return `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
                })(),
                border: `1px solid ${theme.border}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <input
                  value={g.text}
                  onChange={(e) => updateText(idx, e.target.value)}
                  placeholder={`Guess ${idx + 1}`}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md text-sm bg-transparent focus:outline-none"
                  style={{
                    border: `1px solid ${theme.border}`,
                    color: theme.textPrimary,
                  }}
                  maxLength={60}
                />
                {guesses.length > 1 && (
                  <button
                    onClick={() => removeGuess(idx)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                    style={{
                      color: theme.textMuted,
                      border: `1px solid ${theme.border}`,
                    }}
                    title="Remove guess"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: theme.textMuted }}>
                  Bet
                </span>
                <PositionStepper
                  theme={theme}
                  onDecrement={() => removeChip(idx)}
                  onIncrement={() => addChip(idx)}
                  canDecrement={g.chips > 0}
                  canIncrement={remaining > 0}
                  label={`$${g.chips * 10}`}
                />
              </div>
            </div>
          ))}
        </div>
        {guesses.length < MAX_GUESSES_PER_ROUND && (
          <button
            onClick={addGuess}
            className="mt-2 w-full py-1.5 rounded-md text-xs font-medium"
            style={{
              color: theme.accent,
              border: `1px dashed ${theme.accent}55`,
              background: "transparent",
            }}
          >
            + Add another guess
          </button>
        )}
      </TickerCard>

      {error && (
        <p className="text-xs font-semibold" style={{ color: theme.danger }}>
          {error}
        </p>
      )}

      <MarketButton
        theme={theme}
        variant={submitted ? "outline" : "primary"}
        onClick={submit}
        disabled={remaining !== 0 || submitted || submitting}
      >
        {submitted
          ? "Locked in ✓"
          : remaining === 0
            ? "Lock in bets"
            : `Bet all $${CHIPS_PER_ROUND * 10} to lock in`}
      </MarketButton>
    </div>
  );
}

function SpectatorView({
  theme,
  text,
}: {
  theme: GameTheme;
  text: string;
}) {
  return (
    <TickerCard theme={theme} tall>
      <p
        className="text-sm text-center py-3 leading-relaxed"
        style={{ color: theme.textPrimary }}
      >
        {text}
      </p>
    </TickerCard>
  );
}

function RevealView({
  theme,
  session,
  myBets,
  allBets,
  players,
  currentQuestionId,
  meId,
  spotlightId,
}: {
  theme: GameTheme;
  session: Session;
  myBets: StalkMarketBet[];
  allBets: StalkMarketBet[];
  players: SessionPlayer[];
  currentQuestionId: string;
  meId: string;
  spotlightId: string | null;
}) {
  const stake = 10000;
  const payout = myBets.reduce((s, b) => s + b.payout_cents, 0);
  const net = payout - (myBets.length > 0 ? stake : 0);
  const netDirection: "up" | "down" | "neutral" =
    net > 0 ? "up" : net < 0 ? "down" : "neutral";

  // Per-player net for this round (everyone but the spotlight).
  const roundResults = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of allBets) {
      if (b.question_id !== currentQuestionId) continue;
      map.set(b.player_id, (map.get(b.player_id) || 0) + b.payout_cents);
    }
    return players
      .filter((p) => !p.is_removed && p.id !== spotlightId)
      .map((p) => {
        const playerPayout = map.get(p.id) || 0;
        const playerStaked = allBets.some(
          (b) => b.question_id === currentQuestionId && b.player_id === p.id
        );
        return {
          player: p,
          net: playerPayout - (playerStaked ? stake : 0),
          played: playerStaked,
        };
      })
      .sort((a, b) => b.net - a.net);
  }, [allBets, players, currentQuestionId, spotlightId]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
      <TickerCard theme={theme} title="Spotlight said">
        <p
          className="text-xl font-bold leading-tight"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          {session.sm_current_spotlight_answer || "—"}
        </p>
      </TickerCard>

      <TickerCard
        theme={theme}
        title="Your round"
        action={
          myBets.length > 0 ? (
            <PriceDelta
              theme={theme}
              amount={formatDollars(net)}
              direction={netDirection}
              size="sm"
            />
          ) : null
        }
      >
        {myBets.length === 0 ? (
          <p
            className="text-xs italic py-1"
            style={{ color: theme.textMuted }}
          >
            You didn&apos;t bet this round.
          </p>
        ) : (
          <ul className="space-y-2">
            {myBets.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 pb-2 border-b last:border-b-0 last:pb-0"
                style={{ borderColor: theme.border }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {b.is_correct ? (
                    <span
                      className="shrink-0 text-xs font-bold"
                      style={{ color: theme.accent }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: theme.textMuted }}
                    >
                      ✗
                    </span>
                  )}
                  <span
                    className="text-sm truncate"
                    style={{
                      color: b.is_correct ? theme.textPrimary : theme.textMuted,
                    }}
                  >
                    {b.guess_text}
                  </span>
                </div>
                <div className="text-right shrink-0 flex items-baseline gap-2">
                  <span
                    className="text-xs tabular-nums"
                    style={{ color: theme.textMuted }}
                  >
                    ${b.chips * 10}
                  </span>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{
                      color: b.is_correct ? theme.accent : theme.textMuted,
                    }}
                  >
                    {b.is_correct ? "+" : ""}
                    {formatDollars(b.payout_cents)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </TickerCard>

      <TickerCard theme={theme} title="This round" tall tallAlign="top">
        {roundResults.length === 0 ? (
          <p className="text-xs italic" style={{ color: theme.textMuted }}>
            No bettors this round.
          </p>
        ) : (
          <ul className="space-y-1">
            {roundResults.map((r) => {
              const isMe = r.player.id === meId;
              const dir: "up" | "down" | "neutral" =
                !r.played ? "neutral" : r.net > 0 ? "up" : r.net < 0 ? "down" : "neutral";
              return (
                <li
                  key={r.player.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                  style={{
                    background: isMe ? `${theme.accent}10` : "transparent",
                    border: `1px solid ${isMe ? `${theme.accent}50` : "transparent"}`,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                      style={{ background: r.player.avatar_color, color: "#ffffff" }}
                    >
                      {(r.player.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: theme.textPrimary }}
                    >
                      {r.player.display_name}
                      {isMe && (
                        <span
                          className="ml-1 text-xs font-normal"
                          style={{ color: theme.textMuted }}
                        >
                          · you
                        </span>
                      )}
                    </span>
                  </div>
                  {r.played ? (
                    <PriceDelta
                      theme={theme}
                      amount={formatDollars(r.net)}
                      direction={dir}
                      size="sm"
                    />
                  ) : (
                    <span
                      className="text-xs"
                      style={{ color: theme.textMuted }}
                    >
                      sat out
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </TickerCard>
    </div>
  );
}

function CrashView({
  theme,
  session,
  playerId,
  questionId,
  existingEvent,
  allCrashEvents = [],
  players = [],
  devMode = false,
}: {
  theme: GameTheme;
  session: Session;
  playerId: string;
  questionId: string;
  existingEvent: StalkMarketCrashEvent | null;
  allCrashEvents?: StalkMarketCrashEvent[];
  players?: SessionPlayer[];
  devMode?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [localResult, setLocalResult] = useState<{
    saved_cents: number;
    net_cents: number;
    cashout_ms: number | null;
  } | null>(null);
  const [devStarted, setDevStarted] = useState(false);
  const tappedRef = useRef(false);
  // Dev mode anchors the crash start when the player taps "Start Timer".
  const devStartRef = useRef<number>(0);

  // Don't show a visible timer (per spec). Just GO + CASH OUT.
  async function cashout() {
    if (tappedRef.current) return;
    tappedRef.current = true;
    setSubmitting(true);
    if (devMode) {
      const elapsedMs = Date.now() - devStartRef.current;
      const r = resolveCrash(playerId, elapsedMs);
      setLocalResult({
        saved_cents: r.saved_cents,
        net_cents: r.net_cents,
        cashout_ms: r.cashout_ms,
      });
      setSubmitting(false);
      return;
    }
    const res = await fetch("/api/sm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cashout",
        sessionId: session.id,
        questionId,
        playerId,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const d = await res.json();
      setLocalResult({
        saved_cents: d.saved_cents,
        net_cents: d.net_cents,
        cashout_ms: d.cashout_ms,
      });
    }
  }

  function resetDev() {
    setLocalResult(null);
    tappedRef.current = false;
    devStartRef.current = 0;
    setDevStarted(false);
  }

  function startDevTimer() {
    devStartRef.current = Date.now();
    setDevStarted(true);
  }

  // Force-fire a wipeout: pretend the player never tapped (cashout_ms = null).
  function devWipeout() {
    if (tappedRef.current) return;
    tappedRef.current = true;
    const r = resolveCrash(playerId, null);
    setLocalResult({
      saved_cents: r.saved_cents,
      net_cents: r.net_cents,
      cashout_ms: r.cashout_ms,
    });
  }

  const result =
    existingEvent || localResult
      ? {
          saved_cents: existingEvent?.saved_cents ?? localResult!.saved_cents,
          net_cents: existingEvent?.net_cents ?? localResult!.net_cents,
          cashout_ms: existingEvent?.cashout_ms ?? localResult!.cashout_ms,
        }
      : null;

  if (result) {
    const sec = result.cashout_ms === null ? null : (result.cashout_ms / 1000).toFixed(2);
    const isWipeout = result.cashout_ms === null;
    const isPrecision =
      !isWipeout &&
      result.cashout_ms !== null &&
      result.cashout_ms >= 9000 &&
      result.cashout_ms < 10000;
    const stakeCents = 10000;
    const netColor = theme.textPrimary;
    // Other players' cash-outs, sorted by most recent first.
    const otherCashouts = [...allCrashEvents]
      .filter((e) => e.player_id !== playerId)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    return (
      <TickerCard theme={theme} tall>
        <div className="space-y-4 py-2">
          {/* Status header */}
          <div className="text-center">
            <p
              className="text-lg font-bold"
              style={{
                color: isWipeout ? theme.danger : theme.textPrimary,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {isWipeout ? "Wipeout" : `Cashed out at ${sec}s`}
            </p>
            {isWipeout && (
              <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                You didn&apos;t cash out in time.
              </p>
            )}
            {isPrecision && (
              <p
                className="text-xs font-semibold mt-1 inline-flex items-center gap-1"
                style={{ color: theme.accent }}
              >
                <span>★</span>
                <span>Precision bonus · 1.5× payout</span>
              </p>
            )}
          </div>

          {/* Calculation receipt */}
          {(() => {
            const lossCents = stakeCents - result.saved_cents;
            const overAge = -lossCents; // positive when precision bonus carries them past their stake
            return (
              <div
                className="rounded-md p-3 space-y-2"
                style={{
                  background: `linear-gradient(180deg, ${theme.bg} 0%, color-mix(in srgb, ${theme.bg} 86%, ${theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)"}) 100%)`,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div className="flex items-baseline justify-between text-sm">
                  <span style={{ color: theme.textMuted }}>Investment</span>
                  <span
                    className="tabular-nums font-medium"
                    style={{ color: theme.textPrimary }}
                  >
                    {formatDollars(stakeCents)}
                  </span>
                </div>
                {lossCents > 0 && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span style={{ color: theme.textMuted }}>Loss</span>
                    <span
                      className="tabular-nums font-medium"
                      style={{ color: theme.textPrimary }}
                    >
                      −{formatDollars(lossCents)}
                    </span>
                  </div>
                )}
                {overAge > 0 && (
                  <div className="flex items-baseline justify-between text-sm">
                    <span style={{ color: theme.textMuted }}>
                      {isPrecision ? "Precision bonus" : "Bonus"}
                    </span>
                    <span
                      className="tabular-nums font-medium"
                      style={{ color: theme.accent }}
                    >
                      +{formatDollars(overAge)}
                    </span>
                  </div>
                )}
                <div className="h-px" style={{ background: theme.border }} />
                <div className="flex items-baseline justify-between">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: theme.textPrimary }}
                  >
                    Earned
                  </span>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: netColor }}
                  >
                    +{formatDollars(result.saved_cents)}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Live cash-outs from the rest of the room */}
          <div>
            <p
              className="text-xs font-semibold mb-2 text-center"
              style={{ color: theme.textMuted }}
            >
              Others who cashed out
            </p>
            {otherCashouts.length === 0 ? (
              <p
                className="text-xs italic text-center"
                style={{ color: theme.textMuted }}
              >
                No one else has cashed out yet…
              </p>
            ) : (
              <ul className="space-y-1.5">
                {otherCashouts.map((e) => {
                  const p = players.find((pl) => pl.id === e.player_id);
                  if (!p) return null;
                  const otherSec =
                    e.cashout_ms === null
                      ? null
                      : (e.cashout_ms / 1000).toFixed(2);
                  const isWipe = e.cashout_ms === null;
                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md"
                      style={{
                        background: `linear-gradient(180deg, ${theme.bg} 0%, color-mix(in srgb, ${theme.bg} 86%, ${theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)"}) 100%)`,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                          style={{
                            background: p.avatar_color,
                            color: "#ffffff",
                          }}
                        >
                          {(p.display_name || "?").charAt(0).toUpperCase()}
                        </span>
                        <span
                          className="text-sm font-semibold truncate"
                          style={{ color: theme.textPrimary }}
                        >
                          {p.display_name}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0">
                        <span
                          className="text-xs tabular-nums"
                          style={{ color: theme.textMuted }}
                        >
                          {isWipe ? "wipe" : `${otherSec}s`}
                        </span>
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{
                            color: isWipe
                              ? theme.textMuted
                              : theme.textPrimary,
                          }}
                        >
                          +{formatDollars(e.saved_cents)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {devMode && !existingEvent && (
            <div className="text-center">
              <button
                onClick={resetDev}
                className="text-xs underline opacity-70 hover:opacity-100"
                style={{ color: theme.textPrimary }}
              >
                ↺ Try again
              </button>
            </div>
          )}
        </div>
      </TickerCard>
    );
  }

  const crashHeader = (
    <TickerCard theme={theme}>
      <div className="text-center">
        <svg
          className="w-7 h-7 mx-auto mb-1.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: theme.textPrimary }}
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p
          className="text-lg font-bold tracking-tight"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          Uh oh!
        </p>
        <p
          className="text-xs leading-relaxed mt-1"
          style={{ color: theme.textMuted }}
        >
          The market is crashing! No successful bets were placed, but you may
          still be able to recover some of your investment for this round.
        </p>
      </div>
    </TickerCard>
  );

  // Dev mode: gate the GO + Cash Out screen behind an explicit Start Timer tap
  // so the tester knows the exact moment the count begins.
  if (devMode && !devStarted) {
    return (
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
        {crashHeader}
        <TickerCard theme={theme}>
          <div className="text-center space-y-3 py-2">
            <p
              className="text-base font-semibold"
              style={{ color: theme.textPrimary }}
            >
              Ready?
            </p>
            <div
              className="text-xs leading-relaxed space-y-2 text-center"
              style={{ color: theme.textMuted }}
            >
              <p>
                When you tap Start, the market will crash in{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  exactly 10 seconds
                </strong>
                .
              </p>
              <p>
                The problem? There&apos;s{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  no countdown clock
                </strong>{" "}
                and your{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  $100 for the round
                </strong>{" "}
                is on the line.
              </p>
              <p>
                Every second you hold on, your{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  payout climbs higher
                </strong>
                . Cash out too early and you{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  leave money on the table
                </strong>
                ; wait too long and the{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  crash takes it all
                </strong>
                .
              </p>
              <p>
                Want to risk it for the reward? Cash out between{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  9–10 seconds
                </strong>{" "}
                for a{" "}
                <strong className="font-semibold" style={{ color: theme.textPrimary }}>
                  bonus payout
                </strong>
                !
              </p>
            </div>
            <button
              onClick={startDevTimer}
              className="w-full py-3 rounded-full text-sm font-semibold active:scale-[0.99] transition"
              style={{
                background: theme.accent,
                color: theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a",
              }}
            >
              Start timer
            </button>
          </div>
        </TickerCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <TickerCard theme={theme} tall>
        <div className="text-center space-y-3 py-2">
          <CrashSpinner color={theme.danger} />
          <p className="text-xs" style={{ color: theme.textMuted }}>
            Market is crashing! Press cash out before the <span className="font-semibold" style={{ color: theme.textPrimary }}>10 second timer</span> is up to save your investment for this round.
          </p>
          <button
            onClick={cashout}
            disabled={submitting}
            className="cashout-pulse-btn w-full py-3 rounded-full text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition my-3"
            style={{
              background: theme.danger,
              color: "#ffffff",
            }}
          >
            Cash out
          </button>
          <style>{`
            @keyframes cashout-pulse-glow {
              0%, 100% {
                box-shadow:
                  0 0 0 0 ${theme.danger}55,
                  0 4px 12px ${theme.danger}30;
              }
              50% {
                box-shadow:
                  0 0 0 12px ${theme.danger}00,
                  0 4px 22px ${theme.danger}80;
              }
            }
            .cashout-pulse-btn:not(:disabled) {
              animation: cashout-pulse-glow 1.6s ease-in-out infinite;
            }
          `}</style>
          {devMode && (
            <button
              onClick={devWipeout}
              className="text-[11px] underline opacity-60 hover:opacity-100"
              style={{ color: theme.textPrimary }}
            >
              Force wipeout (test)
            </button>
          )}
        </div>
      </TickerCard>
    </div>
  );
}

function LeaderboardView({
  theme,
  players,
  spotlightId,
  meId,
}: {
  theme: GameTheme;
  players: SessionPlayer[];
  spotlightId: string | null;
  meId: string;
}) {
  const sorted = [...players]
    .filter((p) => p.id !== spotlightId)
    .sort((a, b) => b.score - a.score);
  return (
    <TickerCard theme={theme} title="Standings" tall>
      <div className="space-y-1">
        {sorted.map((p, i) => {
          const isMe = p.id === meId;
          const direction: "up" | "down" | "neutral" =
            p.score > 0 ? "up" : p.score < 0 ? "down" : "neutral";
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 px-2 py-2 rounded-md"
              style={{
                background: isMe ? `${theme.accent}10` : "transparent",
                border: isMe
                  ? `1px solid ${theme.accent}50`
                  : "1px solid transparent",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-xs font-semibold tabular-nums w-5 text-center"
                  style={{ color: theme.textMuted }}
                >
                  {i + 1}
                </span>
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                  style={{
                    background: p.avatar_color,
                    color: "#ffffff",
                  }}
                >
                  {(p.display_name || "?").charAt(0).toUpperCase()}
                </span>
                <span
                  className="text-sm font-semibold truncate"
                  style={{ color: theme.textPrimary }}
                >
                  {p.display_name}
                  {isMe && (
                    <span
                      className="ml-1 text-xs font-normal"
                      style={{ color: theme.textMuted }}
                    >
                      · you
                    </span>
                  )}
                </span>
              </div>
              <PriceDelta
                theme={theme}
                amount={formatDollars(p.score)}
                direction={direction}
                size="sm"
              />
            </div>
          );
        })}
      </div>
    </TickerCard>
  );
}

function WaitingView(props: {
  theme: GameTheme;
  me: SessionPlayer;
  players: SessionPlayer[];
  spotlightId: string | null;
  allBets: StalkMarketBet[];
  questions: StalkMarketQuestion[];
  currentQuestionId: string;
}) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <TickerCard theme={props.theme}>
        <div className="flex flex-col items-center gap-1.5 py-1">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: props.theme.accent }}
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p
            className="text-sm font-semibold"
            style={{ color: props.theme.textPrimary }}
          >
            Locked in
          </p>
          <p
            className="text-xs text-center"
            style={{ color: props.theme.textMuted }}
          >
            Waiting on the host to reveal the round.
          </p>
        </div>
      </TickerCard>
      <BetsAndStandingsTabs {...props} hideUntilRevealed={props.currentQuestionId} />
    </div>
  );
}

function BetsAndStandingsTabs({
  theme,
  me,
  players,
  spotlightId,
  allBets,
  questions,
  currentQuestionId,
  hideUntilRevealed,
}: {
  theme: GameTheme;
  me: SessionPlayer;
  players: SessionPlayer[];
  spotlightId: string | null;
  allBets: StalkMarketBet[];
  questions: StalkMarketQuestion[];
  currentQuestionId?: string | null;
  /** When set, that question's bets are shown but graded results are hidden so the player can't peek before the reveal. */
  hideUntilRevealed?: string | null;
}) {
  const [tab, setTab] = useState<"bets" | "board">("bets");

  // Group my bets by question, in question_order.
  const myBets = useMemo(() => allBets.filter((b) => b.player_id === me.id), [allBets, me.id]);
  const rounds = useMemo(() => {
    const byQ = new Map<string, StalkMarketBet[]>();
    for (const b of myBets) {
      const arr = byQ.get(b.question_id) ?? [];
      arr.push(b);
      byQ.set(b.question_id, arr);
    }
    type Row = {
      question: StalkMarketQuestion;
      bets: StalkMarketBet[];
      stake: number;
      payout: number;
      isCurrent: boolean;
      revealed: boolean;
    };
    const rows: Row[] = [];
    for (const [qid, bets] of byQ.entries()) {
      const q = questions.find((qq) => qq.id === qid);
      if (!q) continue;
      const isCurrent = qid === currentQuestionId;
      const fullyRevealed = bets.some((b) => b.is_correct !== null);
      const revealed = hideUntilRevealed === qid ? false : fullyRevealed;
      rows.push({
        question: q,
        bets,
        stake: bets.length > 0 ? 10000 : 0,
        payout: bets.reduce((s, b) => s + b.payout_cents, 0),
        isCurrent,
        revealed,
      });
    }
    return rows.sort((a, b) => a.question.question_order - b.question.question_order);
  }, [myBets, questions, currentQuestionId, hideUntilRevealed]);

  const direction: "up" | "down" | "neutral" =
    me.score > 0 ? "up" : me.score < 0 ? "down" : "neutral";

  function TabButton({ value, label }: { value: "bets" | "board"; label: string }) {
    const active = tab === value;
    return (
      <button
        type="button"
        onClick={() => setTab(value)}
        className="flex-1 py-2 rounded-full text-xs font-semibold transition"
        style={{
          background: active ? theme.accent : "transparent",
          color: active
            ? theme.buttonTextMode === "light"
              ? "#ffffff"
              : "#1a1a1a"
            : theme.textMuted,
          border: `1px solid ${active ? theme.accent : theme.border}`,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <div className="flex gap-2 shrink-0">
        <TabButton value="bets" label="Your bets" />
        <TabButton value="board" label="Standings" />
      </div>

      {tab === "bets" ? (
        <TickerCard
          theme={theme}
          tall
          tallAlign="top"
          title="Running total"
          action={
            <PriceDelta
              theme={theme}
              amount={formatDollars(me.score)}
              direction={direction}
              size="sm"
            />
          }
        >
          {rounds.length === 0 ? (
            <p className="text-xs italic" style={{ color: theme.textMuted }}>
              No bets placed yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {rounds.map((r) => {
                const net = r.payout - r.stake;
                const rDir: "up" | "down" | "neutral" =
                  !r.revealed
                    ? "neutral"
                    : net > 0
                      ? "up"
                      : net < 0
                        ? "down"
                        : "neutral";
                return (
                  <div
                    key={r.question.id}
                    className="rounded-md p-2.5"
                    style={{
                      background: `linear-gradient(180deg, ${theme.bg} 0%, color-mix(in srgb, ${theme.bg} 86%, ${theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)"}) 100%)`,
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <p
                        className="text-xs font-semibold flex-1 truncate"
                        style={{ color: theme.textMuted }}
                      >
                        Round {r.question.question_order + 1}
                        {r.isCurrent && " · this round"}
                      </p>
                      {r.revealed ? (
                        <PriceDelta
                          theme={theme}
                          amount={formatDollars(net)}
                          direction={rDir}
                          size="sm"
                        />
                      ) : (
                        <span
                          className="text-xs font-semibold"
                          style={{ color: theme.textMuted }}
                        >
                          Pending
                        </span>
                      )}
                    </div>
                    <p
                      className="text-xs mb-1.5 truncate"
                      style={{ color: theme.textPrimary }}
                    >
                      {r.question.prompt}
                    </p>
                    <div className="space-y-0.5">
                      {r.bets.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-baseline justify-between text-xs"
                        >
                          <span
                            className="truncate flex items-center gap-1.5"
                            style={{
                              color:
                                r.revealed && b.is_correct === true
                                  ? theme.accent
                                  : r.revealed && b.is_correct === false
                                    ? theme.textMuted
                                    : theme.textPrimary,
                            }}
                          >
                            {r.revealed && b.is_correct === true && <span>✓</span>}
                            {r.revealed && b.is_correct === false && <span>✗</span>}
                            {b.guess_text}
                          </span>
                          <span
                            className="tabular-nums shrink-0"
                            style={{ color: theme.textMuted }}
                          >
                            ${b.chips * 10}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TickerCard>
      ) : (
        <LeaderboardView
          theme={theme}
          players={players}
          spotlightId={spotlightId}
          meId={me.id}
        />
      )}
    </div>
  );
}

function FinishedView({
  theme,
  me,
  players,
  spotlightId,
  allBets,
  questions,
}: {
  theme: GameTheme;
  me: SessionPlayer;
  players: SessionPlayer[];
  spotlightId: string | null;
  allBets: StalkMarketBet[];
  questions: StalkMarketQuestion[];
}) {
  const totalCents = allBets.reduce((s, b) => s + b.chips * 1000, 0);
  const correctCents = allBets
    .filter((b) => b.is_correct)
    .reduce((s, b) => s + b.chips * 1000, 0);
  const knowability = totalCents === 0 ? 0 : Math.round((correctCents / totalCents) * 100);
  const isSpotlight = me.id === spotlightId;
  const spotlight = players.find((p) => p.id === spotlightId);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <TickerCard theme={theme}>
        <p className="text-xs" style={{ color: theme.textMuted }}>
          Game over
        </p>
        {spotlight && (
          <>
            <div className="flex items-baseline gap-2 mt-1">
              <PriceQuote theme={theme} amount={`${knowability}%`} size="lg" />
              <span className="text-xs" style={{ color: theme.textMuted }}>
                Knowability of {spotlight.display_name}
              </span>
            </div>
            <div
              className="mt-2 h-1 rounded-full overflow-hidden"
              style={{ background: `${theme.textPrimary}10` }}
            >
              <div
                className="h-full"
                style={{
                  width: `${knowability}%`,
                  background: theme.accent,
                }}
              />
            </div>
          </>
        )}
        {isSpotlight && (
          <p className="text-xs mt-2" style={{ color: theme.textMuted }}>
            {knowability >= 60
              ? "The room knows you well."
              : knowability >= 30
                ? "You kept them guessing."
                : "Beautiful enigma."}
          </p>
        )}
      </TickerCard>

      <BetsAndStandingsTabs
        theme={theme}
        me={me}
        players={players}
        spotlightId={spotlightId}
        allBets={allBets}
        questions={questions}
      />
    </div>
  );
}
