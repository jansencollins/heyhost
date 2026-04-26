"use client";

import { useState } from "react";
import TriviaPlayerPage, { type TriviaPlayerDevMode } from "@/components/games/trivia/PlayerPage";
import TriviaScreenPage, { type TriviaScreenDevMode } from "@/components/games/trivia/ScreenPage";
import PIRPlayerPage, { type PIRPlayerDevMode } from "@/components/games/pir/PlayerPage";
import PIRScreenPage, { type PIRScreenDevMode } from "@/components/games/pir/ScreenPage";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import { ThemePicker } from "@/components/games/ThemePicker";
import type { GameTheme } from "@/lib/types";
import type {
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  SessionAnswer,
  PriceIsRightItem,
  PriceGuess,
} from "@/lib/types";

// ============================================================
// Mock Data
// ============================================================

const MOCK_PLAYERS: SessionPlayer[] = [
  { id: "p1", session_id: "s1", display_name: "Alice", avatar_color: "#FF6B6B", score: 3200, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p2", session_id: "s1", display_name: "Bob", avatar_color: "#4ECDC4", score: 2800, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p3", session_id: "s1", display_name: "Charlie", avatar_color: "#45B7D1", score: 1900, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p4", session_id: "s1", display_name: "Diana", avatar_color: "#96CEB4", score: 1500, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p5", session_id: "s1", display_name: "Eve", avatar_color: "#FFEAA7", score: 800, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p6", session_id: "s1", display_name: "Frank", avatar_color: "#FFA94D", score: 2400, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p7", session_id: "s1", display_name: "Grace", avatar_color: "#A78BFA", score: 2100, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p8", session_id: "s1", display_name: "Henry", avatar_color: "#34D399", score: 1700, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p9", session_id: "s1", display_name: "Ivy", avatar_color: "#F472B6", score: 1300, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p10", session_id: "s1", display_name: "Jack", avatar_color: "#60A5FA", score: 1100, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p11", session_id: "s1", display_name: "Kate", avatar_color: "#FBBF24", score: 950, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p12", session_id: "s1", display_name: "Liam", avatar_color: "#22D3EE", score: 700, is_removed: false, joined_at: new Date().toISOString() },
];

const MOCK_PLAYER = MOCK_PLAYERS[0];

const MOCK_SESSION_LOBBY: Session = {
  id: "s1", game_id: "g1", host_id: "h1", code: "DEMO",
  status: "lobby", current_question_index: -1, timer_seconds: 30, speed_bonus: true,
  pir_current_item_id: null, pir_current_item_order: 0, pir_item_end_timestamp: null, pir_phase: "guessing",
  display_mode: "tv",
  created_at: new Date().toISOString(), ended_at: null,
};

const MOCK_SESSION_PLAYING: Session = {
  ...MOCK_SESSION_LOBBY, status: "playing", current_question_index: 2,
};

const MOCK_SESSION_FINISHED: Session = {
  ...MOCK_SESSION_LOBBY, status: "finished", ended_at: new Date().toISOString(),
};

const MOCK_QUESTION: GameQuestionWithChoices = {
  id: "q1", game_id: "g1", question_order: 2,
  prompt: "What is the largest planet in our solar system?",
  explanation: "Jupiter is the largest planet.", created_at: new Date().toISOString(),
  game_question_choices: [
    { id: "c1", question_id: "q1", choice_text: "Mars", is_correct: false, choice_order: 0 },
    { id: "c2", question_id: "q1", choice_text: "Jupiter", is_correct: true, choice_order: 1 },
    { id: "c3", question_id: "q1", choice_text: "Saturn", is_correct: false, choice_order: 2 },
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

const MOCK_QUESTION_STATE_RESULTS: SessionQuestionState = {
  ...MOCK_QUESTION_STATE, show_results: true,
};

const MOCK_QUESTION_STATE_LEADERBOARD: SessionQuestionState = {
  ...MOCK_QUESTION_STATE, show_results: true, show_leaderboard: true,
};

const MOCK_ANSWERS: SessionAnswer[] = [
  { id: "a1", session_id: "s1", player_id: "p1", question_id: "q1", choice_id: "c2", answered_at: new Date().toISOString(), is_correct: true, time_ms: 3200, points_awarded: 1350 },
  { id: "a2", session_id: "s1", player_id: "p2", question_id: "q1", choice_id: "c1", answered_at: new Date().toISOString(), is_correct: false, time_ms: 5000, points_awarded: 0 },
  { id: "a3", session_id: "s1", player_id: "p3", question_id: "q1", choice_id: "c2", answered_at: new Date().toISOString(), is_correct: true, time_ms: 8000, points_awarded: 1100 },
  { id: "a4", session_id: "s1", player_id: "p4", question_id: "q1", choice_id: "c3", answered_at: new Date().toISOString(), is_correct: false, time_ms: 12000, points_awarded: 0 },
];

// PIR mock data
const MOCK_PIR_ITEMS: PriceIsRightItem[] = [
  { id: "item1", game_id: "g1", item_order: 0, name: "Sony WH-1000XM5 Headphones", image: null, price: 34999, description: "Premium noise-cancelling wireless headphones", difficulty: "medium", created_at: new Date().toISOString() },
  { id: "item2", game_id: "g1", item_order: 1, name: "Nintendo Switch OLED", image: null, price: 34999, description: "Gaming console with 7-inch OLED screen", difficulty: "easy", created_at: new Date().toISOString() },
];

const MOCK_PIR_SESSION_GUESSING: Session = {
  ...MOCK_SESSION_PLAYING,
  pir_phase: "guessing",
  pir_current_item_id: "item1",
  pir_current_item_order: 0,
  pir_item_end_timestamp: new Date(Date.now() + 20000).toISOString(),
};

const MOCK_PIR_SESSION_RESULT: Session = {
  ...MOCK_PIR_SESSION_GUESSING, pir_phase: "price_result",
};

const MOCK_PIR_SESSION_PAY_TV: Session = {
  ...MOCK_PIR_SESSION_GUESSING, pir_phase: "pay_the_price", display_mode: "tv",
};

const MOCK_PIR_SESSION_PAY_OTG: Session = {
  ...MOCK_PIR_SESSION_GUESSING, pir_phase: "pay_the_price", display_mode: "on_the_go",
};

const MOCK_PIR_SESSION_LEADERBOARD: Session = {
  ...MOCK_PIR_SESSION_GUESSING, pir_phase: "leaderboard",
};

// Item price: 34999 cents ($349.99)
// Guess 29999 ($299.99): diff 14.3% → within20, 50 pts, accuracy 86%
// Guess 42000 ($420.00): diff 20.0% → within20, 50 pts, accuracy 80%
// Guess 35500 ($355.00): diff 1.4% → within10, 60 pts, accuracy 99%
// Guess 10000 ($100.00): diff 71.4% → beyond50, 10 pts, accuracy 29%
const MOCK_PIR_GUESSES: PriceGuess[] = [
  { id: "g1", session_id: "s1", player_id: "p1", item_id: "item1", guess: 29999, score_awarded: 50, tier: "within20", guess_accuracy: 86, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g2", session_id: "s1", player_id: "p2", item_id: "item1", guess: 42000, score_awarded: 50, tier: "within20", guess_accuracy: 80, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g3", session_id: "s1", player_id: "p3", item_id: "item1", guess: 35500, score_awarded: 60, tier: "within10", guess_accuracy: 99, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g4", session_id: "s1", player_id: "p4", item_id: "item1", guess: 10000, score_awarded: 10, tier: "beyond50", guess_accuracy: 29, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g5", session_id: "s1", player_id: "p5", item_id: "item1", guess: 31999, score_awarded: 60, tier: "within10", guess_accuracy: 92, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g6", session_id: "s1", player_id: "p6", item_id: "item1", guess: 40000, score_awarded: 50, tier: "within20", guess_accuracy: 86, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g7", session_id: "s1", player_id: "p7", item_id: "item1", guess: 24999, score_awarded: 30, tier: "within40", guess_accuracy: 71, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g8", session_id: "s1", player_id: "p8", item_id: "item1", guess: 49999, score_awarded: 30, tier: "within40", guess_accuracy: 57, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g9", session_id: "s1", player_id: "p9", item_id: "item1", guess: 35000, score_awarded: 100, tier: "bullseye", guess_accuracy: 100, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g10", session_id: "s1", player_id: "p10", item_id: "item1", guess: 28000, score_awarded: 50, tier: "within20", guess_accuracy: 80, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g11", session_id: "s1", player_id: "p11", item_id: "item1", guess: 60000, score_awarded: 10, tier: "beyond50", guess_accuracy: 29, paid_the_price: false, created_at: new Date().toISOString() },
  { id: "g12", session_id: "s1", player_id: "p12", item_id: "item1", guess: 33000, score_awarded: 60, tier: "within10", guess_accuracy: 94, paid_the_price: false, created_at: new Date().toISOString() },
];

const MOCK_PIR_MY_GUESS: PriceGuess = MOCK_PIR_GUESSES[0];
const MOCK_PIR_BAD_GUESS: PriceGuess = MOCK_PIR_GUESSES[3]; // beyond50, 29% accuracy

// ============================================================
// Screen Definitions
// ============================================================

interface ScreenDef {
  id: string;
  label: string;
  group: string;
  render: () => React.ReactNode;
}

const SCREENS: ScreenDef[] = [
  // Trivia Player
  { id: "tp-joining", label: "Joining", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "joining", session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-lobby", label: "Lobby", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-question", label: "Question", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "question", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, timeLeft: 18 }} />
  )},
  { id: "tp-answered-correct", label: "Answered (Correct)", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "answered", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, answerResult: { correct: true, points: 1350 } }} />
  )},
  { id: "tp-answered-wrong", label: "Answered (Wrong)", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "answered", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, answerResult: { correct: false, points: 0 } }} />
  )},
  { id: "tp-results", label: "Results", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "results", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answerResult: { correct: true, points: 1350 } }} />
  )},
  { id: "tp-leaderboard", label: "Leaderboard", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-finished", label: "Finished", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-removed", label: "Removed", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "removed", session: MOCK_SESSION_PLAYING }} />
  )},
  { id: "tp-error", label: "Error", group: "Trivia — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "error", error: "Game not found. Check the code and try again." }} />
  )},

  // Trivia Screen
  { id: "ts-lobby", label: "Lobby", group: "Trivia — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, totalQuestions: 10 }} />
  )},
  { id: "ts-question", label: "Active Question", group: "Trivia — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS.slice(0, 2), timeLeft: 18, totalQuestions: 10 }} />
  )},
  { id: "ts-results", label: "Results", group: "Trivia — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10 }} />
  )},
  { id: "ts-leaderboard", label: "Leaderboard", group: "Trivia — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_LEADERBOARD, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10, showLeaderboard: true }} />
  )},
  { id: "ts-finished", label: "Finished", group: "Trivia — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, totalQuestions: 10 }} />
  )},

  // PIR Player
  { id: "pp-joining", label: "Joining", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "joining", session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, gameName: "Friday Night Prices" }} />
  )},
  { id: "pp-lobby", label: "Lobby", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-guessing", label: "Guessing", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessing", session: MOCK_PIR_SESSION_GUESSING, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0] }} />
  )},
  { id: "pp-guessed", label: "Guessed", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessed", session: MOCK_PIR_SESSION_GUESSING, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: MOCK_PIR_MY_GUESS }} />
  )},
  { id: "pp-price-result", label: "Price Result", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "price_result", session: MOCK_PIR_SESSION_RESULT, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: MOCK_PIR_MY_GUESS }} />
  )},
  { id: "pp-pay-the-price", label: "Pay The Price", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "pay_the_price", session: MOCK_PIR_SESSION_PAY_TV, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-leaderboard", label: "Leaderboard", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_PIR_SESSION_LEADERBOARD, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-finished", label: "Finished", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-removed", label: "Removed", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "removed", session: MOCK_SESSION_PLAYING }} />
  )},
  { id: "pp-error", label: "Error", group: "PIR — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "error", error: "Game not found. Check the code and try again." }} />
  )},

  // PIR Screen
  { id: "ps-lobby", label: "Lobby", group: "PIR — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, gameName: "Friday Night Prices", gameTopic: "Christmas Party Edition" }} />
  )},
  { id: "ps-guessing", label: "Guessing", group: "PIR — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_GUESSING, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES.slice(0, 2) }} />
  )},
  { id: "ps-price-result", label: "Price Result", group: "PIR — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_RESULT, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />
  )},
  { id: "ps-leaderboard", label: "Leaderboard", group: "PIR — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_LEADERBOARD, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />
  )},
  { id: "ps-finished", label: "Finished", group: "PIR — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS }} />
  )},
];

