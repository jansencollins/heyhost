"use client";

import { useCallback, useMemo, useState } from "react";
import TriviaPlayerPage, { type TriviaPlayerDevMode } from "@/components/games/trivia/PlayerPage";
import TriviaScreenPage, { type TriviaScreenDevMode } from "@/components/games/trivia/ScreenPage";
import PIRPlayerPage, { type PIRPlayerDevMode } from "@/components/games/pir/PlayerPage";
import PIRScreenPage, { type PIRScreenDevMode } from "@/components/games/pir/ScreenPage";
import SMPlayerPage, { type SMPlayerDevMode } from "@/components/games/sm/PlayerPage";
import SMScreenPage, { type SMScreenDevMode } from "@/components/games/sm/ScreenPage";
import TriviaHostRemote, { type TriviaHostDevMode } from "@/components/games/trivia/HostRemote";
import PIRHostRemote, { type PIRHostDevMode } from "@/components/games/pir/HostRemote";
import SMHostRemote, { type SMHostDevMode } from "@/components/games/sm/HostRemote";
import { ThemeProvider } from "@/lib/theme-context";
import { DEFAULT_THEME } from "@/lib/theme-presets";
import { ThemePicker } from "@/components/games/ThemePicker";
import type { GameTheme } from "@/lib/types";
import type {
  Game,
  GameQuestion,
  Session,
  SessionPlayer,
  SessionQuestionState,
  GameQuestionWithChoices,
  SessionAnswer,
  PriceIsRightItem,
  PriceGuess,
  StalkMarketQuestion,
  StalkMarketBet,
  StalkMarketCrashEvent,
} from "@/lib/types";

// ============================================================
// Mock Data
// ============================================================

// Avatar colors mirror the AVATAR_COLORS palette in /src/lib/avatar-colors.ts
// so the dev preview mock players match the joining-screen picker.
const MOCK_PLAYERS: SessionPlayer[] = [
  { id: "p1",  session_id: "s1", display_name: "Alice",   avatar_color: "#FF00FF", score: 3200, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p2",  session_id: "s1", display_name: "Bob",     avatar_color: "#8B008B", score: 2800, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p3",  session_id: "s1", display_name: "Charlie", avatar_color: "#800000", score: 1900, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p4",  session_id: "s1", display_name: "Diana",   avatar_color: "#FF0000", score: 1500, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p5",  session_id: "s1", display_name: "Eve",     avatar_color: "#FF7F50", score: 800,  is_removed: false, joined_at: new Date().toISOString() },
  { id: "p6",  session_id: "s1", display_name: "Frank",   avatar_color: "#DAA520", score: 2400, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p7",  session_id: "s1", display_name: "Grace",   avatar_color: "#32CD32", score: 2100, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p8",  session_id: "s1", display_name: "Henry",   avatar_color: "#556B2F", score: 1700, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p9",  session_id: "s1", display_name: "Ivy",     avatar_color: "#4169E1", score: 1300, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p10", session_id: "s1", display_name: "Jack",    avatar_color: "#191970", score: 1100, is_removed: false, joined_at: new Date().toISOString() },
  { id: "p11", session_id: "s1", display_name: "Kate",    avatar_color: "#708090", score: 950,  is_removed: false, joined_at: new Date().toISOString() },
  { id: "p12", session_id: "s1", display_name: "Liam",    avatar_color: "#000000", score: 700,  is_removed: false, joined_at: new Date().toISOString() },
];

const MOCK_PLAYER = MOCK_PLAYERS[0];

const MOCK_SESSION_LOBBY: Session = {
  id: "s1", game_id: "g1", host_id: "h1", code: "DEMO",
  status: "lobby", current_question_index: -1, timer_seconds: 30, speed_bonus: true, is_paused: false,
  pir_current_item_id: null, pir_current_item_order: 0, pir_item_end_timestamp: null, pir_phase: "guessing",
  display_mode: "tv",
  sm_phase: "lobby", sm_current_question_id: null, sm_current_question_order: 0,
  sm_phase_end_timestamp: null, sm_spotlight_player_id: null, sm_crash_start_timestamp: null,
  sm_current_spotlight_answer: null,
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

const MOCK_ANSWERS: SessionAnswer[] = MOCK_PLAYERS.map((p, i) => ({
  id: `a${i + 1}`,
  session_id: "s1",
  player_id: p.id,
  question_id: "q1",
  choice_id: "c2",
  answered_at: new Date().toISOString(),
  is_correct: true,
  time_ms: 3000 + i * 400,
  points_awarded: 1500 - i * 100,
}));

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

// Stalk Market mock data
const MOCK_SM_GAME: Game = {
  id: "g_sm",
  host_id: "h1",
  title: "Sarah",
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

const MOCK_SM_QUESTIONS: StalkMarketQuestion[] = [
  { id: "smq1", game_id: "g_sm", question_order: 0, prompt: "What did you want to be when you were 8?", preloaded_answer: null, created_at: new Date().toISOString() },
  { id: "smq2", game_id: "g_sm", question_order: 1, prompt: "What's your worst irrational fear?", preloaded_answer: null, created_at: new Date().toISOString() },
  { id: "smq3", game_id: "g_sm", question_order: 2, prompt: "Most embarrassing song on your phone?", preloaded_answer: null, created_at: new Date().toISOString() },
];

const MOCK_SM_SESSION_LOBBY: Session = {
  ...MOCK_SESSION_LOBBY,
  sm_phase: "lobby",
  sm_current_question_id: null,
  sm_current_question_order: 0,
  sm_spotlight_player_id: "p1",
};

const MOCK_SM_SESSION_INVESTING: Session = {
  ...MOCK_SESSION_PLAYING,
  sm_phase: "investing",
  sm_current_question_id: "smq1",
  sm_current_question_order: 0,
  sm_spotlight_player_id: "p1",
  sm_current_spotlight_answer: "Astronaut",
  sm_phase_end_timestamp: new Date(Date.now() + 45000).toISOString(),
};

const MOCK_SM_SESSION_REVEAL: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  sm_phase: "reveal",
  sm_phase_end_timestamp: null,
};

const MOCK_SM_SESSION_LEADERBOARD: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  sm_phase: "leaderboard",
};

const MOCK_SM_SESSION_FINISHED: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  status: "finished",
  ended_at: new Date().toISOString(),
};

// Spotlight is p1 (Alice). Bettor view uses p2 (Bob).
const MOCK_SM_SPOTLIGHT: SessionPlayer = MOCK_PLAYERS[0];
const MOCK_SM_BETTOR: SessionPlayer = MOCK_PLAYERS[1];

const MOCK_SM_SESSION_SPOTLIGHT_ANSWER: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  sm_phase: "spotlight_answer",
  sm_current_spotlight_answer: null,
  sm_phase_end_timestamp: new Date(Date.now() + 25000).toISOString(),
};

