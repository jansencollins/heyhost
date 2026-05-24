"use client";

import { useMemo, useState } from "react";
import { ThemeProvider } from "@/lib/theme-context";
import { ThemePicker } from "@/components/games/ThemePicker";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import SMScreenPage from "@/components/games/sm/ScreenPage";
import SMPlayerPage from "@/components/games/sm/PlayerPage";
import type {
  Game,
  GameTheme,
  Session,
  SessionPlayer,
  StalkMarketBet,
  StalkMarketCrashEvent,
  StalkMarketQuestion,
} from "@/lib/types";

// ─── Phases ─────────────────────────────────────────────────────────────

type SMPreviewPhase =
  | "lobby"
  | "investing"
  | "reveal"
  | "crash"
  | "leaderboard"
  | "finished";

const PHASES: { id: SMPreviewPhase; label: string }[] = [
  { id: "lobby", label: "Lobby" },
  { id: "investing", label: "Investing" },
  { id: "reveal", label: "Reveal" },
  { id: "crash", label: "Crash" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "finished", label: "Finished" },
];

// Mock data shared across renderers
const MOCK_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank",
  "Grace", "Henry", "Ivy", "Jack", "Kate", "Liam",
];
const SPOTLIGHT_NAME = "Sarah";
const SESSION_ID = "preview-session";
const QUESTION_ID = "preview-question";

// Pre-baked cumulative scores in cents (positive and neutral — no negatives
// since the SM scoring rules can't produce them).
const SCORES = [12500, 9800, 5200, 2100, 1500, 3400, 4500, 2200, 1100, 800, 0, 800];

// Same luminance/text-color normalizer used elsewhere — keeps text legible
// when the host picks an off-mode color combo.
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function normalizeTextForMode(theme: GameTheme): GameTheme {
  if (theme.mode === "dark" && luminance(theme.textPrimary) < 0.6) {
    return { ...theme, textPrimary: "#F9FAFB", textMuted: "#D1D5DB", textDim: "#9CA3AF", bodyTextMode: "light" };
  }
  if (theme.mode === "light" && luminance(theme.textPrimary) > 0.6) {
    return { ...theme, textPrimary: "#111827", textMuted: "#4B5563", textDim: "#9CA3AF", bodyTextMode: "dark" };
  }
  return theme;
}

// ─── Mock data builders ─────────────────────────────────────────────────

function buildSpotlightPlayer(title: string): SessionPlayer {
  return {
    id: "p-spotlight",
    session_id: SESSION_ID,
    display_name: (title && title.trim()) || SPOTLIGHT_NAME,
    avatar_color: "#fbbf24",
    score: 0,
    is_removed: false,
    joined_at: new Date().toISOString(),
  };
}

function buildBettors(palette: string[]): SessionPlayer[] {
  return MOCK_NAMES.map((name, i) => ({
    id: `p${i + 1}`,
    session_id: SESSION_ID,
    display_name: name,
    avatar_color: palette[i % palette.length] ?? "#6366f1",
    score: SCORES[i] ?? 0,
    is_removed: false,
    joined_at: new Date().toISOString(),
  }));
}

function buildQuestions(gameId: string): StalkMarketQuestion[] {
  return [
    { id: QUESTION_ID, game_id: gameId, question_order: 0, prompt: "What did you want to be when you were 8?", preloaded_answer: null, created_at: new Date().toISOString() },
    { id: "preview-q2", game_id: gameId, question_order: 1, prompt: "What's your worst irrational fear?", preloaded_answer: null, created_at: new Date().toISOString() },
    { id: "preview-q3", game_id: gameId, question_order: 2, prompt: "Most embarrassing song on your phone?", preloaded_answer: null, created_at: new Date().toISOString() },
  ];
}

function buildBets(bettors: SessionPlayer[]): StalkMarketBet[] {
  // A curated mix so the reveal screen shows both correct/wrong columns nicely.
  const pattern: { name: string; text: string; chips: number; correct: boolean }[] = [
    { name: "Bob", text: "astronaut", chips: 6, correct: true },
    { name: "Bob", text: "doctor", chips: 4, correct: false },
    { name: "Charlie", text: "vet", chips: 7, correct: false },
    { name: "Charlie", text: "astronaut", chips: 3, correct: true },
    { name: "Diana", text: "teacher", chips: 10, correct: false },
    { name: "Eve", text: "astronaut", chips: 5, correct: true },
    { name: "Eve", text: "firefighter", chips: 5, correct: false },
    { name: "Frank", text: "pilot", chips: 10, correct: false },
    { name: "Grace", text: "astronaut", chips: 8, correct: true },
    { name: "Grace", text: "artist", chips: 2, correct: false },
  ];
  return pattern
    .map((p, i) => {
      const player = bettors.find((b) => b.display_name === p.name);
      if (!player) return null;
      return {
        id: `bet-${i}`,
        session_id: SESSION_ID,
        question_id: QUESTION_ID,
        player_id: player.id,
        guess_text: p.text,
        chips: p.chips,
        is_correct: p.correct,
        payout_cents: p.correct ? p.chips * 10 * 100 * 2 : 0,
        created_at: new Date().toISOString(),
      } as StalkMarketBet;
    })
    .filter((b): b is StalkMarketBet => b !== null);
}

