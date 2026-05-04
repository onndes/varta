// src/utils/userBlockedDays.ts
import type { User, BlockedDaysPeriod } from '../types';

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
