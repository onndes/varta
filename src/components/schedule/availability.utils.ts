import type { User } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';

export type UserAvailabilityStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'STATUS_BUSY'
  | 'PRE_STATUS_DAY'
  | 'REST_DAY'
  | 'DAY_BLOCKED';

/**
 * Determines user availability status for a specific date
 * NOTE: excludeFromAuto flag is NOT checked here - it only affects automatic scheduling.
 * Manual assignment is always possible regardless of excludeFromAuto status.
 */
export const getUserAvailabilityStatus = (u: User, dateStr: string): UserAvailabilityStatus => {
  // If user is completely inactive (absent) - they are unavailable
  if (!u.isActive) return 'UNAVAILABLE';

  // Check if day of week is blocked
  const dayOfWeek = new Date(dateStr).getDay(); // 0=Sun, 1=Mon...6=Sat
  const dayIdx = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1=Mon...7=Sun
  if (u.blockedDays?.includes(dayIdx)) return 'DAY_BLOCKED';

  if (u.status === 'ACTIVE') return 'AVAILABLE';

  if (u.statusFrom || u.statusTo) {
    const from = u.statusFrom || '0000-01-01';
    const to = u.statusTo || '9999-12-31';

    // Check "Day before status" FIRST (before checking main period)
    if (u.restBeforeStatus && u.statusFrom) {
      const dayBefore = new Date(u.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (toLocalISO(new Date(dateStr)) === toLocalISO(dayBefore)) return 'PRE_STATUS_DAY';
    }

    // Check "Rest day after status" BEFORE checking availability
    if (u.restAfterStatus && u.statusTo) {
      const endDate = new Date(u.statusTo);
      const check = new Date(dateStr);
      const next = new Date(endDate);
      next.setDate(endDate.getDate() + 1);
      if (toLocalISO(check) === toLocalISO(next)) return 'REST_DAY';
    }

    // Now check if date is within status period
    if (dateStr >= from && dateStr <= to) return 'STATUS_BUSY';

    return 'AVAILABLE';
  }

  return 'AVAILABLE';
};

/**
 * Simple check if user is available for assignment
 */
export const isUserAvailable = (u: User, dateStr: string): boolean =>
  getUserAvailabilityStatus(u, dateStr) === 'AVAILABLE';
