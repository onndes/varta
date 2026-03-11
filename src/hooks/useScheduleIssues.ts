// src/hooks/useScheduleIssues.ts
import { useMemo } from 'react';
import type { User, ScheduleEntry } from '../types';
import type { DeletedUserInfo } from '../services/userService';
import { toAssignedUserIds, getAssignedCount } from '../utils/assignment';
import { isUserAvailable } from '../services/userService';
import { getStatusPeriodAtDate } from '../utils/userStatus';

/** Status values that are considered "critical" (hard conflicts). */
const CRITICAL_STATUSES = new Set(['VACATION', 'SICK', 'TRIP']);

interface UseScheduleIssuesProps {
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  weekDates: string[];
  dutiesPerDay: number;
  deletedUserNames: Record<number, DeletedUserInfo>;
}

/**
 * Computes schedule conflicts and gaps for the visible week.
 * Returns conflict date lists, a per-date conflict map, and gap dates.
 */
export const useScheduleIssues = ({
  schedule,
  users,
  weekDates,
  dutiesPerDay,
  deletedUserNames,
}: UseScheduleIssuesProps) => {
  const deletedUserIds = useMemo(
    () => new Set(Object.keys(deletedUserNames).map(Number)),
    [deletedUserNames]
  );
  return useMemo(() => {
    const conflicts: string[] = [];
    const criticalConflicts: string[] = [];
    const gaps: string[] = [];
    const conflictByDate: Record<string, number[]> = {};
    const checkStart = weekDates[0];

    Object.entries(schedule).forEach(([date, entry]) => {
      if (date < checkStart) return;
      const ids = toAssignedUserIds(entry.userId);
      const conflictIds = ids.filter((id) => {
        const user = users.find((u) => u.id === id);
        if (!user) return !deletedUserIds.has(id);
        if (!isUserAvailable(user, date, schedule)) {
          const period = getStatusPeriodAtDate(user, date);
          if (period && CRITICAL_STATUSES.has(period.status)) {
            criticalConflicts.push(date);
          }
          return true;
        }
        return false;
      });
      if (conflictIds.length > 0) {
        conflicts.push(date);
        conflictByDate[date] = conflictIds;
      }
    });

    weekDates.forEach((d) => {
      if (getAssignedCount(schedule[d]) < dutiesPerDay) gaps.push(d);
    });

    return { conflicts, criticalConflicts, gaps, conflictByDate };
  }, [schedule, users, weekDates, dutiesPerDay, deletedUserIds]);
};