const MOCK_SM_SESSION_CRASH: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  sm_phase: "crash",
  sm_crash_start_timestamp: new Date(Date.now() - 4000).toISOString(),
  sm_phase_end_timestamp: null,
};

// Bets for the current question — mix of correct/incorrect, varied chip counts.
const MOCK_SM_BETS: StalkMarketBet[] = [
  { id: "smb1", session_id: "s1", question_id: "smq1", player_id: "p2", guess_text: "astronaut", chips: 6, is_correct: true,  payout_cents: 18000, created_at: new Date().toISOString() },
  { id: "smb2", session_id: "s1", question_id: "smq1", player_id: "p2", guess_text: "doctor",    chips: 4, is_correct: false, payout_cents: 0,     created_at: new Date().toISOString() },
  { id: "smb3", session_id: "s1", question_id: "smq1", player_id: "p3", guess_text: "vet",       chips: 7, is_correct: false, payout_cents: 0,     created_at: new Date().toISOString() },
  { id: "smb4", session_id: "s1", question_id: "smq1", player_id: "p3", guess_text: "astronaut", chips: 3, is_correct: true,  payout_cents: 9000,  created_at: new Date().toISOString() },
  { id: "smb5", session_id: "s1", question_id: "smq1", player_id: "p4", guess_text: "teacher",   chips: 10, is_correct: false, payout_cents: 0,    created_at: new Date().toISOString() },
  { id: "smb6", session_id: "s1", question_id: "smq1", player_id: "p5", guess_text: "astronaut", chips: 5, is_correct: true,  payout_cents: 15000, created_at: new Date().toISOString() },
  { id: "smb7", session_id: "s1", question_id: "smq1", player_id: "p6", guess_text: "firefighter", chips: 10, is_correct: false, payout_cents: 0,  created_at: new Date().toISOString() },
];

