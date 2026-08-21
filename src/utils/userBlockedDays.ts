// src/utils/userBlockedDays.ts
import type { User, BlockedDaysPeriod } from '../types';
import { toLocalISO } from './dateUtils';

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

/** JS getDay() → ISO weekday index (1=Mon…7=Sun). */
const toIsoDow = (jsDow: number): number => (jsDow === 0 ? 7 : jsDow);

/**
 * Returns the canonical list of BlockedDaysPeriod for a user,
 * migrating legacy flat fields on-the-fly if blockedDaysPeriods is absent.
 */
export function getBlockedDaysPeriods(user: User): BlockedDaysPeriod[] {
  if (user.blockedDaysPeriods && user.blockedDaysPeriods.length > 0) {
    return user.blockedDaysPeriods;
  }
  // Migrate legacy fields
  if (user.blockedDays && user.blockedDays.length > 0) {
    return [
      {
        days: user.blockedDays,
        from: user.blockedDaysFrom,
        to: user.blockedDaysTo,
        comment: user.blockedDaysComment,
      },
    ];
  }
  return [];
}

/**
 * Returns true if the given ISO dateStr falls inside any active BlockedDaysPeriod
 * for this weekday.
 */
export function isDateBlockedByPeriod(user: User, dateStr: string): boolean {
  const dow = toIsoDow(new Date(dateStr).getDay());
  const periods = getBlockedDaysPeriods(user);
  return periods.some(
    (p) => p.days.includes(dow) && dateStr >= (p.from || MIN_DATE) && dateStr <= (p.to || MAX_DATE)
  );
}

/**
 * Effective blocked ISO weekdays (1=Mon…7=Sun) around a reference date.
 * A DOW counts as blocked when its next occurrence on/after refDateStr falls
 * inside an active blocked period. Handles dated and open-ended periods, and
 * legacy flat `blockedDays` via getBlockedDaysPeriods.
 *
 * Used by fairness math (objective / comparator / decision log) which needs a
 * single per-DOW answer rather than a per-date one.
 */
export function getEffectiveBlockedDows(user: User, refDateStr: string): number[] {
  if (getBlockedDaysPeriods(user).length === 0) return [];
  const result: number[] = [];
  const ref = new Date(refDateStr);
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(ref);
    d.setDate(ref.getDate() + offset);
    const iso = toLocalISO(d);
    if (isDateBlockedByPeriod(user, iso)) result.push(toIsoDow(d.getDay()));
  }
  return result.sort((a, b) => a - b);
}
