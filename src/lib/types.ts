export type AgeRange = "teenagers" | "young_adults" | "older_adults" | "mix";
export type Difficulty = "easy" | "medium" | "hard" | "mix";
export type SessionStatus = "lobby" | "playing" | "finished";
export type GameType = "trivia" | "price_is_right";
export type PIRPhase = "guessing" | "price_result" | "pay_the_price" | "leaderboard";
export type DisplayMode = "tv" | "on_the_go";

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  referral_code: string;
  referred_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ThemeFont =
  | "Montserrat"
  | "DM Sans"
  | "Inter"
  | "Poppins"
  | "Space Grotesk"
  | "Outfit"
  | "Sora"
  | "Raleway"
  | "Nunito"
  | "Bebas Neue"
  | "Oswald"
  | "Playfair Display";

export interface GameTheme {
  id: string;
  name: string;
  bg: string;
  surface: string;
  surfaceLight: string;
  accent: string;
  accentDim: string;
  textPrimary: string;
  textMuted: string;
  textDim: string;
  border: string;
  danger: string;
  headingFont: ThemeFont;
  bodyFont: ThemeFont;
  bodyTextMode: "light" | "dark";
  buttonTextMode: "light" | "dark";
}

export interface Game {
  id: string;
  host_id: string;
  title: string;
  topic: string;
  game_type: GameType;
  age_range: AgeRange;
  difficulty: Difficulty;
  timer_seconds: number;
  speed_bonus: boolean;
  show_percent: boolean;
  round_prices: boolean;
  is_shared: boolean;
  penalty_cheap: string | null;
  penalty_expensive: string | null;
  penalty_margin: number;
  theme: GameTheme | null;
  created_at: string;
  updated_at: string;
}

export interface GameQuestion {
  id: string;
  game_id: string;
  question_order: number;
  prompt: string;
  explanation: string | null;
  created_at: string;
}

export interface GameQuestionChoice {
  id: string;
  question_id: string;
  choice_text: string;
  is_correct: boolean;
  choice_order: number;
}

export interface Session {
  id: string;
  game_id: string;
  host_id: string;
  code: string;
  status: SessionStatus;
  current_question_index: number;
  timer_seconds: number;
  speed_bonus: boolean;
  // PIR-specific fields
  pir_current_item_id: string | null;
  pir_current_item_order: number;
  pir_item_end_timestamp: string | null;
  pir_phase: PIRPhase;
  display_mode: DisplayMode;
  created_at: string;
  ended_at: string | null;
}

export interface SessionPlayer {
  id: string;
  session_id: string;
  display_name: string;
  avatar_color: string;
  score: number;
  is_removed: boolean;
  joined_at: string;
}

export interface SessionQuestionState {
  id: string;
  session_id: string;
  question_index: number;
  question_id: string;
  started_at: string | null;
  ends_at: string | null;
  is_paused: boolean;
  paused_remaining_ms: number | null;
  is_locked: boolean;
  show_results: boolean;
  show_leaderboard: boolean;
}

export interface SessionAnswer {
  id: string;
  session_id: string;
  player_id: string;
  question_id: string;
  choice_id: string;
  answered_at: string;
  is_correct: boolean;
  time_ms: number;
  points_awarded: number;
}

// AI generation types
export interface GeneratedQuestion {
  prompt: string;
  choices: { text: string; isCorrect: boolean }[];
  explanation?: string;
}

export interface GenerateQuestionsRequest {
  topic: string;
  ageRange: AgeRange;
  difficulty: Difficulty;
  count: number;
}

export interface GenerateQuestionsResponse {
  topic: string;
  ageRange: AgeRange;
  difficulty: Difficulty;
  questions: GeneratedQuestion[];
}

// Extended types with relations
export interface GameQuestionWithChoices extends GameQuestion {
  game_question_choices: GameQuestionChoice[];
}

export interface GameWithQuestions extends Game {
  game_questions: GameQuestionWithChoices[];
}

// ============================================================
// Price Is Right Types
// ============================================================

export interface PriceIsRightItem {
  id: string;
  game_id: string;
  item_order: number;
  name: string;
  image: string | null;
  price: number; // in cents
  description: string | null;
  difficulty: string;
  created_at: string;
}

export interface PriceGuess {
  id: string;
  session_id: string;
  player_id: string;
  item_id: string;
  guess: number;
  score_awarded: number;
  tier: string | null;
  guess_accuracy: number;
  paid_the_price: boolean;
  created_at: string;
}

export interface PriceGuessWithPlayer extends PriceGuess {
  session_players: SessionPlayer;
}

export interface PIRScoreEntry {
  player: SessionPlayer;
  guess: number | null;
  score: number;
  totalScore: number;
  tier: string;
  guessAccuracy: number | null;
  totalAccuracy: number;
  paidThePrice: boolean;
}

export interface GameWithItems extends Game {
  price_is_right_items: PriceIsRightItem[];
}