// Mock cash-out events from other players for the crash player preview.
const MOCK_SM_CRASH_EVENTS: StalkMarketCrashEvent[] = [
  { id: "sce1", session_id: "s1", question_id: "smq1", player_id: "p3", cashout_ms: 8420, saved_cents: 8420, net_cents: -1580, created_at: new Date(Date.now() - 4000).toISOString() },
  { id: "sce2", session_id: "s1", question_id: "smq1", player_id: "p5", cashout_ms: 9510, saved_cents: 14265, net_cents: 4265, created_at: new Date(Date.now() - 2500).toISOString() },
  { id: "sce3", session_id: "s1", question_id: "smq1", player_id: "p4", cashout_ms: 6900, saved_cents: 6900, net_cents: -3100, created_at: new Date(Date.now() - 1800).toISOString() },
  { id: "sce4", session_id: "s1", question_id: "smq1", player_id: "p6", cashout_ms: null, saved_cents: 0, net_cents: -10000, created_at: new Date(Date.now() - 800).toISOString() },
];

// Generates a fake bets array for the reveal screen so dev sliders can control
// how many correct / wrong submissions are shown.
const WRONG_GUESS_POOL = [
  "doctor", "vet", "teacher", "firefighter", "lawyer", "chef", "artist",
  "writer", "pilot", "actor", "musician", "scientist", "engineer", "athlete",
  "nurse", "police officer", "astronaut", "baker", "designer", "dancer",
  "carpenter", "farmer", "tailor", "diplomat", "novelist", "trader",
  "plumber", "electrician", "barista", "photographer",
];
function generateRevealBets(correctCount: number, wrongCount: number): StalkMarketBet[] {
  const bets: StalkMarketBet[] = [];
  for (let i = 0; i < correctCount; i++) {
    const p = MOCK_PLAYERS[i % MOCK_PLAYERS.length];
    const chips = 2 + (i % 8);
    bets.push({
      id: `gen-c${i}`,
      session_id: "s1",
      question_id: "smq1",
      player_id: p.id,
      guess_text: "astronaut",
      chips,
      is_correct: true,
      payout_cents: chips * 3000,
      created_at: new Date().toISOString(),
    });
  }
  for (let i = 0; i < wrongCount; i++) {
    const p = MOCK_PLAYERS[(correctCount + i) % MOCK_PLAYERS.length];
    bets.push({
      id: `gen-w${i}`,
      session_id: "s1",
      question_id: "smq1",
      player_id: p.id,
      guess_text: WRONG_GUESS_POOL[i % WRONG_GUESS_POOL.length],
      chips: 2 + (i % 9),
      is_correct: false,
      payout_cents: 0,
      created_at: new Date().toISOString(),
    });
  }
  return bets;
}

// ============================================================
// Host Remote dev harnesses — wrap each HostRemote with local state
// so pause/kick/next mutations cycle the UI without hitting Supabase.
// ============================================================

function TriviaHostHarness({ initialStatus }: { initialStatus: "lobby" | "playing" }) {
  const [session, setSession] = useState<Session>(() => ({
    ...MOCK_SESSION_LOBBY,
    status: initialStatus,
    current_question_index: initialStatus === "playing" ? 2 : -1,
  }));
  const [players, setPlayers] = useState<SessionPlayer[]>(MOCK_PLAYERS);
  const [questionState, setQuestionState] = useState<SessionQuestionState | null>(
    initialStatus === "playing" ? MOCK_QUESTION_STATE : null
  );
  const [answers, setAnswers] = useState<SessionAnswer[]>(MOCK_ANSWERS);
  const questions = useMemo<GameQuestion[]>(() => Array.from({ length: 5 }, (_, i) => ({
    id: `q${i + 1}`, game_id: "g1", question_order: i,
    prompt: MOCK_QUESTION.prompt, explanation: null, created_at: new Date().toISOString(),
  })), []);

  const onAction = useCallback((action: string, payload?: Record<string, unknown>) => {
    if (action === "start_game") {
      setSession((s) => ({ ...s, status: "playing", current_question_index: 0 }));
      setQuestionState({ ...MOCK_QUESTION_STATE, question_index: 0 });
    } else if (action === "pause_resume") {
      setQuestionState((qs) => qs ? { ...qs, is_paused: !qs.is_paused } : qs);
    } else if (action === "end_question_early") {
      setQuestionState((qs) => qs ? { ...qs, is_locked: true, show_results: true } : qs);
    } else if (action === "show_leaderboard") {
      setQuestionState((qs) => qs ? { ...qs, show_leaderboard: true } : qs);
    } else if (action === "next_question") {
      setSession((s) => ({ ...s, current_question_index: s.current_question_index + 1 }));
      setQuestionState({ ...MOCK_QUESTION_STATE });
      setAnswers([]);
    } else if (action === "kick_player") {
      const id = payload?.playerId as string;
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    } else if (action === "end_game") {
      setSession((s) => ({ ...s, status: "finished", ended_at: new Date().toISOString() }));
    }
  }, []);

  return (
    <TriviaHostRemote
      sessionId="dev"
      devMode={{ session, players, questions, questionState, answers, timerSeconds: 30, onAction }}
    />
  );
}