// ============================================================
// Dev Page Component
// ============================================================

const GROUPS = [...new Set(SCREENS.map((s) => s.group))];

export default function DevPreviewPage() {
  const [activeScreen, setActiveScreen] = useState(SCREENS[0].id);
  const [viewMode, setViewMode] = useState<"phone" | "desktop" | "full">("full");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([SCREENS[0].group]));
  const [selectedTheme, setSelectedTheme] = useState<GameTheme>(DEFAULT_THEME.price_is_right);
  const [badGuess, setBadGuess] = useState(false);
  const [onTheGo, setOnTheGo] = useState(false);
  const [atRisk, setAtRisk] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);

  const current = SCREENS.find((s) => s.id === activeScreen)!;

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const frameStyles: Record<string, React.CSSProperties> = {
    phone: { aspectRatio: "390 / 844", height: "100%", maxHeight: "calc(100vh - 100px)" },
    desktop: { width: "1280px", height: "720px" },
    full: { aspectRatio: "16 / 9", width: "100%", maxWidth: "100%", maxHeight: "calc(100vh - 100px)" },
  };

  return (
    <div className="flex h-screen bg-zinc-900 text-white overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 bg-zinc-950 border-r border-white/10 overflow-y-auto">
        <div className="p-4 border-b border-white/10">
          <h1 className="text-lg font-bold">Dev Preview</h1>
          <p className="text-xs text-white/40 mt-1">View game screens with mock data</p>
        </div>

        {/* View mode */}
        <div className="p-3 border-b border-white/10">
          <div className="flex gap-1">
            {(["phone", "desktop", "full"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg font-medium transition ${
                  viewMode === mode
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {mode === "phone" ? "Phone" : mode === "desktop" ? "Desktop" : "Full"}
              </button>
            ))}
          </div>
        </div>

        {/* Theme customizer */}
        <div className="p-3 border-b border-white/10">
          <ThemePicker value={selectedTheme} onChange={setSelectedTheme} compact />
        </div>

        {/* Screen list */}
        <div className="p-2">
          {GROUPS.map((group) => {
            const isExpanded = expandedGroups.has(group);
            const groupScreens = SCREENS.filter((s) => s.group === group);
            const hasActive = groupScreens.some((s) => s.id === activeScreen);

            return (
              <div key={group} className="mb-1">
                <button
                  onClick={() => toggleGroup(group)}
                  className={`w-full flex items-center justify-between px-2 py-2 rounded-lg text-xs uppercase tracking-wider font-semibold transition ${
                    hasActive ? "text-indigo-300" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  <span>{group}</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="ml-1 mb-2">
                    {groupScreens.map((screen) => (
                      <button
                        key={screen.id}
                        onClick={() => {
                          setActiveScreen(screen.id);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition ${
                          activeScreen === screen.id
                            ? "bg-indigo-600/20 text-indigo-300"
                            : "text-white/60 hover:bg-white/5 hover:text-white/80"
                        }`}
                      >
                        {screen.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-950/50 border-b border-white/10">
          <div>
            <span className="text-xs text-white/30">{current.group}</span>
            <h2 className="text-sm font-semibold">{current.label}</h2>
          </div>
          <span className="text-xs text-white/20 font-mono">{current.id}</span>
        </div>

        {/* Preview frame */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-zinc-800/50">
          <div
            className="relative overflow-hidden"
            style={{
              ...frameStyles[viewMode],
              borderRadius: viewMode === "phone" ? "24px" : "8px",
              border: "2px solid rgba(255,255,255,0.1)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            }}
          >
            {/* Player-count slider for guessing/price-result screens */}
            {(current.id === "ps-guessing" || current.id === "ps-price-result") && (
              <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/80 border border-white/15 backdrop-blur">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  {playerCount} {playerCount === 1 ? "player" : "players"} · {Math.ceil(playerCount / 2)} {Math.ceil(playerCount / 2) === 1 ? "row" : "rows"}
                </span>
                <input
                  type="range"
                  min={2}
                  max={12}
                  step={1}
                  value={playerCount}
                  onChange={(e) => setPlayerCount(Number(e.target.value))}
                  className="w-32 accent-indigo-500"
                />
              </div>
            )}

            {/* Dev toggles */}
            {(current.id === "pp-price-result" || current.id === "pp-pay-the-price") && (
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                {current.id === "pp-price-result" && (
                  <button
                    type="button"
                    onClick={() => setBadGuess(!badGuess)}
                    className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors"
                    style={{
                      background: badGuess ? "rgba(185,28,28,0.14)" : "rgba(21,128,61,0.14)",
                      color: badGuess ? "#B91C1C" : "#15803d",
                      border: `1px solid ${badGuess ? "rgba(185,28,28,0.35)" : "rgba(21,128,61,0.35)"}`,
                    }}
                  >
                    {badGuess ? "Bad Guess" : "Good Guess"}
                  </button>
                )}
                {current.id === "pp-pay-the-price" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setOnTheGo(!onTheGo)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{
                        background: onTheGo ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.1)",
                        color: onTheGo ? "#a855f7" : "rgba(255,255,255,0.6)",
                        border: `1px solid ${onTheGo ? "rgba(168,85,247,0.3)" : "rgba(255,255,255,0.15)"}`,
                      }}
                    >
                      {onTheGo ? "On the Go" : "TV Mode"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAtRisk(!atRisk)}
                      className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors"
                      style={{
                        background: atRisk ? "rgba(185,28,28,0.14)" : "rgba(21,128,61,0.14)",
                        color: atRisk ? "#B91C1C" : "#15803d",
                        border: `1px solid ${atRisk ? "rgba(185,28,28,0.35)" : "rgba(21,128,61,0.35)"}`,
                      }}
                    >
                      {atRisk ? "At Risk" : "Safe"}
                    </button>
                  </>
                )}
              </div>
            )}
            <div key={`${current.id}-${badGuess}-${onTheGo}-${atRisk}-${playerCount}`} className={`w-full h-full ${current.group.includes("Screen") ? "overflow-hidden" : "overflow-auto"}`}>
              <ThemeProvider theme={selectedTheme}>
                {current.id === "pp-price-result"
                  ? <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "price_result", session: MOCK_PIR_SESSION_RESULT, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: badGuess ? MOCK_PIR_BAD_GUESS : MOCK_PIR_MY_GUESS }} />
                  : current.id === "pp-pay-the-price"
                  ? <PIRPlayerPage sessionCode="DEMO" devMode={{
                      phase: "pay_the_price",
                      session: onTheGo ? MOCK_PIR_SESSION_PAY_OTG : MOCK_PIR_SESSION_PAY_TV,
                      player: MOCK_PLAYER,
                      players: MOCK_PLAYERS,
                      penaltyPlayers: [
                        ...(atRisk ? [{ name: "Alice", color: "#FF6B6B", playerId: "p1" }] : []),
                        { name: "Bob", color: "#4ECDC4", playerId: "p2" },
                        { name: "Diana", color: "#96CEB4", playerId: "p4" },
                        { name: "Eve", color: "#FFEAA7", playerId: "p5" },
                      ],
                    }} />
                  : current.id === "ps-guessing"
                  ? <PIRScreenPage sessionCode="DEMO" devMode={{
                      session: MOCK_PIR_SESSION_GUESSING,
                      players: MOCK_PLAYERS.slice(0, playerCount),
                      items: MOCK_PIR_ITEMS,
                      guesses: MOCK_PIR_GUESSES.slice(0, Math.min(2, playerCount)),
                    }} />
                  : current.id === "ps-price-result"
                  ? <PIRScreenPage sessionCode="DEMO" devMode={{
                      session: MOCK_PIR_SESSION_RESULT,
                      players: MOCK_PLAYERS.slice(0, playerCount),
                      items: MOCK_PIR_ITEMS,
                      guesses: MOCK_PIR_GUESSES.slice(0, playerCount),
                    }} />
                  : current.render()
                }
              </ThemeProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
