/**
 * Price Is Right scoring algorithm
 * Ported from the original heyhost priceisright game
 */

export interface ScoreData {
  scoreAwarded: number;
  tier: string;
  guessAccuracy: number;
}

export function getScoreData(
  guess: number | string,
  correctPrice: number,
  paidThePrice: boolean = false
): ScoreData {
  guess = Number(guess);

  const guessAccuracy = Math.round(
    (1 - Math.abs(correctPrice - guess) / correctPrice) * 100
  );

  if (paidThePrice) {
    return { scoreAwarded: 0, tier: "Paid the Price", guessAccuracy };
  }

  const absoluteDifference = Math.abs(guess - correctPrice);
  const percentageDifference = (absoluteDifference / correctPrice) * 100;

  if (absoluteDifference === 0) {
    return { scoreAwarded: 75, tier: "Perfect Guess!", guessAccuracy };
  }
  if (percentageDifference <= 10) {
    return { scoreAwarded: 60, tier: "within10", guessAccuracy };
  }
  if (percentageDifference <= 20) {
    return { scoreAwarded: 50, tier: "within20", guessAccuracy };
  }
  if (percentageDifference <= 30) {
    return { scoreAwarded: 40, tier: "within30", guessAccuracy };
  }
  if (percentageDifference <= 40) {
    return { scoreAwarded: 30, tier: "within40", guessAccuracy };
  }
  if (percentageDifference <= 50) {
    return { scoreAwarded: 20, tier: "within50", guessAccuracy };
  }
  return { scoreAwarded: 10, tier: "beyond50", guessAccuracy };
}

/** Tiers that qualify for "Pay The Price" penalty wheel (legacy fallback) */
export const PENALTY_TIERS = ["within40", "within50", "beyond50"];

/**
 * Check if a guess is in the penalty zone based on configurable margin.
 * @param accuracy - the guess accuracy (0-100)
 * @param penaltyMargin - accuracy threshold below which penalty applies (1-100, default 70)
 */
export function isInPenaltyZone(tierOrAccuracy: string | number, penaltyMargin: number = 70): boolean {
  if (typeof tierOrAccuracy === "number") {
    return tierOrAccuracy < penaltyMargin;
  }
  // Legacy tier-based fallback
  return PENALTY_TIERS.includes(tierOrAccuracy);
}

export function formatPrice(cents: number, showPercent: boolean = false): string {
  if (showPercent) return `${cents}%`;
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatGuess(guess: number, showPercent: boolean = false): string {
  if (showPercent) return `${guess}%`;
  return `$${guess.toFixed(2)}`;
}

export function getTierLabel(tier: string): string {
  switch (tier) {
    case "Perfect Guess!": return "Perfect!";
    case "within10": return "Within 10%";
    case "within20": return "Within 20%";
    case "within30": return "Within 30%";
    case "within40": return "Within 40%";
    case "within50": return "Within 50%";
    case "beyond50": return "Beyond 50%";
    case "Paid the Price": return "Paid the Price";
    default: return tier;
  }
}

export function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "text-green-400";
  if (accuracy >= 70) return "text-yellow-400";
  return "text-red-400";
}