function PIRHostHarness({ initialStatus }: { initialStatus: "lobby" | "playing" }) {
  const [session, setSession] = useState<Session>(() => ({
    ...(initialStatus === "playing" ? MOCK_PIR_SESSION_GUESSING : MOCK_SESSION_LOBBY),
    status: initialStatus,
  }));
  const [players, setPlayers] = useState<SessionPlayer[]>(MOCK_PLAYERS);
  const [guesses, setGuesses] = useState<PriceGuess[]>(MOCK_PIR_GUESSES);
  const items = MOCK_PIR_ITEMS;

  const onAction = useCallback((action: string, payload?: Record<string, unknown>) => {
    if (action === "start_game") {
      setSession((s) => ({ ...s, status: "playing", pir_phase: "guessing", pir_current_item_id: items[0].id, pir_current_item_order: 0 }));
      setGuesses([]);
    } else if (action === "show_price_result") {
      setSession((s) => ({ ...s, pir_phase: "price_result" }));
    } else if (action === "pay_the_price") {
      setSession((s) => ({ ...s, pir_phase: "pay_the_price" }));
    } else if (action === "show_leaderboard") {
      setSession((s) => ({ ...s, pir_phase: "leaderboard" }));
    } else if (action === "next_item") {
      setSession((s) => {
        const nextOrder = (s.pir_current_item_order || 0) + 1;
        if (nextOrder >= items.length) return { ...s, status: "finished", ended_at: new Date().toISOString() };
        return { ...s, pir_phase: "guessing", pir_current_item_id: items[nextOrder].id, pir_current_item_order: nextOrder };
      });
      setGuesses([]);
    } else if (action === "toggle_pause") {
      setSession((s) => ({ ...s, is_paused: !s.is_paused }));
    } else if (action === "kick_player") {
      const id = payload?.playerId as string;
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    } else if (action === "finish_game") {
      setSession((s) => ({ ...s, status: "finished", ended_at: new Date().toISOString() }));
    }
  }, [items]);

  return (
    <PIRHostRemote
      sessionId="dev"
      devMode={{ session, players, items, guesses, onAction }}
    />
  );
}

function SMHostHarness({ initialPhase }: { initialPhase: "lobby" | "investing" }) {
  const [session, setSession] = useState<Session>(() => {
    if (initialPhase === "lobby") return MOCK_SM_SESSION_LOBBY;
    return MOCK_SM_SESSION_INVESTING;
  });
  const [players, setPlayers] = useState<SessionPlayer[]>(MOCK_PLAYERS);
  const [bets, setBets] = useState<StalkMarketBet[]>(MOCK_SM_BETS);
  const game = MOCK_SM_GAME;
  const questions = MOCK_SM_QUESTIONS;

  const onAction = useCallback((action: string, payload?: Record<string, unknown>) => {
    if (action === "set_spotlight") {
      setSession((s) => ({ ...s, sm_spotlight_player_id: (payload?.playerId as string | null) ?? null }));
    } else if (action === "start_game") {
      setSession((s) => ({ ...s, status: "playing", sm_phase: "investing", sm_current_question_id: questions[0].id, sm_current_question_order: 0, sm_phase_end_timestamp: null }));
    } else if (action === "start_investing_timer") {
      // Mimic the real server: countdown from the configured per-game seconds.
      setSession((s) => ({ ...s, sm_phase_end_timestamp: new Date(Date.now() + 60_000).toISOString() }));
    } else if (action === "mark_guesses") {
      const decisions = (payload?.decisions as Array<{ betId: string; is_correct: boolean }>) || [];
      const byId = new Map(decisions.map((d) => [d.betId, d.is_correct]));
      setBets((prev) =>
        prev.map((b) => (byId.has(b.id) ? { ...b, is_correct: byId.get(b.id)! } : b))
      );
    } else if (action === "reopen_bets") {
      const playerId = payload?.playerId as string;
      const questionId = payload?.questionId as string;
      setBets((prev) =>
        prev.filter(
          (b) => !(b.player_id === playerId && b.question_id === questionId)
        )
      );
    } else if (action === "reveal") {
      // Flip phase and force every still-null bet to false, matching the server.
      setBets((prev) =>
        prev.map((b) => (b.is_correct === null ? { ...b, is_correct: false } : b))
      );
      setSession((s) => ({ ...s, sm_phase: "reveal", sm_phase_end_timestamp: null }));
    } else if (action === "trigger_crash") {
      setSession((s) => ({ ...s, sm_phase: "crash", sm_crash_start_timestamp: null, sm_phase_end_timestamp: null }));
    } else if (action === "advance_to_leaderboard") {
      setSession((s) => ({ ...s, sm_phase: "leaderboard" }));
    } else if (action === "next_question") {
      const nextOrder = (session.sm_current_question_order || 0) + 1;
      const next = questions[nextOrder];
      if (next) {
        setSession((s) => ({
          ...s,
          sm_phase: "investing",
          sm_current_question_id: next.id,
          sm_current_question_order: nextOrder,
          sm_phase_end_timestamp: null,
          sm_current_spotlight_answer: null,
        }));
        setBets([]);
      }
    } else if (action === "finish_game") {
      setSession((s) => ({ ...s, status: "finished", ended_at: new Date().toISOString() }));
    } else if (action === "toggle_pause") {
      setSession((s) => ({ ...s, is_paused: !s.is_paused }));
    } else if (action === "kick_player") {
      const id = payload?.playerId as string;
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    }
  }, [questions, session.sm_current_question_order]);

  return (
    <SMHostRemote
      sessionId="dev"
      devMode={{ session, game, players, questions, bets, crashEvents: [], onAction }}
    />
  );
}

