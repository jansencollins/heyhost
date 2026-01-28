export type AgeRange = "teenagers" | "young_adults" | "older_adults" | "mix";
export type Difficulty = "easy" | "medium" | "hard" | "mix";
export type SessionStatus = "lobby" | "playing" | "finished";

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Game {
  id: string;
  host_id: string;
  title: string;
  topic: string;
  age_range: AgeRange;
  difficulty: Difficulty;
  timer_seconds: number;
  speed_bonus: boolean;
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
