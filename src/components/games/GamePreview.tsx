"use client";

import { useState } from "react";
import { ThemeProvider } from "@/lib/theme-context";
import { ThemePicker } from "@/components/games/ThemePicker";
import { AVATAR_COLORS } from "@/lib/avatar-colors";
import TriviaScreenPage from "@/components/games/trivia/ScreenPage";
import TriviaPlayerPage from "@/components/games/trivia/PlayerPage";
import PIRScreenPage from "@/components/games/pir/ScreenPage";
import PIRPlayerPage from "@/components/games/pir/PlayerPage";
import type {
  GameTheme,
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  SessionAnswer,
  PriceIsRightItem,
  PriceGuess,
} from "@/lib/types";

// ─── Mock data ─────────────────────────────────────────────────────────────
const NOW = new Date().toISOString();

const MOCK_PLAYERS: SessionPlayer[] = [
  { id: "p1", session_id: "s1", display_name: "Alice",   avatar_color: "#FF00FF", score: 3200, is_removed: false, joined_at: NOW },
  { id: "p2", session_id: "s1", display_name: "Bob",     avatar_color: "#8B008B", score: 2800, is_removed: false, joined_at: NOW },
  { id: "p3", session_id: "s1", display_name: "Charlie", avatar_color: "#800000", score: 1900, is_removed: false, joined_at: NOW },
  { id: "p4", session_id: "s1", display_name: "Diana",   avatar_color: "#FF0000", score: 1500, is_removed: false, joined_at: NOW },
  { id: "p5", session_id: "s1", display_name: "Eve",     avatar_color: "#FF7F50", score: 800,  is_removed: false, joined_at: NOW },
  { id: "p6", session_id: "s1", display_name: "Frank",   avatar_color: "#DAA520", score: 2400, is_removed: false, joined_at: NOW },
  { id: "p7", session_id: "s1", display_name: "Grace",   avatar_color: "#32CD32", score: 2100, is_removed: false, joined_at: NOW },
  { id: "p8", session_id: "s1", display_name: "Henry",   avatar_color: "#556B2F", score: 1700, is_removed: false, joined_at: NOW },
];

const MOCK_PLAYER = MOCK_PLAYERS[0];

const LOBBY_PLAYER_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank",
  "Grace", "Henry", "Ivy", "Jack", "Kate", "Liam",
];

function buildLobbyPlayers(palette: string[]): SessionPlayer[] {
  return LOBBY_PLAYER_NAMES.map((name, i) => ({
    id: `lp${i + 1}`,
    session_id: "s1",
    display_name: name,
    avatar_color: palette[i] ?? palette[i % palette.length] ?? "#6366f1",
    score: 0,
    is_removed: false,
    joined_at: NOW,
  }));
}

const MOCK_SESSION_LOBBY: Session = {
  id: "s1", game_id: "g1", host_id: "h1", code: "DEMO",
  status: "lobby", current_question_index: -1, timer_seconds: 30, speed_bonus: true, is_paused: false,
  pir_current_item_id: null, pir_current_item_order: 0, pir_item_end_timestamp: null, pir_phase: "guessing",
  display_mode: "tv",
  sm_phase: "lobby", sm_current_question_id: null, sm_current_question_order: 0,
  sm_phase_end_timestamp: null, sm_spotlight_player_id: null, sm_crash_start_timestamp: null,
  sm_current_spotlight_answer: null,
  created_at: NOW, ended_at: null,
};

const MOCK_SESSION_PLAYING: Session = { ...MOCK_SESSION_LOBBY, status: "playing", current_question_index: 2 };
const MOCK_SESSION_FINISHED: Session = { ...MOCK_SESSION_LOBBY, status: "finished", ended_at: NOW };