// Paused variants for player/screen previews so the overlay can be inspected
const MOCK_TRIVIA_SESSION_PAUSED: Session = {
  ...MOCK_SESSION_PLAYING,
  is_paused: true,
};

const MOCK_PIR_SESSION_PAUSED: Session = {
  ...MOCK_PIR_SESSION_GUESSING,
  is_paused: true,
};

const MOCK_SM_SESSION_PAUSED: Session = {
  ...MOCK_SM_SESSION_INVESTING,
  is_paused: true,
};

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
  { id: "tp-joining", label: "Joining", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "joining", session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, gameName: "History Trivia" }} />
  )},
  { id: "tp-lobby", label: "Lobby", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: MOCK_PLAYERS, gameName: "History Trivia" }} />
  )},
  { id: "tp-question", label: "Question", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "question", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, timeLeft: 18 }} />
  )},
  { id: "tp-results", label: "Results", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "results", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answerResult: { correct: true, points: 1350 } }} />
  )},
  { id: "tp-leaderboard", label: "Leaderboard", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_SESSION_PLAYING, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-finished", label: "Finished", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "tp-removed", label: "Removed", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "removed", session: MOCK_SESSION_PLAYING }} />
  )},
  { id: "tp-error", label: "Error", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "error", error: "Game not found. Check the code and try again." }} />
  )},
  { id: "tp-paused", label: "Paused", group: "SOTD — Player", render: () => (
    <TriviaPlayerPage sessionCode="DEMO" devMode={{ phase: "question", session: MOCK_TRIVIA_SESSION_PAUSED, player: MOCK_PLAYER, players: MOCK_PLAYERS, questionState: { ...MOCK_QUESTION_STATE, is_paused: true }, currentQuestion: MOCK_QUESTION, timeLeft: 18 }} />
  )},

  // Trivia Host Remote
  { id: "th-lobby", label: "Lobby", group: "SOTD — Host", render: () => (
    <TriviaHostHarness initialStatus="lobby" />
  )},
  { id: "th-playing", label: "Playing", group: "SOTD — Host", render: () => (
    <TriviaHostHarness initialStatus="playing" />
  )},

  // Trivia Screen
  { id: "ts-lobby", label: "Lobby", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, totalQuestions: 10 }} />
  )},
  { id: "ts-question", label: "Active Question", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS.slice(0, 2), timeLeft: 18, totalQuestions: 10 }} />
  )},
  { id: "ts-results", label: "Results", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_RESULTS, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10 }} />
  )},
  { id: "ts-leaderboard", label: "Leaderboard", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_PLAYING, players: MOCK_PLAYERS, questionState: MOCK_QUESTION_STATE_LEADERBOARD, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS, totalQuestions: 10, showLeaderboard: true }} />
  )},
  { id: "ts-finished", label: "Finished", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, totalQuestions: 10 }} />
  )},
  { id: "ts-paused", label: "Paused", group: "SOTD — Screen", render: () => (
    <TriviaScreenPage sessionCode="DEMO" devMode={{ session: MOCK_TRIVIA_SESSION_PAUSED, players: MOCK_PLAYERS, questionState: { ...MOCK_QUESTION_STATE, is_paused: true }, currentQuestion: MOCK_QUESTION, answers: MOCK_ANSWERS.slice(0, 2), timeLeft: 18, totalQuestions: 10 }} />
  )},

  // PIR Player
  { id: "pp-joining", label: "Joining", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "joining", session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, gameName: "Friday Night Prices" }} />
  )},
  { id: "pp-lobby", label: "Lobby", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "lobby", session: MOCK_SESSION_LOBBY, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-guessing", label: "Guessing", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessing", session: MOCK_PIR_SESSION_GUESSING, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0] }} />
  )},
  { id: "pp-guessed", label: "Guessed", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessed", session: MOCK_PIR_SESSION_GUESSING, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: MOCK_PIR_MY_GUESS }} />
  )},
  { id: "pp-price-result", label: "Price Result", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "price_result", session: MOCK_PIR_SESSION_RESULT, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0], myGuess: MOCK_PIR_MY_GUESS }} />
  )},
  { id: "pp-pay-the-price", label: "Pay The Price", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "pay_the_price", session: MOCK_PIR_SESSION_PAY_TV, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-leaderboard", label: "Leaderboard", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "leaderboard", session: MOCK_PIR_SESSION_LEADERBOARD, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-finished", label: "Finished", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "finished", session: MOCK_SESSION_FINISHED, player: MOCK_PLAYER, players: MOCK_PLAYERS }} />
  )},
  { id: "pp-removed", label: "Removed", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "removed", session: MOCK_SESSION_PLAYING }} />
  )},
  { id: "pp-error", label: "Error", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "error", error: "Game not found. Check the code and try again." }} />
  )},
  { id: "pp-paused", label: "Paused", group: "TCHM — Player", render: () => (
    <PIRPlayerPage sessionCode="DEMO" devMode={{ phase: "guessing", session: MOCK_PIR_SESSION_PAUSED, player: MOCK_PLAYER, players: MOCK_PLAYERS, currentItem: MOCK_PIR_ITEMS[0] }} />
  )},

  // PIR Host Remote
  { id: "ph-lobby", label: "Lobby", group: "TCHM — Host", render: () => (
    <PIRHostHarness initialStatus="lobby" />
  )},
  { id: "ph-playing", label: "Playing", group: "TCHM — Host", render: () => (
    <PIRHostHarness initialStatus="playing" />
  )},

  // PIR Screen
  { id: "ps-lobby", label: "Lobby", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_LOBBY, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, gameName: "Friday Night Prices", gameTopic: "Christmas Party Edition" }} />
  )},
  { id: "ps-guessing", label: "Guessing", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_GUESSING, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES.slice(0, 2) }} />
  )},
  { id: "ps-price-result", label: "Price Result", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_RESULT, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />
  )},
  { id: "ps-leaderboard", label: "Leaderboard", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_LEADERBOARD, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES }} />
  )},
  { id: "ps-finished", label: "Finished", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SESSION_FINISHED, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS }} />
  )},
  { id: "ps-paused", label: "Paused", group: "TCHM — Screen", render: () => (
    <PIRScreenPage sessionCode="DEMO" devMode={{ session: MOCK_PIR_SESSION_PAUSED, players: MOCK_PLAYERS, items: MOCK_PIR_ITEMS, guesses: MOCK_PIR_GUESSES.slice(0, 2) }} />
  )},

  // Stalk Market Player
  { id: "smp-joining", label: "Joining", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "joining", session: MOCK_SM_SESSION_LOBBY, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS }} />
  )},
  { id: "smp-lobby-bettor", label: "Lobby (Bettor)", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_LOBBY, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS }} />
  )},
  { id: "smp-lobby-spotlight", label: "Lobby (Spotlight)", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_LOBBY, game: MOCK_SM_GAME, player: MOCK_SM_SPOTLIGHT, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS }} />
  )},
  { id: "smp-spotlight-answer", label: "Spotlight Answer", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_SPOTLIGHT_ANSWER, game: MOCK_SM_GAME, player: MOCK_SM_SPOTLIGHT, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS }} />
  )},
  { id: "smp-investing-bettor", label: "Investing (Bettor)", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_INVESTING, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},
  { id: "smp-investing-spotlight", label: "Investing (Spotlight)", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_INVESTING, game: MOCK_SM_GAME, player: MOCK_SM_SPOTLIGHT, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},
  { id: "smp-reveal", label: "Reveal", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_REVEAL, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},
  { id: "smp-crash", label: "Crash", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_CRASH, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: MOCK_SM_CRASH_EVENTS }} />
  )},
  { id: "smp-leaderboard", label: "Leaderboard", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_LEADERBOARD, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},
  { id: "smp-finished", label: "Finished", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_FINISHED, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},
  { id: "smp-removed", label: "Removed", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "removed", session: MOCK_SM_SESSION_INVESTING, game: MOCK_SM_GAME }} />
  )},
  { id: "smp-error", label: "Error", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "error", errorMsg: "Game not found. Check the code and try again." }} />
  )},
  { id: "smp-paused", label: "Paused", group: "SM — Player", render: () => (
    <SMPlayerPage sessionCode="DEMO" devMode={{ phase: "playing", session: MOCK_SM_SESSION_PAUSED, game: MOCK_SM_GAME, player: MOCK_SM_BETTOR, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS }} />
  )},

  // Stalk Market Host Remote
  { id: "smh-lobby", label: "Lobby", group: "SM — Host", render: () => (
    <SMHostHarness initialPhase="lobby" />
  )},
  { id: "smh-investing", label: "Investing", group: "SM — Host", render: () => (
    <SMHostHarness initialPhase="investing" />
  )},

  // Stalk Market Screen
  { id: "sms-lobby", label: "Lobby", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_LOBBY, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: [], crashEvents: [] }} />
  )},
  { id: "sms-investing", label: "Investing", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_INVESTING, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: [] }} />
  )},
  { id: "sms-reveal", label: "Reveal", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_REVEAL, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: [] }} />
  )},
  { id: "sms-leaderboard", label: "Leaderboard", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_LEADERBOARD, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: [] }} />
  )},
  { id: "sms-finished", label: "Finished", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_FINISHED, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: [] }} />
  )},
  { id: "sms-crash", label: "Crash Alert", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_CRASH, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: MOCK_SM_CRASH_EVENTS }} />
  )},
  { id: "sms-paused", label: "Paused", group: "SM — Screen", render: () => (
    <SMScreenPage sessionCode="DEMO" devMode={{ session: MOCK_SM_SESSION_PAUSED, game: MOCK_SM_GAME, players: MOCK_PLAYERS, questions: MOCK_SM_QUESTIONS, bets: MOCK_SM_BETS, crashEvents: [] }} />
  )},
];

