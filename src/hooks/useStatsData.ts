// src/hooks/useStatsData.ts — computes per-user stats for StatsView
import { useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { compareByRankAndName, sortUsersBy, type SortKey, type SortDir } from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getUserAvailabilityStatus } from '../services/userService';
import {
  isAssignedInEntry,
  getLogicSchedule,
  isHistoryType,
  getFirstDutyDate,
} from '../utils/assignment';

export interface UserStats extends User {
  balance: number;
  trackingFrom: string;
  windowEnd: string;
  totalAllDuties: number;
  totalComparableDuties: number;
  comparableLoad: number;
  effectiveComparable: number;
  dayCountComparable: Record<number, number>;
  availableDaysForDuty: number;
  windowDuties: number;
  dutyRate: number;
  availability: ReturnType<typeof getUserAvailabilityStatus>;
}

export interface StatsGroupMeta {
  avgDutyRate: number;
  maxDutyRate: number;
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
  includeFuture: boolean;
  useFirstDutyDateAsActiveFrom: boolean;
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
  includeFuture,
  useFirstDutyDateAsActiveFrom,
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
        const firstDuty = getFirstDutyDate(logicSched, u.id!);
        let trackingFrom: string;
        if (useFirstDutyDateAsActiveFrom) {
          trackingFrom = firstDuty || rawFairnessFrom || fallbackFrom;
        } else {
          trackingFrom = rawFairnessFrom || firstDuty || fallbackFrom;
        }
        const hasExplicitTracking = !!rawFairnessFrom || !!firstDuty;

        const comparableEntries = allUserEntries.filter((s) => {
          if (s.date >= trackingFrom) return true;
          if (!ignoreHistoryInLogic && isHistoryType(s)) return true;
          if (!hasExplicitTracking && isHistoryType(s)) return true;
          return false;
        });

        // Window end: for includeFuture mode, extend to the last assigned date;
        // for past-only mode, cap at today.
        const lastEntryDateInWindow = comparableEntries
          .map((s) => s.date)
          .filter((d) => d >= trackingFrom)
          .reduce((max, d) => (d > max ? d : max), trackingFrom);
        const windowEnd = includeFuture ? lastEntryDateInWindow : todayStr;

        let availableDaysForDuty = 0;
        if (trackingFrom <= windowEnd && u.isActive && !u.excludeFromAuto) {
          const totalWindowDays =
            Math.floor(
              (new Date(windowEnd).getTime() - new Date(trackingFrom).getTime()) / 86400000
            ) + 1;
          const statusBlockedDays = countUnavailableDays(u, trackingFrom, windowEnd);
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
        // Count duties within the same [trackingFrom, windowEnd] window as availableDaysForDuty
        // so numerator and denominator always cover the same period.
        const windowEntries = comparableEntries.filter(
          (s) => s.date >= trackingFrom && s.date <= windowEnd
        );
        const windowDuties = windowEntries.length;
        const dutyRate = availableDaysForDuty > 0 ? windowDuties / availableDaysForDuty : 0;

        return {
          ...u,
          balance,
          trackingFrom,
          windowEnd,
          totalAllDuties: allUserEntries.length,
          totalComparableDuties: comparableEntries.length,
          comparableLoad,
          effectiveComparable: comparableLoad + balance,
          dayCountComparable,
          availableDaysForDuty,
          windowDuties,
          dutyRate,
          availability,
        };
      })
      .sort((a, b) => {
        const loadDiff = a.effectiveComparable - b.effectiveComparable;
        return loadDiff !== 0 ? loadDiff : compareByRankAndName(a, b);
      });
  }, [
    users,
    schedule,
    dayWeights,
    todayStr,
    ignoreHistoryInLogic,
    includeFuture,
    useFirstDutyDateAsActiveFrom,
  ]);

  const filteredStats = allStats.filter((u) => {
    if (u.isActive && !showActive) return false;
    if (!u.isActive && !showInactive) return false;
    return true;
  });

  const stats = useMemo(() => {
    if (!sortKey) return filteredStats;
    return sortUsersBy(filteredStats, sortKey, sortDir);
  }, [filteredStats, sortKey, sortDir]);

  const groupMeta = useMemo((): StatsGroupMeta => {
    const rates = filteredStats.filter((u) => u.dutyRate > 0).map((u) => u.dutyRate);
    const avgDutyRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    const maxDutyRate = rates.length > 0 ? Math.max(...rates) : 0;
    return { avgDutyRate, maxDutyRate };
  }, [filteredStats]);

  return { stats, todayStr, groupMeta };
};