const MOCK_QUESTION: GameQuestionWithChoices = {
  id: "q1", game_id: "g1", question_order: 2,
  prompt: "What is the largest planet in our solar system?",
  explanation: "Jupiter is the largest planet.", created_at: NOW,
  game_question_choices: [
    { id: "c1", question_id: "q1", choice_text: "Mars",    is_correct: false, choice_order: 0 },
    { id: "c2", question_id: "q1", choice_text: "Jupiter", is_correct: true,  choice_order: 1 },
    { id: "c3", question_id: "q1", choice_text: "Saturn",  is_correct: false, choice_order: 2 },
    { id: "c4", question_id: "q1", choice_text: "Neptune", is_correct: false, choice_order: 3 },
  ],
};

const MOCK_QUESTION_STATE: SessionQuestionState = {
  id: "qs1", session_id: "s1", question_index: 2, question_id: "q1",
  started_at: new Date(Date.now() - 10000).toISOString(),
  ends_at: new Date(Date.now() + 20000).toISOString(),
  is_paused: false, paused_remaining_ms: null, is_locked: false,
  show_results: false, show_leaderboard: false,
};

const MOCK_QUESTION_STATE_RESULTS: SessionQuestionState = { ...MOCK_QUESTION_STATE, show_results: true };
const MOCK_QUESTION_STATE_LEADERBOARD: SessionQuestionState = { ...MOCK_QUESTION_STATE, show_results: true, show_leaderboard: true };

const MOCK_ANSWERS: SessionAnswer[] = MOCK_PLAYERS.map((p, i) => ({
  id: `a${i + 1}`, session_id: "s1", player_id: p.id, question_id: "q1",
  choice_id: "c2", answered_at: NOW, is_correct: true,
  time_ms: 3000 + i * 400, points_awarded: 1500 - i * 100,
}));

const MOCK_PIR_ITEMS: PriceIsRightItem[] = [
  { id: "item1", game_id: "g1", item_order: 0, name: "Sony WH-1000XM5 Headphones", image: null, price: 34999, description: "", difficulty: "medium", created_at: NOW },
];

const MOCK_PIR_SESSION_GUESSING: Session = {
  ...MOCK_SESSION_PLAYING,
  pir_phase: "guessing",
  pir_current_item_id: "item1",
  pir_current_item_order: 0,
  pir_item_end_timestamp: new Date(Date.now() + 20000).toISOString(),
};

const MOCK_PIR_SESSION_RESULT: Session = { ...MOCK_PIR_SESSION_GUESSING, pir_phase: "price_result" };
const MOCK_PIR_SESSION_PAY: Session = { ...MOCK_PIR_SESSION_GUESSING, pir_phase: "pay_the_price" };
const MOCK_PIR_SESSION_LB: Session = { ...MOCK_PIR_SESSION_GUESSING, pir_phase: "leaderboard" };

const MOCK_PIR_GUESSES: PriceGuess[] = [
  { id: "g1", session_id: "s1", player_id: "p1", item_id: "item1", guess: 29999, score_awarded: 50, tier: "within20", guess_accuracy: 86, paid_the_price: false, created_at: NOW },
  { id: "g2", session_id: "s1", player_id: "p2", item_id: "item1", guess: 42000, score_awarded: 50, tier: "within20", guess_accuracy: 80, paid_the_price: false, created_at: NOW },
  { id: "g3", session_id: "s1", player_id: "p3", item_id: "item1", guess: 35500, score_awarded: 60, tier: "within10", guess_accuracy: 99, paid_the_price: false, created_at: NOW },
  { id: "g4", session_id: "s1", player_id: "p4", item_id: "item1", guess: 10000, score_awarded: 10, tier: "beyond50", guess_accuracy: 29, paid_the_price: false, created_at: NOW },
  { id: "g5", session_id: "s1", player_id: "p5", item_id: "item1", guess: 31999, score_awarded: 60, tier: "within10", guess_accuracy: 92, paid_the_price: false, created_at: NOW },
  { id: "g6", session_id: "s1", player_id: "p6", item_id: "item1", guess: 40000, score_awarded: 50, tier: "within20", guess_accuracy: 86, paid_the_price: false, created_at: NOW },
  { id: "g7", session_id: "s1", player_id: "p7", item_id: "item1", guess: 24999, score_awarded: 30, tier: "within40", guess_accuracy: 71, paid_the_price: false, created_at: NOW },
  { id: "g8", session_id: "s1", player_id: "p8", item_id: "item1", guess: 49999, score_awarded: 30, tier: "within40", guess_accuracy: 57, paid_the_price: false, created_at: NOW },
];