function buildCrashEvents(bettors: SessionPlayer[]): StalkMarketCrashEvent[] {
  const map = new Map(bettors.map((b) => [b.display_name, b.id]));
  return [
    { id: "ce1", session_id: SESSION_ID, question_id: QUESTION_ID, player_id: map.get("Charlie")!, cashout_ms: 8420, saved_cents: 8420, net_cents: 8420, created_at: new Date().toISOString() },
    { id: "ce2", session_id: SESSION_ID, question_id: QUESTION_ID, player_id: map.get("Eve")!, cashout_ms: 9510, saved_cents: 14265, net_cents: 14265, created_at: new Date().toISOString() },
    { id: "ce3", session_id: SESSION_ID, question_id: QUESTION_ID, player_id: map.get("Diana")!, cashout_ms: 6900, saved_cents: 6900, net_cents: 6900, created_at: new Date().toISOString() },
    { id: "ce4", session_id: SESSION_ID, question_id: QUESTION_ID, player_id: map.get("Frank")!, cashout_ms: null, saved_cents: 0, net_cents: 0, created_at: new Date().toISOString() },
  ];
}

function buildGame(title: string): Game {
  return {
    id: "preview-game",
    host_id: "preview-host",
    title: title && title.trim() ? title : "Sarah",
    topic: "Stalk Market",
    game_type: "stalk_market",
    age_range: "mix",
    difficulty: "medium",
    timer_seconds: 60,
    speed_bonus: false,
    show_percent: false,
    round_prices: false,
    is_shared: false,
    penalty_cheap: null,
    penalty_expensive: null,
    penalty_margin: 70,
    theme: null,
    sm_scoring_version: "pari_mutuel",
    sm_game_mode: "live",
    sm_spotlight_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function baseSession(spotlightId: string): Session {
  return {
    id: SESSION_ID,
    game_id: "preview-game",
    host_id: "preview-host",
    code: "DEMO",
    status: "playing",
    current_question_index: 0,
    timer_seconds: 60,
    speed_bonus: false,
    is_paused: false,
    pir_current_item_id: null,
    pir_current_item_order: 0,
    pir_item_end_timestamp: null,
    pir_phase: "guessing",
    display_mode: "tv",
    sm_phase: "investing",
    sm_current_question_id: QUESTION_ID,
    sm_current_question_order: 0,
    sm_phase_end_timestamp: new Date(Date.now() + 45000).toISOString(),
    sm_spotlight_player_id: spotlightId,
    sm_current_spotlight_answer: "Astronaut",
    sm_crash_start_timestamp: null,
    ended_at: null,
    created_at: new Date().toISOString(),
  };
}

function sessionForPhase(phase: SMPreviewPhase, spotlightId: string): Session {
  const s = baseSession(spotlightId);
  switch (phase) {
    case "lobby":
      return { ...s, status: "lobby", sm_phase: "lobby", sm_current_question_id: null, sm_phase_end_timestamp: null };
    case "investing":
      return s;
    case "reveal":
      return { ...s, sm_phase: "reveal", sm_phase_end_timestamp: null };
    case "crash":
      return { ...s, sm_phase: "crash", sm_crash_start_timestamp: null, sm_phase_end_timestamp: null };
    case "leaderboard":
      return { ...s, sm_phase: "leaderboard", sm_phase_end_timestamp: null };
    case "finished":
      return { ...s, status: "finished", ended_at: new Date().toISOString() };
  }
}

// ─── Component ──────────────────────────────────────────────────────────

export function SMGamePreview({
  theme,
  onThemeChange,
  gameTitle = "",
}: {
  theme: GameTheme;
  onThemeChange: (theme: GameTheme) => void;
  gameTitle?: string;
}) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [deviceView, setDeviceView] = useState<"tv" | "phone">("tv");
  const activePhase = PHASES[Math.min(phaseIdx, PHASES.length - 1)].id;
  const previewTheme = normalizeTextForMode(theme);

  const palette =
    previewTheme.playerColors && previewTheme.playerColors.length > 0
      ? previewTheme.playerColors
      : Array.from(AVATAR_COLORS);

  const mock = useMemo(() => {
    const spotlight = buildSpotlightPlayer(gameTitle);
    const bettors = buildBettors(palette);
    const players: SessionPlayer[] = [spotlight, ...bettors];
    const game = buildGame(gameTitle);
    const questions = buildQuestions(game.id);
    const bets = buildBets(bettors);
    const crashEvents = buildCrashEvents(bettors);
    return { spotlight, bettors, players, game, questions, bets, crashEvents };
  }, [palette, gameTitle]);

  const session = sessionForPhase(activePhase, mock.spotlight.id);
  // For the phone preview we view things as a representative bettor — Bob.
  const me = mock.bettors.find((b) => b.display_name === "Bob") || mock.bettors[0];

  const screenKey = `${activePhase}-${previewTheme.style}-${previewTheme.mode}-${previewTheme.bg}-${previewTheme.surface}-${previewTheme.accent}-${previewTheme.textPrimary}-${previewTheme.headingFont}-${previewTheme.bodyFont}-${previewTheme.corners}-${previewTheme.pattern ?? ""}-${palette.join(",")}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar */}
      <aside className="lg:w-[260px] shrink-0 flex flex-col gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">
            Device
          </p>
          <div className="inline-flex bg-paper border border-dune rounded-full p-1 w-full">
            {(["tv", "phone"] as const).map((dev) => {
              const isActive = deviceView === dev;
              return (
                <button
                  key={dev}
                  type="button"
                  onClick={() => setDeviceView(dev)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                    isActive ? "bg-ink text-paper" : "text-smoke hover:text-ink"
                  }`}
                  aria-pressed={isActive}
                >
                  {dev === "tv" ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="5" width="18" height="12" rx="2" />
                      <path strokeLinecap="round" d="M9 20h6" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="7" y="3" width="10" height="18" rx="2" />
                      <path strokeLinecap="round" d="M11 18h2" />
                    </svg>
                  )}
                  {dev === "tv" ? "TV" : "Phone"}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">
            Theme
          </p>
          <div
            className="rounded-2xl border border-dune p-4"
            style={{ background: "var(--paper)" }}
          >
            <ThemePicker value={theme} onChange={onThemeChange} compact />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Phase tabs */}
        <div className="flex gap-2 flex-wrap">
          {PHASES.map((p, i) => {
            const isActive = phaseIdx === i;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhaseIdx(i)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "bg-ink text-paper border border-ink"
                    : "bg-paper text-ink border border-dune hover:border-ink/40"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Active mockup — wired to the real components via devMode so any
            design change to ScreenPage / PlayerPage flows through automatically. */}
        <div className="flex justify-center">
          {deviceView === "tv" ? (
            <div className="w-full max-w-[900px]">
              <div className="bg-zinc-900 rounded-2xl p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                <div
                  key={`tv-${screenKey}`}
                  className="aspect-video w-full overflow-hidden rounded-md bg-black"
                >
                  <ThemeProvider theme={previewTheme}>
                    <SMScreenPage
                      sessionCode="DEMO"
                      devMode={{
                        session,
                        game: mock.game,
                        players: mock.players,
                        questions: mock.questions,
                        bets: mock.bets,
                        crashEvents: mock.crashEvents,
                      }}
                    />
                  </ThemeProvider>
                </div>
              </div>
              <div className="mx-auto w-2/5 max-w-[180px]">
                <div className="h-2 bg-zinc-700 rounded-b-lg" />
                <div className="h-1 bg-zinc-800 rounded mt-px" />
              </div>
            </div>
          ) : (
            <div className="w-[280px]">
              <div className="relative bg-zinc-900 rounded-[40px] px-1 py-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-full z-10" />
                <div
                  key={`phone-${screenKey}`}
                  className="aspect-[390/844] overflow-hidden rounded-[32px] bg-black"
                >
                  <ThemeProvider theme={previewTheme}>
                    <SMPlayerPage
                      sessionCode="DEMO"
                      devMode={{
                        phase: "playing",
                        session,
                        game: mock.game,
                        player: me,
                        players: mock.players,
                        questions: mock.questions,
                        bets: mock.bets,
                        crashEvents: mock.crashEvents,
                      }}
                    />
                  </ThemeProvider>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-smoke text-center">
          Sample data shown — actual gameplay will use your title, questions, and players.
        </p>
      </div>
    </div>
  );
}
