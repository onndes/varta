import type { User } from '../types';

/**
 * Effective "from" date for fair comparison in auto-scheduler.
 * Uses only dateAddedToAuto (pool join date).
 * Absences should be handled by availability-aware comparison, not by "reset to zero".
 */
export const getUserFairnessFrom = (user: User, onDate: string): string | undefined => {
  const from = user.dateAddedToAuto;
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