const MOCK_PIR_MY_GUESS = MOCK_PIR_GUESSES[0];

// ─── Phase definitions ─────────────────────────────────────────────────────
type TriviaPhase = "lobby" | "question" | "results" | "leaderboard" | "finished";
type PIRPhase = "lobby" | "guessing" | "price_result" | "pay_the_price" | "leaderboard" | "finished";

const TRIVIA_PHASES: { id: TriviaPhase; label: string }[] = [
  { id: "lobby",       label: "Lobby" },
  { id: "question",    label: "Question" },
  { id: "results",     label: "Results" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "finished",    label: "Finished" },
];

const PIR_PHASES: { id: PIRPhase; label: string }[] = [
  { id: "lobby",         label: "Lobby" },
  { id: "guessing",      label: "Guessing" },
  { id: "price_result",  label: "Price Result" },
  { id: "pay_the_price", label: "Pay the Price" },
  { id: "leaderboard",   label: "Leaderboard" },
  { id: "finished",      label: "Finished" },
];

// ─── Render helpers ────────────────────────────────────────────────────────
function renderTriviaTv(phase: TriviaPhase, gameName: string, lobbyPlayers: SessionPlayer[]) {
  switch (phase) {
    case "lobby":
      return <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: lobbyPlayers, totalQuestions: 10, gameName }} />;
    case "question":
      return <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS.slice(0, 3), timeLeft: 18, totalQuestions: 10, gameName }} />;
    case "results":
      return <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10, gameName }} />;
    case "leaderboard":
      return <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_LEADERBOARD, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10, showLeaderboard: true, gameName }} />;
    case "finished":
      return <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, totalQuestions: 10, gameName }} />;
  }
}

function renderTriviaPhone(phase: TriviaPhase, gameName: string, lobbyPlayers: SessionPlayer[]) {
  switch (phase) {
    case "lobby":
      return <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: lobbyPlayers, gameName }} />;
    case "question":
      return <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "question", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, timeLeft: 18 }} />;
    case "results":
      return <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "results", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answerResult: { correct: true, points: 1350 }, selectedChoiceId: "c2" }} />;
    case "leaderboard":
      return <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />;
    case "finished":
      return <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />;
  }
}

function renderPirTv(phase: PIRPhase, gameName: string, gameTopic: string, lobbyPlayers: SessionPlayer[]) {
  switch (phase) {
    case "lobby":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: lobbyPlayers, items: MOCK_PIR_ITEMS, gameName, gameTopic }} />;
    case "guessing":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_GUESSING, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES.slice(0, 2) }} />;
    case "price_result":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_RESULT, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />;
    case "pay_the_price":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_PAY, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />;
    case "leaderboard":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_LB, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />;
    case "finished":
      return <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS }} />;
  }
}

function renderPirPhone(phase: PIRPhase, lobbyPlayers: SessionPlayer[]) {
  switch (phase) {
    case "lobby":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: lobbyPlayers }} />;
    case "guessing":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessing", session: MOCK_PIR_SESSION_GUESSING, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0] }} />;
    case "price_result":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "price_result", session: MOCK_PIR_SESSION_RESULT, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: MOCK_PIR_MY_GUESS }} />;
    case "pay_the_price":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "pay_the_price", session: MOCK_PIR_SESSION_PAY, player: MOCK_PLAYER, players: MOCK_PLAYERS, penaltyPlayers: [{ name: "Bob", color: "#4ECDC4", playerId: "p2" }, { name: "Diana", color: "#96CEB4", playerId: "p4" }] }} />;
    case "leaderboard":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_PIR_SESSION_LB, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />;
    case "finished":
      return <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />;
  }
}

