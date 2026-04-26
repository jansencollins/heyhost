/**
 * Game Type Registry
 *
 * Central configuration for all game types. To add a new game type:
 * 1. Add an entry to GAME_TYPES below
 * 2. Create the component files it references
 * 3. Add any new DB tables/schema
 * 4. Register the game type key in the GameType union in types.ts
 *
 * That's it — routing, dashboard, game library, and play/host/screen
 * pages all read from this registry automatically.
 */

import type { ComponentType } from "react";
import type { GameType } from "./types";

// Props that every host remote component receives
export interface HostRemoteProps {
  sessionId: string;
}

// Props that every player component receives
export interface PlayerPageProps {
  sessionCode: string;
}

// Props that every screen/display component receives
export interface ScreenPageProps {
  sessionCode: string;
}


export interface GameTypeConfig {
  /** Unique key matching the DB game_type column and GameType union */
  key: GameType;

  /** Human-readable name */
  label: string;

  /** Short description shown in "New Game" menus */
  description: string;

  /** Emoji or icon for quick identification */
  icon: string;

  /** Thumbnail image path (in /public/) for dashboard cards */
  thumbnail: string;

  /** Default host route for starting a session */
  hostRoute: (sessionId: string) => string;

  /** Player route */
  playerRoute: (sessionCode: string) => string;

  /** Screen/projector route */
  screenRoute: (sessionCode: string) => string;

  /** Dashboard creation page path */
  createRoute: string;

  /** Dashboard edit page path */
  editRoute: (gameId: string) => string;

  /**
   * Lazy-loaded components for each view.
   * Using dynamic imports keeps the bundle small — only the active
   * game type's code is loaded.
   */
  components: {
    HostRemote: () => Promise<{ default: ComponentType<HostRemoteProps> }>;
    PlayerPage: () => Promise<{ default: ComponentType<PlayerPageProps> }>;
    ScreenPage: () => Promise<{ default: ComponentType<ScreenPageProps> }>;
  };
}

/**
 * All registered game types. Add new game types here.
 */
export const GAME_TYPES: Record<GameType, GameTypeConfig> = {
  trivia: {
    key: "trivia",
    label: "Straight Off The Dome",
    description: "Multiple choice questions",
    icon: "🧠",
    thumbnail: "/straight-off-the-dome-thumbnail.png",
    hostRoute: (sessionId) => `/host/${sessionId}`,
    playerRoute: (sessionCode) => `/play/${sessionCode}`,
    screenRoute: (sessionCode) => `/screen/${sessionCode}`,
    createRoute: "/dashboard/games/new/straight-off-the-dome",
    editRoute: (gameId) => `/dashboard/games/${gameId}`,
    components: {
      HostRemote: () => import("@/components/games/trivia/HostRemote"),
      PlayerPage: () => import("@/components/games/trivia/PlayerPage"),
      ScreenPage: () => import("@/components/games/trivia/ScreenPage"),
    },
  },
  price_is_right: {
    key: "price_is_right",
    label: "That Costs How Much!?",
    description: "Guess the price of items",
    icon: "💰",
    thumbnail: "/that-costs-how-much-thumbnail.png",
    hostRoute: (sessionId) => `/host/${sessionId}`,
    playerRoute: (sessionCode) => `/play/${sessionCode}`,
    screenRoute: (sessionCode) => `/screen/${sessionCode}`,
    createRoute: "/dashboard/games/new/that-costs-how-much",
    editRoute: (gameId) => `/dashboard/games/${gameId}/that-costs-how-much`,
    components: {
      HostRemote: () => import("@/components/games/pir/HostRemote"),
      PlayerPage: () => import("@/components/games/pir/PlayerPage"),
      ScreenPage: () => import("@/components/games/pir/ScreenPage"),
    },
  },
};

/** Get config for a game type, with fallback to trivia */
export function getGameTypeConfig(gameType: GameType): GameTypeConfig {
  return GAME_TYPES[gameType] || GAME_TYPES.trivia;
}

/** Get all game types as an array (useful for rendering menus) */
export function getAllGameTypes(): GameTypeConfig[] {
  return Object.values(GAME_TYPES);
}
