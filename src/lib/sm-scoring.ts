/**
 * Stalk Market scoring — pure functions, no I/O.
 *
 * Money is tracked in CENTS throughout to avoid float drift. The standard
 * round stake is 10000 cents ($100), dealt as ten $10 chips.
 *
 * Two scoring versions:
 *   - pari_mutuel: closed-economy. Wrong dollars fund right dollars; round
 *     always nets to zero across the room.
 *   - concentration: open-economy. Bank pays out by a multiplier that
 *     scales inversely with how many guesses the player split across.
 *
 * Plus the crash mini-game: 0–10 second count-in-your-head with a precision
 * bonus zone in the final second.
 */

import type { SMScoringVersion } from "./types";

export const ROUND_STAKE_CENTS = 10000; // $100 per bettor per round
export const CHIP_VALUE_CENTS = 1000; // $10 per chip
export const CHIPS_PER_ROUND = 10;
export const MAX_GUESSES_PER_ROUND = 5;

// Crash mini-game constants (all in milliseconds)
export const CRASH_DURATION_MS = 10_000;
export const CRASH_PRECISION_WINDOW_MS = 1_000; // last 1s gets the bonus
export const CRASH_PRECISION_MULTIPLIER = 1.5;

export interface BetInput {
  player_id: string;
  guess_text: string;
  chips: number;
  is_correct: boolean;
}

export interface BetPayout {
  player_id: string;
  guess_text: string;
  chips: number;
  is_correct: boolean;
  stake_cents: number; // chips × $10
  payout_cents: number; // gross return on this guess (0 if wrong)
}

/**
 * Compute payouts for one round given the scoring version.
 *
 * Returns one BetPayout per input bet. Sum of all payouts for a player on
 * one question = their gross return for that question. Net P/L for that
 * question = (sum of payouts) − $100 stake.
 */
export function computeRoundPayouts(
  bets: BetInput[],
  version: SMScoringVersion
): BetPayout[] {
  if (version === "pari_mutuel") {
    return computePariMutuel(bets);
  }
  return computeConcentration(bets);
}

function computePariMutuel(bets: BetInput[]): BetPayout[] {
  const wrongPotCents = bets
    .filter((b) => !b.is_correct)
    .reduce((sum, b) => sum + b.chips * CHIP_VALUE_CENTS, 0);
  const totalCorrectStakeCents = bets
    .filter((b) => b.is_correct)
    .reduce((sum, b) => sum + b.chips * CHIP_VALUE_CENTS, 0);

  return bets.map((b) => {
    const stake = b.chips * CHIP_VALUE_CENTS;
    if (!b.is_correct) {
      return { ...b, stake_cents: stake, payout_cents: 0 };
    }
    if (totalCorrectStakeCents === 0) {
      // Defensive: shouldn't happen because b.is_correct implies > 0,
      // but guard against div-by-zero.
      return { ...b, stake_cents: stake, payout_cents: stake };
    }
    const share = (stake / totalCorrectStakeCents) * wrongPotCents;
    const payout = stake + share;
    return {
      ...b,
      stake_cents: stake,
      payout_cents: Math.round(payout),
    };
  });
}

const CONCENTRATION_MULTIPLIERS: Record<number, number> = {
  1: 2.5,
  2: 2.0,
  3: 1.75,
  4: 1.5,
  5: 1.25,
};

function computeConcentration(bets: BetInput[]): BetPayout[] {
  // Group bets by player to count how many guesses each placed.
  const guessesPerPlayer = new Map<string, number>();
  for (const b of bets) {
    guessesPerPlayer.set(b.player_id, (guessesPerPlayer.get(b.player_id) || 0) + 1);
  }

  return bets.map((b) => {
    const stake = b.chips * CHIP_VALUE_CENTS;
    if (!b.is_correct) {
      return { ...b, stake_cents: stake, payout_cents: 0 };
    }
    const count = guessesPerPlayer.get(b.player_id) || 1;
    const multiplier = CONCENTRATION_MULTIPLIERS[count] || 1.25;
    return {
      ...b,
      stake_cents: stake,
      payout_cents: Math.round(stake * multiplier),
    };
  });
}

/**
 * The room "crashes" when zero correct dollars were bet across all bettors.
 */
export function shouldCrash(bets: BetInput[]): boolean {
  return bets.every((b) => !b.is_correct);
}

export interface CrashResult {
  player_id: string;
  cashout_ms: number | null; // null = wipeout
  saved_cents: number; // gross saved before any bonus
  net_cents: number; // saved − $100 stake (final P/L for the round)
}

/**
 * Resolve one crash mini-game cashout into saved + net.
 *
 * Math (per spec):
 *   - cashout >= 10000ms or null → wipeout: saved = 0, net = -$100
 *   - cashout in [9000, 10000)ms → precision zone:
 *       base_saved = (cashout/10000) × 100  (in dollars)
 *       saved = base_saved × 1.5
 *       net = saved − 100
 *   - cashout in [0, 9000)ms → standard:
 *       saved = (cashout/10000) × 100
 *       net = saved − 100
 */
export function resolveCrash(
  player_id: string,
  cashout_ms: number | null
): CrashResult {
  // Wipeout
  if (cashout_ms === null || cashout_ms >= CRASH_DURATION_MS) {
    return {
      player_id,
      cashout_ms,
      saved_cents: 0,
      net_cents: -ROUND_STAKE_CENTS,
    };
  }

  const baseFraction = cashout_ms / CRASH_DURATION_MS;
  const baseSavedCents = Math.round(baseFraction * ROUND_STAKE_CENTS);

  const inPrecision = cashout_ms >= CRASH_DURATION_MS - CRASH_PRECISION_WINDOW_MS;
  const savedCents = inPrecision
    ? Math.round(baseSavedCents * CRASH_PRECISION_MULTIPLIER)
    : baseSavedCents;

  return {
    player_id,
    cashout_ms,
    saved_cents: savedCents,
    net_cents: savedCents - ROUND_STAKE_CENTS,
  };
}

/**
 * Knowability Score: percentage of total dollars (across all bettors, all
 * rounds) that landed on correct guesses. Returned as a 0–100 integer.
 */
export function computeKnowabilityScore(allBets: BetInput[]): number {
  if (allBets.length === 0) return 0;
  const totalCents = allBets.reduce(
    (sum, b) => sum + b.chips * CHIP_VALUE_CENTS,
    0
  );
  if (totalCents === 0) return 0;
  const correctCents = allBets
    .filter((b) => b.is_correct)
    .reduce((sum, b) => sum + b.chips * CHIP_VALUE_CENTS, 0);
  return Math.round((correctCents / totalCents) * 100);
}

/** Format cents as a friendly string: 12345 → "$123.45", -5000 → "−$50.00" */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const padded = remainder.toString().padStart(2, "0");
  return `${negative ? "−" : ""}$${dollars.toLocaleString()}.${padded}`;
}

/** Normalize a guess for de-dup and exact matching against the spotlight answer. */
export function normalizeGuess(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
