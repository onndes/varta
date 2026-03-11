// src/hooks/useScheduleUserQueries.ts

import { useCallback, useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { calculateEffectiveLoad as calcEffectiveLoad } from '../services/scheduleService';
import { isUserAvailable } from '../services/userService';
import { toAssignedUserIds, getLogicSchedule } from '../utils/assignment';
import { getWeekNumber, getWeekYear } from '../utils/dateUtils';

/** Milliseconds per day, used for daysSinceLastDuty calculation. */
const MS_PER_DAY = 86_400_000;

/** Minimum load improvement threshold for cascade recalc suggestion. */
const CASCADE_IMPROVEMENT_THRESHOLD = 0.5;

/** Minimum number of improvable days before suggesting cascade recalc. */
const CASCADE_MIN_IMPROVABLE = 2;

interface UseScheduleUserQueriesProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  weekDates: string[];
  dayWeights: DayWeights;
  ignoreHistoryInLogic: boolean;
  cascadeStartDate: string | null;
  todayStr: string;
}

/**
 * Provides derived queries over users and schedule data:
 * calculateEffectiveLoad, daysSinceLastDuty, getFreeUsers,
 * getWeekAssignedUsers, shouldShowCascadeRecalc.
 */
export const useScheduleUserQueries = ({
  users,
  schedule,
  weekDates,
  dayWeights,
  ignoreHistoryInLogic,
  cascadeStartDate,
  todayStr,
}: UseScheduleUserQueriesProps) => {
  const logicSchedule = useMemo(
    () => getLogicSchedule(schedule, ignoreHistoryInLogic),
    [schedule, ignoreHistoryInLogic]
  );

  const calculateEffectiveLoad = useCallback(
    (user: User) => calcEffectiveLoad(user, logicSchedule, dayWeights),
    [logicSchedule, dayWeights]
  );

  const daysSinceLastDuty = useCallback(
    (userId: number, refDate: string): number => {
      const previousDates = Object.values(schedule)
        .filter((s) => s.date < refDate && toAssignedUserIds(s.userId).includes(userId))
        .map((s) => s.date)
        .sort();
      if (previousDates.length === 0) return Number.POSITIVE_INFINITY;
      const last = previousDates[previousDates.length - 1];
      return Math.floor((new Date(refDate).getTime() - new Date(last).getTime()) / MS_PER_DAY);
    },
    [schedule]
  );

  const getFreeUsers = useCallback(
    (dateStr: string, includeRestDay = false) => {
      const dayIndex = new Date(dateStr).getDay();
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));
      return users
        .filter((u) => {
          if (assignedOnDate.has(u.id!)) return false;
          return includeRestDay
            ? isUserAvailable(u, dateStr)
            : isUserAvailable(u, dateStr, schedule);
        })
        .sort((a, b) => {
          const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
          const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
          if (oweA !== oweB) return oweB - oweA;
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          if (loadA !== loadB) return loadA - loadB;
          if (a.debt !== b.debt) return a.debt - b.debt;
          return daysSinceLastDuty(b.id!, dateStr) - daysSinceLastDuty(a.id!, dateStr);
        });
    },
    [schedule, users, calculateEffectiveLoad, daysSinceLastDuty]
  );

  const getWeekAssignedUsers = useCallback(
    (dateStr: string) => {
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));
      const weekUserIds = new Set<number>();
      for (const wd of weekDates) {
        if (wd === dateStr) continue;
        const entry = schedule[wd];
        if (entry) toAssignedUserIds(entry.userId).forEach((id) => weekUserIds.add(id));
      }
      return users
        .filter(
          (u) =>
            u.id !== undefined && u.isActive && weekUserIds.has(u.id) && !assignedOnDate.has(u.id)
        )
        .sort((a, b) => {
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          if (loadA !== loadB) return loadA - loadB;
          if (a.debt !== b.debt) return a.debt - b.debt;
          return daysSinceLastDuty(b.id!, dateStr) - daysSinceLastDuty(a.id!, dateStr);
        });
    },
    [schedule, users, weekDates, calculateEffectiveLoad, daysSinceLastDuty]
  );

  const shouldShowCascadeRecalc = useMemo(() => {
    if (!cascadeStartDate) return false;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    let improvableCount = 0;
    for (const [date, entry] of Object.entries(schedule)) {
      if (date < start || entry.type === 'manual') continue;
      const assignedIds = toAssignedUserIds(entry.userId);
      if (assignedIds.length === 0) continue;
      const freeUsers = getFreeUsers(date).filter((u) => !assignedIds.includes(u.id!));
      if (freeUsers.length === 0) continue;
      const hasImprovement = assignedIds.some((assignedId) => {
        const currentUser = users.find((u) => u.id === assignedId);
        if (!currentUser) return true;
        const currentLoad = calculateEffectiveLoad(currentUser);
        return freeUsers.some(
          (u) => calculateEffectiveLoad(u) < currentLoad - CASCADE_IMPROVEMENT_THRESHOLD
        );
      });
      if (hasImprovement && ++improvableCount >= CASCADE_MIN_IMPROVABLE) return true;
    }
    return false;
  }, [cascadeStartDate, schedule, todayStr, users, getFreeUsers, calculateEffectiveLoad]);

  const scheduledWeeksMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    Object.keys(schedule).forEach((dateStr) => {
      const d = new Date(dateStr);
      const year = getWeekYear(d);
      const week = getWeekNumber(d);
      if (!map.has(year)) map.set(year, new Set());
      map.get(year)!.add(week);
    });
    return map;
  }, [schedule]);

  return {
    calculateEffectiveLoad,
    daysSinceLastDuty,
    getFreeUsers,
    getWeekAssignedUsers,
    shouldShowCascadeRecalc,
    scheduledWeeksMap,
  };
};
