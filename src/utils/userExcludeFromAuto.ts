// src/utils/userExcludeFromAuto.ts
import type { User, ExcludeFromAutoPeriod } from '../types';

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

/**
 * Returns the canonical list of ExcludeFromAutoPeriod for a user,
 * migrating legacy excludedFromAutoPeriods on-the-fly.
 */
export function getExcludeFromAutoPeriods(user: User): ExcludeFromAutoPeriod[] {
  if (user.excludeFromAutoPeriods2 && user.excludeFromAutoPeriods2.length > 0) {
    return user.excludeFromAutoPeriods2;
  }
  // Migrate legacy auto-tracked periods
  if (user.excludedFromAutoPeriods && user.excludedFromAutoPeriods.length > 0) {
    return user.excludedFromAutoPeriods.map((p) => ({ from: p.from, to: p.to }));
  }
  // Migrate legacy boolean flag
  if (user.excludeFromAuto) {
    return [{ from: '2000-01-01' }]; // open-ended, unknown start
  }
  return [];
}

/** Returns true if user is excluded from auto-scheduling on the given ISO dateStr. */
export function isExcludedFromAutoOnDate(user: User, dateStr: string): boolean {
  return getExcludeFromAutoPeriods(user).some(
    (p) => dateStr >= (p.from || MIN_DATE) && dateStr <= (p.to || MAX_DATE)
  );
}

/** Returns true if user is currently excluded (open-ended period or period covering today). */
export function isCurrentlyExcludedFromAuto(user: User, todayStr: string): boolean {
  return isExcludedFromAutoOnDate(user, todayStr);
}
