// src/hooks/useStatsData.ts — computes per-user stats for StatsView
import { useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { compareByRankAndName, sortUsersBy, type SortKey, type SortDir } from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getUserAvailabilityStatus } from '../services/userService';
import { isAssignedInEntry, getLogicSchedule, isHistoryType } from '../utils/assignment';

export interface UserStats extends User {
  balance: number;
  trackingFrom: string;
  totalAllDuties: number;
  totalComparableDuties: number;
  comparableLoad: number;
  effectiveComparable: number;
  dayCountComparable: Record<number, number>;
  availableDaysForDuty: number;
  dutyRate: number;
  availability: ReturnType<typeof getUserAvailabilityStatus>;
}

interface UseStatsDataProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  ignoreHistoryInLogic: boolean;
  showActive: boolean;
  showInactive: boolean;
  sortKey: SortKey | null;
  sortDir: SortDir;
}

/** Computes per-user duty statistics and applies filtering and user-selected sort. */
export const useStatsData = ({
  users,
  schedule,
  dayWeights,
  ignoreHistoryInLogic,
  showActive,
  showInactive,
  sortKey,
  sortDir,
}: UseStatsDataProps) => {
  const todayStr = toLocalISO(new Date());

  const allStats = useMemo((): UserStats[] => {
    const logicSched = getLogicSchedule(schedule, ignoreHistoryInLogic);
    const nonHistoryDates = Object.entries(logicSched)
      .filter(([, e]) => !isHistoryType(e))
      .map(([d]) => d)
      .sort();
    const earliestScheduleDate = nonHistoryDates[0] || todayStr;

    const countUnavailableDays = (user: User, from: string, to: string): number => {
      let count = 0;
      const cursor = new Date(from);
      const end = new Date(to);
      while (cursor <= end) {
        const iso = toLocalISO(cursor);
        if (getUserAvailabilityStatus(user, iso) !== 'AVAILABLE') count++;
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    };

    return users
      .map((u): UserStats => {
        const allUserEntries = Object.values(logicSched).filter((s) => isAssignedInEntry(s, u.id!));
        const rawFairnessFrom = u.dateAddedToAuto;
        const fallbackFrom = earliestScheduleDate <= todayStr ? earliestScheduleDate : todayStr;
        const trackingFrom = rawFairnessFrom || fallbackFrom;
        const hasExplicitTracking = !!rawFairnessFrom;

        const comparableEntries = allUserEntries.filter((s) => {
          if (s.date >= trackingFrom) return true;
          if (!ignoreHistoryInLogic && isHistoryType(s)) return true;
          if (!hasExplicitTracking && isHistoryType(s)) return true;
          return false;
        });

        let availableDaysForDuty = 0;
        if (trackingFrom <= todayStr && u.isActive && !u.excludeFromAuto) {
          const totalWindowDays =
            Math.floor(
              (new Date(todayStr).getTime() - new Date(trackingFrom).getTime()) / 86400000
            ) + 1;
          const statusBlockedDays = countUnavailableDays(u, trackingFrom, todayStr);
          availableDaysForDuty = Math.max(0, totalWindowDays - statusBlockedDays);
        }

        let comparableLoad = 0;
        const dayCountComparable: Record<number, number> = {};
        comparableEntries.forEach((s) => {
          const dayIdx = new Date(s.date).getDay();
          comparableLoad += dayWeights[dayIdx] || 1.0;
          dayCountComparable[dayIdx] = (dayCountComparable[dayIdx] || 0) + 1;
        });

        const balance = u.debt || 0;
        const availability = getUserAvailabilityStatus(u, todayStr);
        const dutyRate =
          availableDaysForDuty > 0 ? comparableEntries.length / availableDaysForDuty : 0;

        return {
          ...u,
          balance,
          trackingFrom,
          totalAllDuties: allUserEntries.length,
          totalComparableDuties: comparableEntries.length,
          comparableLoad,
          effectiveComparable: comparableLoad + balance,
          dayCountComparable,
          availableDaysForDuty,
          dutyRate,
          availability,
        };
      })
      .sort((a, b) => {
        const loadDiff = a.effectiveComparable - b.effectiveComparable;
        return loadDiff !== 0 ? loadDiff : compareByRankAndName(a, b);
      });
  }, [users, schedule, dayWeights, todayStr, ignoreHistoryInLogic]);

  const filteredStats = allStats.filter((u) => {
    if (u.isActive && !showActive) return false;
    if (!u.isActive && !showInactive) return false;
    return true;
  });

  const stats = useMemo(() => {
    if (!sortKey) return filteredStats;
    return sortUsersBy(filteredStats, sortKey, sortDir);
  }, [filteredStats, sortKey, sortDir]);

  return { stats, todayStr };
};
