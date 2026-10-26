const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left before `target`, rounded up: the day before the vote reads J-1. */
export function daysUntil(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}
