import type { User } from '../types';
import { toLocalISO } from './dateUtils';

/**
 * Effective "from" date for fair comparison in auto-scheduler.
 * - dateAddedToAuto: when user joined auto-pool
 * - first day after official status window: prevents "catch-up" after absence
 */
export const getUserFairnessFrom = (user: User, onDate: string): string | undefined => {
  let from = user.dateAddedToAuto;

  // For non-active statuses, reset fairness baseline to first day user can serve again.
  if (user.status !== 'ACTIVE' && user.statusTo) {
    const returnDate = new Date(user.statusTo);
    returnDate.setDate(returnDate.getDate() + 1);
    if (user.restAfterStatus) returnDate.setDate(returnDate.getDate() + 1);
    const returnStr = toLocalISO(returnDate);

    // Apply only after the return day has actually started for the target schedule date.
    if (returnStr <= onDate && (!from || returnStr > from)) {
      from = returnStr;
    }
  }

  // Never use future baseline for current target date.
  if (from && from > onDate) return undefined;
  return from;
};

/**
 * Get the common baseline date for an entire pool of users.
 * Returns the latest user-specific fairness baseline among pool members.
 */
export const getPoolCommonFrom = (pool: User[], onDate: string): string | undefined => {
  let latest: string | undefined;
  for (const u of pool) {
    const userFrom = getUserFairnessFrom(u, onDate);
    if (userFrom && (!latest || userFrom > latest)) {
      latest = userFrom;
    }
  }
  return latest;
};