// Compute relative luminance of a hex color (0–1).
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Force dark-mode themes to use a light text color even if the user only
// edited individual colors via the color inputs (which don't auto-adjust
// text). Same idea on the way down for light mode.
function normalizeTextForMode(theme: GameTheme): GameTheme {
  if (theme.mode === "dark" && luminance(theme.textPrimary) < 0.6) {
    return { ...theme, textPrimary: "#F9FAFB", textMuted: "#D1D5DB", textDim: "#9CA3AF", bodyTextMode: "light" };
  }
  if (theme.mode === "light" && luminance(theme.textPrimary) > 0.6) {
    return { ...theme, textPrimary: "#111827", textMuted: "#4B5563", textDim: "#9CA3AF", bodyTextMode: "dark" };
  }
  return theme;
}

// ─── Component ─────────────────────────────────────────────────────────────
export function GamePreview({
  gameType,
  theme,
  onThemeChange,
  gameTitle = "",
  gameTopic = "",
}: {
  gameType: "trivia" | "price_is_right";
  theme: GameTheme;
  onThemeChange: (theme: GameTheme) => void;
  gameTitle?: string;
  gameTopic?: string;
}) {
  const phases = gameType === "trivia" ? TRIVIA_PHASES : PIR_PHASES;
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [deviceView, setDeviceView] = useState<"tv" | "phone">("tv");
  const activePhase = phases[Math.min(phaseIdx, phases.length - 1)].id;
  const previewTheme = normalizeTextForMode(theme);

  const lobbyPalette = previewTheme.playerColors && previewTheme.playerColors.length > 0
    ? previewTheme.playerColors
    : Array.from(AVATAR_COLORS);
  const lobbyPlayers = buildLobbyPlayers(lobbyPalette);

  const tvScreen = gameType === "trivia"
    ? renderTriviaTv(activePhase as TriviaPhase, gameTitle, lobbyPlayers)
    : renderPirTv(activePhase as PIRPhase, gameTitle, gameTopic, lobbyPlayers);
  const phoneScreen = gameType === "trivia"
    ? renderTriviaPhone(activePhase as TriviaPhase, gameTitle, lobbyPlayers)
    : renderPirPhone(activePhase as PIRPhase, lobbyPlayers);

  // Screens cache devMode props in internal useState, so we remount on
  // theme/phase change to make tweaks reflect immediately.
  const screenKey = `${activePhase}-${previewTheme.style}-${previewTheme.mode}-${previewTheme.bg}-${previewTheme.surface}-${previewTheme.accent}-${previewTheme.textPrimary}-${previewTheme.headingFont}-${previewTheme.bodyFont}-${previewTheme.corners}-${previewTheme.pattern ?? ""}-${lobbyPalette.join(",")}`;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar — device switcher + theme picker */}
      <aside className="lg:w-[260px] shrink-0 flex flex-col gap-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">Device</p>
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
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold text-smoke mb-3">Theme</p>
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
          {phases.map((p, i) => {
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

        {/* Active mockup */}
        <div className="flex justify-center">
          {deviceView === "tv" ? (
            <div className="w-full max-w-[900px]">
              <div className="bg-zinc-900 rounded-2xl p-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                <div key={`tv-${screenKey}`} className="aspect-video w-full overflow-hidden rounded-md bg-black">
                  <ThemeProvider theme={previewTheme}>
                    {tvScreen}
                  </ThemeProvider>
                </div>
              </div>
              {/* Stand */}
              <div className="mx-auto w-2/5 max-w-[180px]">
                <div className="h-2 bg-zinc-700 rounded-b-lg" />
                <div className="h-1 bg-zinc-800 rounded mt-px" />
              </div>
            </div>
          ) : (
            <div className="w-[280px]">
              <div className="relative bg-zinc-900 rounded-[40px] px-1 py-2 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]">
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-4 bg-zinc-900 rounded-full z-10" />
                <div key={`phone-${screenKey}`} className="aspect-[390/844] overflow-hidden rounded-[32px] bg-black">
                  <ThemeProvider theme={previewTheme}>
                    {phoneScreen}
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
