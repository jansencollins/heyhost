const BASE_POINTS = 1000;
const MAX_SPEED_BONUS = 500;

export function calculatePoints(
  isCorrect: boolean,
  timeMs: number,
  timerSeconds: number,
  speedBonusEnabled: boolean
): number {
  if (!isCorrect) return 0;

  let points = BASE_POINTS;

  if (speedBonusEnabled) {
    const totalMs = timerSeconds * 1000;
    const fraction = Math.max(0, 1 - timeMs / totalMs);
    points += Math.round(MAX_SPEED_BONUS * fraction);
  }

  return points;
}
