"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { subscribeToSession, unsubscribe } from "@/lib/realtime";
import { useGameTheme } from "@/lib/theme-context";
import {
  formatCents,
  CRASH_DURATION_MS,
  normalizeGuess,
} from "@/lib/sm-scoring";
import { GamePausedOverlay } from "@/components/games/GamePausedOverlay";
import { getFontFamily } from "@/lib/theme-fonts";
import { useServerTimeOffset } from "@/lib/server-time";
import type {
  Game,
  GameTheme,
  Session,
  SessionPlayer,
  StalkMarketBet,
  StalkMarketCrashEvent,
  StalkMarketQuestion,
} from "@/lib/types";

function formatDollarsScreen(cents: number): string {
  const dollars = Math.round(cents / 100);
  const sign = dollars < 0 ? "−" : "";
  return `${sign}$${Math.abs(dollars).toLocaleString()}`;
}

// Bg-derived card gradient — same pattern used in PlayerPage/MarketUI so the
// screen view shares the trading-app card language.
function cardGradient(theme: GameTheme) {
  const overlay = theme.mode === "dark" ? "rgb(255,255,255)" : "rgb(0,0,0)";
  const top = `color-mix(in srgb, ${theme.bg} 92%, ${overlay})`;
  const bottom = `color-mix(in srgb, ${theme.bg} 86%, ${overlay})`;
  return `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
}

export interface SMScreenDevMode {
  session?: Session | null;
  game?: Game | null;
  players?: SessionPlayer[];
  questions?: StalkMarketQuestion[];
  bets?: StalkMarketBet[];
  crashEvents?: StalkMarketCrashEvent[];
}

interface Props {
  sessionCode: string;
  devMode?: SMScreenDevMode;
}

export default function StalkMarketScreenPage({ sessionCode, devMode }: Props) {
  const theme = useGameTheme();
  const [session, setSession] = useState<Session | null>(devMode?.session ?? null);
  const [game, setGame] = useState<Game | null>(devMode?.game ?? null);
  const [players, setPlayers] = useState<SessionPlayer[]>(devMode?.players ?? []);
  const [questions, setQuestions] = useState<StalkMarketQuestion[]>(devMode?.questions ?? []);
  const [bets, setBets] = useState<StalkMarketBet[]>(devMode?.bets ?? []);
  const [crashEvents, setCrashEvents] = useState<StalkMarketCrashEvent[]>(devMode?.crashEvents ?? []);
  const [loading, setLoading] = useState(!devMode);

  const refresh = useCallback(async (sid?: string) => {
    if (devMode) return;
    const supabase = createClient();
    const code = sessionCode.toUpperCase();

    async function loadBetsAndPlayers(id: string) {
      const { data: ps } = await supabase
        .from("session_players")
        .select("*")
        .eq("session_id", id);
      setPlayers((ps || []) as SessionPlayer[]);
      const { data: bs } = await supabase
        .from("stalk_market_bets")
        .select("*")
        .eq("session_id", id);
      setBets((bs || []) as StalkMarketBet[]);
      const { data: cs } = await supabase
        .from("stalk_market_crash_events")
        .select("*")
        .eq("session_id", id);
      setCrashEvents((cs || []) as StalkMarketCrashEvent[]);
    }

    if (!sid) {
      const { data: s } = await supabase
        .from("sessions")
        .select("*")
        .eq("code", code)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s as Session);
      const { data: g } = await supabase
        .from("games")
        .select("*")
        .eq("id", s.game_id)
        .single();
      if (g) setGame(g as Game);
      const { data: qs } = await supabase
        .from("stalk_market_questions")
        .select("*")
        .eq("game_id", s.game_id)
        .order("question_order", { ascending: true });
      setQuestions((qs || []) as StalkMarketQuestion[]);
      await loadBetsAndPlayers(s.id);
      setLoading(false);
      return;
    }
    const { data: s } = await supabase.from("sessions").select("*").eq("id", sid).single();
    if (s) setSession(s as Session);
    await loadBetsAndPlayers(sid);
  }, [sessionCode, devMode]);

  useEffect(() => {
    if (devMode) return;
    refresh();
  }, [refresh, devMode]);

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
  }, [session, refresh, devMode]);

  const currentQuestion = useMemo(
    () => questions.find((q) => q.id === session?.sm_current_question_id) || null,
    [questions, session]
  );
  const spotlight = useMemo(
    () => players.find((p) => p.id === session?.sm_spotlight_player_id) || null,
    [players, session]
  );
  const bettors = useMemo(
    () =>
      players.filter(
        (p) => !p.is_removed && p.id !== session?.sm_spotlight_player_id
      ),
    [players, session]
  );

  if (loading || !session || !game) {
    return (
      <div className="h-full w-full flex items-center justify-center" style={{ background: theme.bg }}>
        <Spinner />
      </div>
    );
  }

  const phase = session.sm_phase;

  return (
    <div
      className="h-full w-full flex items-center justify-center relative overflow-hidden"
      style={{
        background: theme.bg,
        color: theme.textPrimary,
        containerType: "size",
      }}
    >
      <div
        className="flex flex-col p-8 overflow-hidden"
        style={{
          // Lock to 16:9 within the available space. Whichever dimension is
          // tighter (container width vs height) wins; the other dimension is
          // computed from the aspect ratio so the screen always fits cleanly.
          width: "min(100cqw, calc(100cqh * 16 / 9))",
          aspectRatio: "16 / 9",
        }}
      >
        {phase !== "lobby" &&
          phase !== "investing" &&
          phase !== "adjudication" &&
          phase !== "reveal" &&
          phase !== "leaderboard" &&
          phase !== "crash" &&
          session.status !== "finished" && (
            <ScreenHeader
              theme={theme}
              title={game.title}
              spotlight={spotlight}
              currentOrder={session.sm_current_question_order || 0}
              total={questions.length}
              code={session.code}
              showCode={false}
            />
          )}

        <div
          className={`flex-1 flex flex-col min-h-0 overflow-hidden ${
            phase === "lobby" ||
            phase === "investing" ||
            phase === "adjudication" ||
            phase === "reveal" ||
            phase === "leaderboard" ||
            phase === "crash" ||
            session.status === "finished"
              ? ""
              : "items-center justify-center mt-6"
          }`}
        >
        {phase === "lobby" && session.status !== "finished" && (
          <LobbyScreen
            theme={theme}
            players={bettors}
            spotlight={spotlight}
            code={session.code}
            gameTitle={game.title}
          />
        )}
        {phase === "spotlight_answer" && session.status !== "finished" && currentQuestion && (
          <SpotlightAnswerScreen theme={theme} question={currentQuestion} spotlight={spotlight} />
        )}
        {(phase === "investing" || phase === "adjudication") &&
          session.status !== "finished" &&
          currentQuestion && (
            <InvestingScreen
              theme={theme}
              question={currentQuestion}
              bets={bets.filter((b) => b.question_id === currentQuestion.id)}
              bettors={bettors}
              endsAt={session.sm_phase_end_timestamp}
              totalSeconds={game.timer_seconds || 60}
              gameTitle={game.title}
              roundOrder={session.sm_current_question_order || 0}
              totalRounds={questions.length}
            />
          )}
        {phase === "reveal" && session.status !== "finished" && currentQuestion && (
          <RevealScreen
            theme={theme}
            question={currentQuestion}
            spotlightAnswer={session.sm_current_spotlight_answer || ""}
            bets={bets.filter((b) => b.question_id === currentQuestion.id)}
            players={players}
            gameTitle={game.title}
            roundOrder={session.sm_current_question_order || 0}
            totalRounds={questions.length}
          />
        )}
        {phase === "crash" && session.status !== "finished" && (
          <CrashScreen
            theme={theme}
            crashStartedAt={session.sm_crash_start_timestamp}
            crashEvents={crashEvents.filter(
              (c) => c.question_id === session.sm_current_question_id
            )}
            bettors={bettors}
            players={players}
            gameTitle={game.title}
            roundOrder={session.sm_current_question_order || 0}
            totalRounds={questions.length}
          />
        )}
        {phase === "leaderboard" && session.status !== "finished" && (
          <LeaderboardScreen
            theme={theme}
            players={bettors}
            gameTitle={game.title}
            roundOrder={session.sm_current_question_order || 0}
            totalRounds={questions.length}
          />
        )}
        {session.status === "finished" && (
          <FinishedScreen
            theme={theme}
            players={bettors}
            spotlight={spotlight}
            bets={bets}
          />
        )}
        </div>
      </div>
      {session.is_paused && <GamePausedOverlay />}
    </div>
  );
}

// ─── Subviews ───

function ScreenHeader({
  theme,
  title,
  spotlight,
  currentOrder,
  total,
  code,
  showCode,
}: {
  theme: GameTheme;
  title: string;
  spotlight: SessionPlayer | null;
  currentOrder: number;
  total: number;
  code: string;
  showCode: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <p className="text-base" style={{ color: theme.textMuted }}>
          Stalk Market
        </p>
        <h1
          className="text-4xl font-bold tracking-tight leading-tight"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          {title}
        </h1>
        {spotlight && (
          <p className="mt-1 text-lg" style={{ color: theme.textMuted }}>
            <span style={{ color: "#f59e0b" }}>★</span> Spotlight{" "}
            <span style={{ color: theme.textPrimary, fontWeight: 700 }}>
              {spotlight.display_name}
            </span>
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        {showCode ? (
          <>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              Join code
            </p>
            <p
              className="text-5xl font-bold tabular-nums tracking-tight"
              style={{
                color: theme.textPrimary,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {code}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: theme.textMuted }}>
              Round
            </p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{ color: theme.textPrimary }}
            >
              {currentOrder + 1} <span style={{ color: theme.textMuted }}>/ {total}</span>
            </p>
          </>
        )}
      </div>
    </header>
  );
}

function LobbyScreen({
  theme,
  players,
  spotlight,
  code,
  gameTitle,
}: {
  theme: GameTheme;
  players: SessionPlayer[];
  spotlight: SessionPlayer | null;
  code: string;
  gameTitle: string;
}) {
  const joinUrl =
    typeof window !== "undefined" ? `${window.location.host}/play` : "heyhostgames.com/play";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    typeof window !== "undefined" ? `${window.location.origin}/play/${code}` : ""
  )}`;
  const allPlayers = spotlight ? [spotlight, ...players] : players;

  return (
    <div className="flex-1 min-h-0 flex gap-6">
      {/* Col 1 — chart (with title overlay) + active players, equal height */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 gap-4">
        <div
          className="flex-1 min-h-0 rounded-2xl overflow-hidden relative"
          style={{
            background: cardGradient(theme),
            border: `1px solid ${theme.border}`,
          }}
        >
          <MarketLobbyChart theme={theme} />
          {/* Title overlaid in the top-left of the chart box */}
          <div
            className="absolute top-4 left-4 z-10 inline-flex items-baseline gap-2 px-4 py-2 rounded-full backdrop-blur-sm"
            style={{
              background: `color-mix(in srgb, ${theme.bg} 82%, transparent)`,
              border: `1px solid ${theme.border}`,
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: theme.textMuted }}
            >
              Stalk Market: Investing in
            </p>
            <h1
              className="text-base font-bold tracking-[-0.01em] truncate"
              style={{
                color: theme.textPrimary,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {gameTitle}
            </h1>
          </div>
        </div>

        <div
          className="flex-1 min-h-0 rounded-2xl p-6 flex flex-col overflow-hidden"
          style={{
            background: cardGradient(theme),
            border: `1px solid ${theme.border}`,
          }}
        >
          <h2
            className="text-lg font-semibold mb-4 shrink-0"
            style={{ color: theme.textPrimary }}
          >
            Active Players
          </h2>
          {allPlayers.length > 0 ? (
            <div className="grid grid-cols-3 gap-x-4 gap-y-4 overflow-y-auto">
              {allPlayers.map((p) => {
                const isSpot = p.id === spotlight?.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2.5 min-w-0"
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                      style={{ background: p.avatar_color, color: "#ffffff" }}
                    >
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold uppercase tracking-wide truncate"
                        style={{ color: theme.textPrimary }}
                      >
                        {p.display_name}
                      </p>
                      {isSpot && (
                        <p
                          className="text-[9px] font-bold uppercase tracking-wider"
                          style={{ color: "#d97706" }}
                        >
                          ★ Spotlight
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xl" style={{ color: theme.textMuted }}>
              Waiting for players to join…
            </p>
          )}
        </div>
      </div>

      {/* Col 2 — join card with QR */}
      <div className="w-[28%] shrink-0 flex flex-col min-h-0">
        <div
          className="flex-1 min-h-0 w-full text-center rounded-2xl overflow-hidden flex flex-col justify-center"
          style={{
            background: cardGradient(theme),
            border: `1px solid ${theme.border}`,
            color: theme.textPrimary,
          }}
        >
          <div className="px-6 py-8">
            <p className="text-lg font-bold uppercase tracking-wider mb-3">
              Join the Game
            </p>
            <div
              className="border-t border-dashed my-3"
              style={{
                borderColor: `color-mix(in srgb, ${theme.textPrimary} 22%, transparent)`,
              }}
            />
            <p
              className="text-base mb-1"
              style={{ color: theme.textMuted }}
            >
              Scan the QR code or visit
            </p>
            <p className="text-base mb-4">
              <strong>{joinUrl}</strong> and enter the code below
            </p>
            <p
              className="text-xs uppercase tracking-wider mb-1"
              style={{ color: theme.textMuted }}
            >
              Game Code
            </p>
            <p
              className="text-5xl font-bold tracking-[0.15em] mb-4 tabular-nums"
              style={{
                color: theme.accent,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {code}
            </p>
            <div
              className="inline-block p-3 rounded-xl mx-auto"
              style={{ background: "#ffffff" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="QR Code" className="w-44 h-44 block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketLobbyChart({ theme }: { theme: GameTheme }) {
  // Chart.js-style "progressive line": the chart starts empty and the lines
  // are drawn left-to-right one point at a time. Once they reach the right
  // edge, the chart resets and starts over.
  const MAX_POINTS = 140;
  const TICK_MS = 80;
  const HEIGHT = 80;
  const WIDTH = 200;
  const STEP = WIDTH / (MAX_POINTS - 1);
  const MID = HEIGHT * 0.5;

  const nextPoint = (last: number) => {
    const delta = (Math.random() - 0.5) * 0.18 * HEIGHT;
    const meanReversion = (MID - last) * 0.04;
    return Math.max(6, Math.min(HEIGHT - 6, last + delta + meanReversion));
  };

  const [greenPoints, setGreenPoints] = useState<number[]>([MID]);
  const [redPoints, setRedPoints] = useState<number[]>([MID]);

  useEffect(() => {
    const id = setInterval(() => {
      setGreenPoints((prev) =>
        prev.length >= MAX_POINTS
          ? [MID]
          : [...prev, nextPoint(prev[prev.length - 1])]
      );
      setRedPoints((prev) =>
        prev.length >= MAX_POINTS
          ? [MID]
          : [...prev, nextPoint(prev[prev.length - 1])]
      );
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPath = (pts: number[]) =>
    pts.map((y, i) => `${i === 0 ? "M" : "L"} ${i * STEP} ${y}`).join(" ");
  const greenPath = buildPath(greenPoints);
  const redPath = buildPath(redPoints);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Faint background grid (vertical + horizontal) */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke={theme.textPrimary}
            strokeWidth="0.12"
            opacity="0.09"
          />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2="100"
            stroke={theme.textPrimary}
            strokeWidth="0.12"
            opacity="0.09"
          />
        ))}
      </svg>
      {/* Two lines being drawn from left to right */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        <path
          d={greenPath}
          fill="none"
          stroke={theme.accent}
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={redPath}
          fill="none"
          stroke={theme.danger}
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function SpotlightAnswerScreen({
  theme,
  question,
  spotlight,
}: {
  theme: GameTheme;
  question: StalkMarketQuestion;
  spotlight: SessionPlayer | null;
}) {
  return (
    <div className="text-center max-w-4xl">
      <p className="text-xl mb-4" style={{ color: theme.textMuted }}>
        {spotlight?.display_name || "Spotlight"} is answering
      </p>
      <h2
        className="text-6xl font-bold leading-tight tracking-tight"
        style={{
          color: theme.textPrimary,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        {question.prompt}
      </h2>
      <div className="flex justify-center gap-2 mt-12">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-3 h-3 rounded-full animate-pulse"
            style={{
              background: theme.accent,
              animationDelay: `${i * 200}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenToolbar({
  theme,
  gameTitle,
  roundOrder,
  totalRounds,
  right,
}: {
  theme: GameTheme;
  gameTitle: string;
  roundOrder: number;
  totalRounds: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-4 px-2 py-1">
      <div
        className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
        style={{
          background: `color-mix(in srgb, ${theme.textPrimary} 10%, transparent)`,
          color: theme.textPrimary,
        }}
      >
        Round {roundOrder + 1} of {totalRounds}
      </div>
      <p
        className="flex-1 text-center text-base font-semibold truncate"
        style={{ color: theme.textPrimary }}
      >
        <span style={{ color: theme.textMuted, fontWeight: 500 }}>
          Stalk Market: Investing in
        </span>{" "}
        {gameTitle}
      </p>
      <div className="min-w-[60px] flex justify-end">{right}</div>
    </div>
  );
}

function CircularTimer({
  remaining,
  total,
  started,
  theme,
}: {
  remaining: number;
  total: number;
  started: boolean;
  theme: GameTheme;
}) {
  const size = 96;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = started ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = circumference * (1 - progress);
  const trackColor = `color-mix(in srgb, ${theme.textPrimary} 12%, transparent)`;
  return (
    <div
      className="relative rounded-full"
      style={{
        width: size,
        height: size,
        background: cardGradient(theme),
        border: `1px solid ${theme.border}`,
        boxShadow: `0 4px 16px -4px ${theme.textPrimary}1f`,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {started ? (
          <>
            <span
              className="text-4xl font-bold tabular-nums"
              style={{
                color: theme.textPrimary,
                fontFamily: getFontFamily(theme.headingFont),
              }}
            >
              {remaining}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em] mt-1"
              style={{ color: theme.textMuted }}
            >
              sec
            </span>
          </>
        ) : (
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-center px-2"
            style={{ color: theme.textMuted }}
          >
            Get<br />ready
          </span>
        )}
      </div>
    </div>
  );
}

function InvestingScreen({
  theme,
  question,
  bets,
  bettors,
  endsAt,
  totalSeconds,
  gameTitle,
  roundOrder,
  totalRounds,
}: {
  theme: GameTheme;
  question: StalkMarketQuestion;
  bets: StalkMarketBet[];
  bettors: SessionPlayer[];
  endsAt: string | null;
  totalSeconds: number;
  gameTitle: string;
  roundOrder: number;
  totalRounds: number;
}) {
  const offset = useServerTimeOffset();
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(t);
  }, [offset]);
  const remaining = endsAt
    ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000))
    : 0;
  const submittedIds = new Set(bets.map((b) => b.player_id));
  const submittedCount = submittedIds.size;
  const onAccent = theme.buttonTextMode === "light" ? "#ffffff" : "#1a1a1a";
  const timerStarted = !!endsAt;
  return (
    <div className="relative w-full h-full flex flex-col">
      <ScreenToolbar
        theme={theme}
        gameTitle={gameTitle}
        roundOrder={roundOrder}
        totalRounds={totalRounds}
      />

      {/* Floating circular timer in the top-right */}
      <div className="absolute top-0 right-0 z-10">
        <CircularTimer
          remaining={remaining}
          total={totalSeconds}
          started={timerStarted}
          theme={theme}
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-col items-center text-center w-full px-2 mt-4">
        {/* Question — centered in the middle of the available vertical space */}
        <h2
          className="my-auto text-5xl font-bold leading-[1.1] tracking-tight max-w-5xl text-balance"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          {question.prompt}
        </h2>

        {/* Submission status — pinned to the bottom, full toolbar width.
            Two-column split puts social pressure on the still-deciding side. */}
        <div className="w-full">
          {(() => {
            const submittedPlayers = bettors.filter((p) =>
              submittedIds.has(p.id)
            );
            const pendingPlayers = bettors.filter(
              (p) => !submittedIds.has(p.id)
            );
            const allIn = pendingPlayers.length === 0;
            const pct =
              bettors.length === 0
                ? 0
                : Math.round((submittedCount / bettors.length) * 100);
            return (
              <div
                className="rounded-xl p-5"
                style={{
                  background: cardGradient(theme),
                  border: `1px solid ${theme.border}`,
                }}
              >
                {/* Top bar: big count + progress */}
                <div className="flex items-baseline justify-between mb-2">
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{
                      color: allIn ? theme.accent : theme.textPrimary,
                      fontFamily: getFontFamily(theme.headingFont),
                    }}
                  >
                    {submittedCount}
                    <span
                      className="text-xl font-medium ml-1"
                      style={{ color: theme.textMuted }}
                    >
                      / {bettors.length} locked in
                    </span>
                  </p>
                  {!allIn && (
                    <p
                      className="text-sm font-semibold"
                      style={{ color: theme.textMuted }}
                    >
                      Waiting on {pendingPlayers.length}
                    </p>
                  )}
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden mb-4"
                  style={{ background: `${theme.textPrimary}14` }}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: theme.accent,
                    }}
                  />
                </div>

                {/* Two-column split: ✓ submitted / still deciding */}
                <div className="grid grid-cols-2 gap-6 text-left">
                  {/* Submitted */}
                  <div>
                    <p
                      className="text-[11px] uppercase tracking-[0.18em] font-bold mb-2"
                      style={{ color: theme.accent }}
                    >
                      ✓ Locked in
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {submittedPlayers.length === 0 ? (
                        <p
                          className="text-xs italic"
                          style={{ color: theme.textMuted }}
                        >
                          Nobody yet…
                        </p>
                      ) : (
                        submittedPlayers.map((p) => (
                          <div
                            key={p.id}
                            className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5"
                            style={{
                              background: theme.accent,
                              color: onAccent,
                              border: `1px solid ${theme.accent}`,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: p.avatar_color }}
                            />
                            <span className="font-semibold">
                              {p.display_name}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  {/* Pending */}
                  <div>
                    <p
                      className="text-[11px] uppercase tracking-[0.18em] font-bold mb-2"
                      style={{ color: theme.textMuted }}
                    >
                      Still deciding
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pendingPlayers.length === 0 ? (
                        <p
                          className="text-xs italic"
                          style={{ color: theme.textMuted }}
                        >
                          Everyone&apos;s in.
                        </p>
                      ) : (
                        pendingPlayers.map((p) => (
                          <div
                            key={p.id}
                            className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5"
                            style={{
                              background: "transparent",
                              color: theme.textPrimary,
                              border: `1px solid ${theme.border}`,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: p.avatar_color }}
                            />
                            <span className="font-medium">
                              {p.display_name}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function AdjudicationScreen({
  theme,
  question,
  spotlightAnswer,
  bets,
}: {
  theme: GameTheme;
  question: StalkMarketQuestion;
  spotlightAnswer: string;
  bets: StalkMarketBet[];
}) {
  const totalChips = bets.reduce((s, b) => s + b.chips, 0);
  const uniqueGuessTexts = new Set(bets.map((b) => normalizeGuess(b.guess_text))).size;
  return (
    <div className="text-center max-w-4xl">
      <p className="text-xl mb-3" style={{ color: theme.textMuted }}>
        {question.prompt}
      </p>
      <p className="text-base mb-2" style={{ color: theme.textMuted }}>
        Spotlight said
      </p>
      <p
        className="text-7xl font-bold tracking-tight mb-8"
        style={{
          color: theme.accent,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        {spotlightAnswer || "—"}
      </p>
      <p className="text-lg" style={{ color: theme.textPrimary }}>
        Host is grading {uniqueGuessTexts} unique guess{uniqueGuessTexts === 1 ? "" : "es"} ·{" "}
        <span className="font-semibold">{formatDollarsScreen(totalChips * 1000)} on the table</span>
      </p>
    </div>
  );
}

function RevealScreen({
  theme,
  question,
  spotlightAnswer,
  bets,
  players,
  gameTitle,
  roundOrder,
  totalRounds,
}: {
  theme: GameTheme;
  question: StalkMarketQuestion;
  spotlightAnswer: string;
  bets: StalkMarketBet[];
  players: SessionPlayer[];
  gameTitle: string;
  roundOrder: number;
  totalRounds: number;
}) {
  // Players who bet on the correct answer
  const correctBets = bets
    .filter((b) => b.is_correct)
    .sort((a, b) => b.chips - a.chips);

  // Individual wrong bets, sorted by amount desc.
  const wrongBets = bets
    .filter((b) => b.is_correct === false)
    .sort((a, b) => b.chips - a.chips);

  const findPlayer = (id: string) => players.find((p) => p.id === id);

  return (
    <div className="w-full h-full flex flex-col">
      <ScreenToolbar
        theme={theme}
        gameTitle={gameTitle}
        roundOrder={roundOrder}
        totalRounds={totalRounds}
      />
      <div className="flex-1 flex flex-col w-full max-w-6xl mx-auto mt-4 px-4 min-h-0 overflow-hidden">
        {/* Spotlight answer */}
        <p
          className="text-5xl font-bold tracking-tight text-center mb-4 shrink-0"
          style={{
            color: theme.accent,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          {spotlightAnswer || "—"}
        </p>

        {/* Correct / Wrong cards side by side. Split adapts to counts so the
            layout doesn't waste space when one side is sparse. */}
        {(() => {
          // 1:1 when wrong isn't dominating, otherwise lean 1:2 toward wrong.
          const useEqualSplit =
            correctBets.length > 0 &&
            wrongBets.length <= correctBets.length * 2;
          const outerCols = useEqualSplit ? "1fr 1fr" : "1fr 2fr";
          // Cap row height only when very sparse so 1-3 items don't balloon;
          // otherwise let rows fill (1fr) so 5-15 items look properly sized.
          const correctRowMax = correctBets.length <= 3 ? "90px" : "1fr";
          const wrongRowMax = wrongBets.length <= 4 ? "90px" : "1fr";
          return (
        <div
          className="flex-1 min-h-0 grid gap-4 overflow-hidden"
          style={{ gridTemplateColumns: outerCols }}
        >
          {/* Correct */}
          <div
            className="rounded-xl p-4 flex flex-col overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${theme.accent}22 0%, ${theme.accent}08 100%)`,
              border: `1px solid ${theme.accent}`,
            }}
          >
            <p
              className="text-base font-bold mb-3 inline-flex items-center gap-2 shrink-0"
              style={{ color: theme.accent }}
            >
              <span>✓</span>
              <span>Got it right · {correctBets.length}</span>
            </p>
            {correctBets.length === 0 ? (
              <p className="text-sm italic" style={{ color: theme.textMuted }}>
                Nobody got this one.
              </p>
            ) : (
              <div
                className="flex-1 min-h-0 overflow-y-auto grid gap-1.5"
                style={{
                  gridAutoRows: `minmax(44px, ${correctRowMax})`,
                  alignContent: correctRowMax === "1fr" ? "stretch" : "center",
                }}
              >
                {correctBets.map((b) => {
                  const p = findPlayer(b.player_id);
                  if (!p) return null;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-2 px-2.5 rounded-md overflow-hidden"
                      style={{
                        background: cardGradient(theme),
                        border: `1px solid ${theme.border}`,
                        containerType: "size",
                      }}
                    >
                      <span
                        className="rounded-full flex items-center justify-center font-bold shrink-0"
                        style={{
                          background: p.avatar_color,
                          color: "#ffffff",
                          width: "clamp(20px, 55cqh, 40px)",
                          height: "clamp(20px, 55cqh, 40px)",
                          fontSize: "clamp(9px, 25cqh, 16px)",
                        }}
                      >
                        {(p.display_name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span
                        className="flex-1 font-semibold truncate"
                        style={{
                          color: theme.textPrimary,
                          fontSize: "clamp(11px, 36cqh, 22px)",
                        }}
                      >
                        {p.display_name}
                      </span>
                      <span
                        className="font-bold tabular-nums"
                        style={{
                          color: theme.accent,
                          fontSize: "clamp(11px, 36cqh, 22px)",
                        }}
                      >
                        ${b.chips * 10}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Wrong */}
          <div
            className="rounded-xl p-3 flex flex-col overflow-hidden"
            style={{
              background: cardGradient(theme),
              border: `1px solid ${theme.border}`,
            }}
          >
            <p
              className="text-base font-bold mb-2 inline-flex items-center gap-2 shrink-0"
              style={{ color: theme.textPrimary }}
            >
              <span style={{ color: theme.danger }}>✗</span>
              <span>Wrong answers · {wrongBets.length}</span>
            </p>
            {wrongBets.length === 0 ? (
              <p className="text-sm italic" style={{ color: theme.textMuted }}>
                No wrong bets.
              </p>
            ) : (
              <div
                className="flex-1 min-h-0 overflow-y-auto grid gap-1.5"
                style={{
                  // Columns auto-fit to width — few items → fewer wider cells,
                  // many items → more tighter cells.
                  gridTemplateColumns: `repeat(auto-fit, minmax(${useEqualSplit ? 160 : 180}px, 1fr))`,
                  gridAutoRows: `minmax(40px, ${wrongRowMax})`,
                  alignContent: wrongRowMax === "1fr" ? "stretch" : "center",
                }}
              >
                {wrongBets.map((b) => {
                  const p = findPlayer(b.player_id);
                  if (!p) return null;
                  const stacked = wrongBets.length < 16;
                  if (stacked) {
                    return (
                      <div
                        key={b.id}
                        className="rounded-md px-2 py-1 flex flex-col justify-center gap-0.5 min-w-0 overflow-hidden"
                        style={{
                          background: `${theme.textPrimary}06`,
                          border: `1px solid ${theme.border}`,
                          containerType: "size",
                        }}
                      >
                        <span
                          className="font-semibold truncate"
                          style={{
                            color: theme.textPrimary,
                            fontSize: "clamp(11px, 36cqh, 20px)",
                          }}
                        >
                          {b.guess_text}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 min-w-0"
                          style={{
                            color: theme.textMuted,
                            fontSize: "clamp(8px, 22cqh, 13px)",
                          }}
                        >
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              background: p.avatar_color,
                              width: "clamp(4px, 8cqh, 8px)",
                              height: "clamp(4px, 8cqh, 8px)",
                            }}
                          />
                          <span className="truncate flex-1">{p.display_name}</span>
                          <span
                            className="tabular-nums shrink-0 font-semibold"
                            style={{ color: theme.textPrimary }}
                          >
                            ${b.chips * 10}
                          </span>
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={b.id}
                      className="rounded-md px-2 flex items-center gap-2 min-w-0 overflow-hidden"
                      style={{
                        background: `${theme.textPrimary}06`,
                        border: `1px solid ${theme.border}`,
                        containerType: "size",
                      }}
                    >
                      <span
                        className="font-semibold truncate flex-1"
                        style={{
                          color: theme.textPrimary,
                          fontSize: "clamp(10px, 32cqh, 18px)",
                        }}
                      >
                        {b.guess_text}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 shrink-0"
                        style={{
                          color: theme.textMuted,
                          fontSize: "clamp(8px, 22cqh, 13px)",
                        }}
                      >
                        <span
                          className="rounded-full"
                          style={{
                            background: p.avatar_color,
                            width: "clamp(4px, 8cqh, 8px)",
                            height: "clamp(4px, 8cqh, 8px)",
                          }}
                        />
                        <span className="truncate max-w-[60px]">{p.display_name}</span>
                      </span>
                      <span
                        className="tabular-nums shrink-0 font-semibold"
                        style={{
                          color: theme.textPrimary,
                          fontSize: "clamp(8px, 22cqh, 13px)",
                        }}
                      >
                        ${b.chips * 10}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
          );
        })()}
      </div>
    </div>
  );
}

function CrashChartBg({ color, theme }: { color: string; theme: GameTheme }) {
  // Static downward-sloping jagged line — no animation.
  const [curve] = useState(() => generateDownwardSlope(120));
  const width = 200;
  const height = 80;
  const step = width / (curve.length - 1);
  const linePath = curve
    .map((y, i) => `${i === 0 ? "M" : "L"} ${i * step} ${y}`)
    .join(" ");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Faint background grid (vertical + horizontal) */}
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
          <line
            key={`h${y}`}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke={theme.textPrimary}
            strokeWidth="0.12"
            opacity="0.09"
          />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1="0"
            y2="100"
            stroke={theme.textPrimary}
            strokeWidth="0.12"
            opacity="0.09"
          />
        ))}
      </svg>
      {/* The chart itself, with reduced opacity */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full opacity-50"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="crash-screen-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#crash-screen-fade)" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function generateDownwardSlope(n: number): number[] {
  // Straight line from near the top-left to near the bottom-right, with
  // small jitter for a "trading chart" feel — but a clear net downward trend.
  const height = 80;
  const startY = 10; // near top
  const endY = 72; // near bottom
  const points: number[] = [];
  for (let i = 0; i < n; i++) {
    const progress = i / (n - 1);
    const trend = startY + (endY - startY) * progress;
    const jitter = (Math.random() - 0.5) * 5;
    points.push(Math.max(3, Math.min(77, trend + jitter)));
  }
  return points;
}

function CrashScreen({
  theme,
  crashStartedAt,
  crashEvents,
  bettors,
  players,
  gameTitle,
  roundOrder,
  totalRounds,
}: {
  theme: GameTheme;
  crashStartedAt: string | null;
  crashEvents: StalkMarketCrashEvent[];
  bettors: SessionPlayer[];
  players: SessionPlayer[];
  gameTitle: string;
  roundOrder: number;
  totalRounds: number;
}) {
  const offset = useServerTimeOffset();
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const t = setInterval(() => setNow(Date.now() + offset), 50);
    return () => clearInterval(t);
  }, [offset]);
  const startMs = crashStartedAt ? new Date(crashStartedAt).getTime() : now;
  const elapsed = Math.max(0, now - startMs);
  const past = elapsed >= CRASH_DURATION_MS + 500;
  const cashedCount = crashEvents.length;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      {/* Toolbar matches the other phases, with a crash-alert badge in the right slot */}
      <ScreenToolbar
        theme={theme}
        gameTitle={gameTitle}
        roundOrder={roundOrder}
        totalRounds={totalRounds}
        right={
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              background: `color-mix(in srgb, ${theme.danger} 18%, transparent)`,
              color: theme.danger,
              border: `1px solid ${theme.danger}`,
            }}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Crash Alert
          </div>
        }
      />

      {/* Heading sits on solid bg above the chart, so it stays legible */}
      <div className="shrink-0 text-center px-8 pt-12 pb-4">
        <h1
          className="text-5xl font-bold tracking-tight leading-[1.05]"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          Uh-oh, the market is crashing!
        </h1>
        <p className="text-lg mt-2" style={{ color: theme.textPrimary }}>
          <span style={{ color: theme.accent, fontWeight: 700 }}>{cashedCount}</span>{" "}
          of {bettors.length} cashed out
          {!past && " · the rest are still holding"}
        </p>
      </div>

      {/* Chart + player list area */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <CrashChartBg color={theme.danger} theme={theme} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8 py-6">
          <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {bettors.map((p) => {
            const cashed = crashEvents.find((e) => e.player_id === p.id);
            const up = cashed && cashed.net_cents > 0;
            const wipe = cashed && cashed.net_cents < -9000;
            return (
              <div
                key={p.id}
                className="rounded-lg px-3 py-2 flex items-center justify-between gap-2 transition-opacity"
                style={{
                  background: up
                    ? `linear-gradient(180deg, color-mix(in srgb, ${theme.accent} 22%, ${theme.bg}) 0%, color-mix(in srgb, ${theme.accent} 8%, ${theme.bg}) 100%)`
                    : cardGradient(theme),
                  border: `1px solid ${cashed ? (up ? theme.accent : theme.border) : theme.border}`,
                  opacity: cashed ? 1 : 0.45,
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: p.avatar_color }}
                  />
                  <span
                    className="font-medium truncate"
                    style={{ color: theme.textPrimary }}
                  >
                    {p.display_name}
                  </span>
                </div>
                {cashed ? (
                  <span
                    className="font-bold tabular-nums shrink-0 text-sm"
                    style={{
                      color: up ? theme.accent : wipe ? theme.danger : theme.textPrimary,
                    }}
                  >
                    {cashed.cashout_ms === null
                      ? "Wipe"
                      : `${(cashed.cashout_ms / 1000).toFixed(2)}s`}{" "}
                    {formatDollarsScreen(cashed.net_cents)}
                  </span>
                ) : (
                  <span
                    className="text-xs italic shrink-0"
                    style={{ color: theme.textMuted }}
                  >
                    Holding…
                  </span>
                )}
              </div>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  theme,
  rank,
  player,
}: {
  theme: GameTheme;
  rank: number;
  player: SessionPlayer;
}) {
  const isPositive = player.score >= 0;
  return (
    <div
      className="flex items-center gap-5 px-5 py-6 rounded-xl"
      style={{
        background: cardGradient(theme),
        border: `1px solid ${theme.border}`,
      }}
    >
      <span
        className="font-bold w-10 text-xl tabular-nums"
        style={{ color: theme.textMuted }}
      >
        #{rank}
      </span>
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
        style={{ background: player.avatar_color, color: "#ffffff" }}
      >
        {(player.display_name || "?").charAt(0).toUpperCase()}
      </span>
      <span
        className="flex-1 font-semibold text-xl truncate"
        style={{ color: theme.textPrimary }}
      >
        {player.display_name}
      </span>
      <span
        className="font-bold tracking-tight tabular-nums text-2xl"
        style={{
          color: isPositive ? theme.accent : theme.danger,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        {formatDollarsScreen(player.score)}
      </span>
    </div>
  );
}

function LeaderboardScreen({
  theme,
  players,
  gameTitle,
  roundOrder,
  totalRounds,
}: {
  theme: GameTheme;
  players: SessionPlayer[];
  gameTitle?: string;
  roundOrder?: number;
  totalRounds?: number;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 12);
  const useTwoCols = sorted.length > 8;
  return (
    <div className="w-full h-full flex flex-col">
      {gameTitle !== undefined &&
        roundOrder !== undefined &&
        totalRounds !== undefined && (
          <ScreenToolbar
            theme={theme}
            gameTitle={gameTitle}
            roundOrder={roundOrder}
            totalRounds={totalRounds}
          />
        )}
      <div className="flex-1 min-h-0 flex flex-col items-center px-8 py-6 gap-6 overflow-hidden w-full">
        <h2
          className="text-4xl font-bold tracking-[-0.025em] shrink-0"
          style={{
            color: theme.textPrimary,
            fontFamily: getFontFamily(theme.headingFont),
          }}
        >
          Leaderboard
        </h2>
        <div
          className={`w-full ${
            useTwoCols
              ? "grid grid-cols-2 gap-x-8 gap-y-4"
              : "max-w-3xl flex flex-col gap-3"
          } flex-1 min-h-0 overflow-hidden`}
          style={
            useTwoCols
              ? {
                  gridTemplateRows: `repeat(${Math.ceil(sorted.length / 2)}, minmax(0, 1fr))`,
                  gridAutoFlow: "column",
                }
              : undefined
          }
        >
          {sorted.map((p, i) => (
            <LeaderboardRow
              key={p.id}
              theme={theme}
              rank={i + 1}
              player={p}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FinishedScreen({
  theme,
  players,
  spotlight,
  bets,
}: {
  theme: GameTheme;
  players: SessionPlayer[];
  spotlight: SessionPlayer | null;
  bets: StalkMarketBet[];
}) {
  const totalCents = bets.reduce((s, b) => s + b.chips * 1000, 0);
  const correctCents = bets
    .filter((b) => b.is_correct)
    .reduce((s, b) => s + b.chips * 1000, 0);
  const knowability =
    totalCents === 0 ? 0 : Math.round((correctCents / totalCents) * 100);
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3, 12);
  const useTwoCols = rest.length > 6;
  return (
    <div className="relative flex-1 min-h-0 flex flex-col items-center px-10 py-4 gap-3 overflow-hidden w-full">
      {spotlight && (
        <div
          className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 px-3 py-1 rounded-full"
          style={{
            background: cardGradient(theme),
            border: `1px solid ${theme.border}`,
          }}
        >
          <span className="text-[11px]" style={{ color: theme.textMuted }}>
            Knowability of{" "}
            <span style={{ color: theme.textPrimary, fontWeight: 600 }}>
              {spotlight.display_name}
            </span>
          </span>
          <span
            className="text-lg font-bold tabular-nums"
            style={{
              color: theme.accent,
              fontFamily: getFontFamily(theme.headingFont),
            }}
          >
            {knowability}%
          </span>
        </div>
      )}

      <h1
        className="text-4xl font-bold tracking-[-0.025em] shrink-0"
        style={{
          color: theme.textPrimary,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        Final Results
      </h1>

      <div className="flex items-end gap-5 shrink-0">
        {podium[1] && (
          <PodiumBlock player={podium[1]} place={2} theme={theme} />
        )}
        {podium[0] && (
          <PodiumBlock player={podium[0]} place={1} theme={theme} />
        )}
        {podium[2] && (
          <PodiumBlock player={podium[2]} place={3} theme={theme} />
        )}
      </div>

      {rest.length > 0 && (
        <div
          className={`w-full ${
            useTwoCols
              ? "grid grid-cols-2 gap-x-6 gap-y-3"
              : "max-w-3xl flex flex-col gap-2"
          } flex-1 min-h-0 overflow-hidden`}
          style={
            useTwoCols
              ? {
                  gridTemplateRows: `repeat(${Math.ceil(rest.length / 2)}, minmax(0, 1fr))`,
                  gridAutoFlow: "column",
                }
              : undefined
          }
        >
          {rest.map((p, i) => (
            <FinishedRow
              key={p.id}
              theme={theme}
              rank={i + 4}
              player={p}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FinishedRow({
  theme,
  rank,
  player,
}: {
  theme: GameTheme;
  rank: number;
  player: SessionPlayer;
}) {
  const isPositive = player.score >= 0;
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-1 rounded-lg min-h-0"
      style={{
        background: cardGradient(theme),
        border: `1px solid ${theme.border}`,
      }}
    >
      <span
        className="font-bold w-7 text-sm tabular-nums shrink-0"
        style={{ color: theme.textMuted }}
      >
        #{rank}
      </span>
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
        style={{ background: player.avatar_color, color: "#ffffff" }}
      >
        {(player.display_name || "?").charAt(0).toUpperCase()}
      </span>
      <span
        className="flex-1 font-semibold text-sm truncate"
        style={{ color: theme.textPrimary }}
      >
        {player.display_name}
      </span>
      <span
        className="text-base font-bold tracking-[-0.02em] tabular-nums"
        style={{
          color: isPositive ? theme.accent : theme.danger,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        {formatDollarsScreen(player.score)}
      </span>
    </div>
  );
}

function PodiumBlock({
  player,
  place,
  theme,
}: {
  player: SessionPlayer;
  place: 1 | 2 | 3;
  theme: GameTheme;
}) {
  const blockColors: Record<1 | 2 | 3, string> = {
    1: "#fbbf24",
    2: "#cbd5e1",
    3: "#fb923c",
  };
  const blockClass: Record<1 | 2 | 3, string> = {
    1: "w-24 h-16 text-3xl",
    2: "w-20 h-12 text-2xl",
    3: "w-20 h-8 text-2xl",
  };
  const avatarSize: Record<1 | 2 | 3, string> = {
    1: "w-16 h-16 text-2xl",
    2: "w-14 h-14 text-xl",
    3: "w-14 h-14 text-xl",
  };
  const nameSize: Record<1 | 2 | 3, string> = {
    1: "text-xl",
    2: "text-base",
    3: "text-base",
  };
  const scoreSize: Record<1 | 2 | 3, string> = {
    1: "text-xl",
    2: "text-base",
    3: "text-base",
  };
  const isPositive = player.score >= 0;
  return (
    <div className="flex flex-col items-center">
      {place === 1 && (
        <span className="text-xl leading-none" style={{ color: "#fbbf24" }}>
          👑
        </span>
      )}
      <span
        className={`${avatarSize[place]} rounded-full flex items-center justify-center font-bold`}
        style={{ background: player.avatar_color, color: "#ffffff" }}
      >
        {(player.display_name || "?").charAt(0).toUpperCase()}
      </span>
      <p
        className={`${nameSize[place]} font-bold mt-1 text-center leading-tight`}
        style={{ color: theme.textPrimary }}
      >
        {player.display_name}
      </p>
      <p
        className={`${scoreSize[place]} font-bold tabular-nums`}
        style={{
          color: isPositive ? theme.accent : theme.danger,
          fontFamily: getFontFamily(theme.headingFont),
        }}
      >
        {formatDollarsScreen(player.score)}
      </p>
      <div
        className={`${blockClass[place]} rounded-t-xl mt-1.5 flex items-center justify-center font-bold`}
        style={{
          background: blockColors[place],
          color: `color-mix(in srgb, ${blockColors[place]} 30%, black)`,
        }}
      >
        {place}
      </div>
    </div>
  );
}
