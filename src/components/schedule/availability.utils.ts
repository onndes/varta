import type { User } from '../../types';
import { toLocalISO } from '../../utils/helpers';

export type UserAvailabilityStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'STATUS_BUSY'
  | 'PRE_STATUS_DAY'
  | 'REST_DAY';

/**
 * Determines user availability status for a specific date
 */
export const getUserAvailabilityStatus = (u: User, dateStr: string): UserAvailabilityStatus => {
  if (!u.isActive) return 'UNAVAILABLE';
  if (u.status === 'ACTIVE') return 'AVAILABLE';

  if (u.statusFrom || u.statusTo) {
    const from = u.statusFrom || '0000-01-01';
    const to = u.statusTo || '9999-12-31';

    if (dateStr >= from && dateStr <= to) return 'STATUS_BUSY';

    // Check "Day before status"
    if (u.statusFrom) {
      const dayBefore = new Date(u.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (toLocalISO(new Date(dateStr)) === toLocalISO(dayBefore)) return 'PRE_STATUS_DAY';
    }

    // Check "Rest day after status"
    if (u.restAfterStatus && u.statusTo) {
      const endDate = new Date(u.statusTo);
      const check = new Date(dateStr);
      const next = new Date(endDate);
      next.setDate(endDate.getDate() + 1);
      if (toLocalISO(check) === toLocalISO(next)) return 'REST_DAY';
    }

    return 'AVAILABLE';
  }

  return 'UNAVAILABLE';
};

/**
 * Simple check if user is available for assignment
 */
export const isUserAvailable = (u: User, dateStr: string): boolean =>
  getUserAvailabilityStatus(u, dateStr) === 'AVAILABLE';