// ============================================================
// Dev Page Component
// ============================================================

const GROUPS = [...new Set(SCREENS.map((s) => s.group))];

export default function DevPreviewPage() {
  const [activeScreen, setActiveScreen] = useState(SCREENS[0].id);
  const [viewMode, setViewMode] = useState<"phone" | "tablet" | "desktop" | "full">("full");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set([SCREENS[0].group]));
  const [selectedTheme, setSelectedTheme] = useState<GameTheme>(DEFAULT_THEME.price_is_right);
  const [badGuess, setBadGuess] = useState(false);
  const [onTheGo, setOnTheGo] = useState(false);
  const [atRisk, setAtRisk] = useState(false);
  const [playerCount, setPlayerCount] = useState(4);
  const [triviaCorrect, setTriviaCorrect] = useState(true);
  const [smLocked, setSmLocked] = useState(true);
  const [revealCorrect, setRevealCorrect] = useState(3);
  const [revealWrong, setRevealWrong] = useState(7);
  // When set, overrides the SM Investing (Bettor) session's end timestamp
  // so the tester can preview the last-10s urgency border.
  const [smInvestingEndsAt, setSmInvestingEndsAt] = useState<number | null>(null);

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
    tablet: { aspectRatio: "820 / 1180", height: "100%", maxHeight: "calc(100vh - 100px)" },
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
            {(["phone", "tablet", "desktop", "full"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg font-medium transition ${
                  viewMode === mode
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10"
                }`}
              >
                {mode === "phone" ? "Phone" : mode === "tablet" ? "Tablet" : mode === "desktop" ? "Desktop" : "Full"}
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
              borderRadius: viewMode === "phone" ? "24px" : viewMode === "tablet" ? "20px" : "8px",
              border: "2px solid rgba(255,255,255,0.1)",
              boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
            }}
          >
            {/* Player-count slider for guessing/price-result screens */}
            {(current.id === "ps-guessing" || current.id === "ps-price-result") && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/80 border border-white/15 backdrop-blur">
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

            {/* Player-count slider for leaderboard/finished screens */}
            {(current.id === "ps-leaderboard" || current.id === "ps-finished") && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/80 border border-white/15 backdrop-blur">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                  {playerCount} {playerCount === 1 ? "player" : "players"}
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

            {/* Trivia results: Right / Wrong toggle */}
            {current.id === "tp-results" && (
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => setTriviaCorrect(!triviaCorrect)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    background: triviaCorrect ? "rgba(21,128,61,0.14)" : "rgba(185,28,28,0.14)",
                    color: triviaCorrect ? "#15803d" : "#B91C1C",
                    border: `1px solid ${triviaCorrect ? "rgba(21,128,61,0.35)" : "rgba(185,28,28,0.35)"}`,
                  }}
                >
                  {triviaCorrect ? "Correct" : "Wrong"}
                </button>
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
            {/* Placing / Locked-in toggle for the SM Investing (Bettor) screen */}
            {current.id === "smp-investing-bettor" && (
              <div className="absolute top-2 right-2 z-10 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSmInvestingEndsAt(Date.now() + 15_000)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25"
                >
                  ▶ 15s test
                </button>
                <button
                  type="button"
                  onClick={() => setSmLocked(!smLocked)}
                  className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    background: smLocked ? "rgba(21,128,61,0.14)" : "rgba(99,102,241,0.14)",
                    color: smLocked ? "#15803d" : "#6366f1",
                    border: `1px solid ${smLocked ? "rgba(21,128,61,0.35)" : "rgba(99,102,241,0.35)"}`,
                  }}
                >
                  {smLocked ? "Locked in" : "Placing"}
                </button>
              </div>
            )}
            {/* Reveal screen sliders: control correct + wrong submission counts */}
            {current.id === "sms-reveal" && (
              <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5 bg-zinc-950/80 border border-white/15 px-3 py-2 rounded-lg backdrop-blur min-w-[180px]">
                <label className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <span>✓ Right · {revealCorrect}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={revealCorrect}
                  onChange={(e) => setRevealCorrect(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <label className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-300 mt-1">
                  <span>✗ Wrong · {revealWrong}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={1}
                  value={revealWrong}
                  onChange={(e) => setRevealWrong(Number(e.target.value))}
                  className="w-full accent-rose-500"
                />
              </div>
            )}
            <div key={`${current.id}-${badGuess}-${onTheGo}-${atRisk}-${playerCount}-${triviaCorrect}-${smLocked}-${revealCorrect}-${revealWrong}-${smInvestingEndsAt ?? ""}`} className={`w-full h-full ${current.group.includes("Screen") ? "overflow-hidden" : "overflow-auto"}`}>
              <ThemeProvider theme={selectedTheme}>
                {current.id === "tp-results"
                  ? <TriviaPlayerPage sessionCode="DEMO" devMode={{
                      phase: "results",
                      session: MOCK_SESSION_PLAYING,
                      player: MOCK_PLAYER,
                      players: MOCK_PLAYERS,
                      questionState: MOCK_QUESTION_STATE_RESULTS,
                      currentQuestion: MOCK_QUESTION,
                      answerResult: { correct: triviaCorrect, points: triviaCorrect ? 1350 : 0 },
                      selectedChoiceId: triviaCorrect ? "c2" : "c1",
                    }} />
                  : current.id === "pp-price-result"
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
                  : current.id === "ps-leaderboard"
                  ? <PIRScreenPage sessionCode="DEMO" devMode={{
                      session: MOCK_PIR_SESSION_LEADERBOARD,
                      players: MOCK_PLAYERS.slice(0, playerCount),
                      items: MOCK_PIR_ITEMS,
                      guesses: MOCK_PIR_GUESSES.slice(0, playerCount),
                    }} />
                  : current.id === "ps-finished"
                  ? <PIRScreenPage sessionCode="DEMO" devMode={{
                      session: MOCK_SESSION_FINISHED,
                      players: MOCK_PLAYERS.slice(0, playerCount),
                      items: MOCK_PIR_ITEMS,
                    }} />
                  : current.id === "smp-investing-bettor"
                  ? <SMPlayerPage sessionCode="DEMO" devMode={{
                      phase: "playing",
                      session: smInvestingEndsAt
                        ? { ...MOCK_SM_SESSION_INVESTING, sm_phase_end_timestamp: new Date(smInvestingEndsAt).toISOString() }
                        : MOCK_SM_SESSION_INVESTING,
                      game: MOCK_SM_GAME,
                      player: MOCK_SM_BETTOR,
                      players: MOCK_PLAYERS,
                      questions: MOCK_SM_QUESTIONS,
                      bets: smLocked ? MOCK_SM_BETS : MOCK_SM_BETS.filter((b) => b.player_id !== MOCK_SM_BETTOR.id),
                    }} />
                  : current.id === "sms-reveal"
                  ? <SMScreenPage sessionCode="DEMO" devMode={{
                      session: MOCK_SM_SESSION_REVEAL,
                      game: MOCK_SM_GAME,
                      players: MOCK_PLAYERS,
                      questions: MOCK_SM_QUESTIONS,
                      bets: generateRevealBets(revealCorrect, revealWrong),
                      crashEvents: [],
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
