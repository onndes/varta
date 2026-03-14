// src/hooks/useAutoScheduler.ts

import { useState, useCallback } from 'react';
import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../types';
import * as autoScheduler from '../services/autoScheduler';
import * as scheduleService from '../services/scheduleService';
import { toLocalISO } from '../utils/dateUtils';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';
import { isManualType } from '../utils/assignment';

/**
 * Custom hook for automatic scheduling operations
 */
export const useAutoScheduler = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay: number,
  autoScheduleOptions: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  ignoreHistoryInLogic = false
) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto fill gaps
  const fillGaps = useCallback(
    async (dates: string[], onComplete?: () => void) => {
      try {
        setIsProcessing(true);
        setError(null);

        const todayStr = toLocalISO(new Date());
        const validDates = dates.filter((d) => d >= todayStr);

        if (validDates.length === 0) {
          throw new Error('Немає валідних дат для заповнення');
        }

        const updates = await autoScheduler.autoFillSchedule(
          validDates,
          users,
          schedule,
          dayWeights,
          dutiesPerDay,
          autoScheduleOptions,
          ignoreHistoryInLogic
        );

        await autoScheduler.saveAutoSchedule(updates, dayWeights);

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fill gaps');
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [users, schedule, dayWeights, dutiesPerDay, autoScheduleOptions, ignoreHistoryInLogic]
  );

  // Fix conflicts
  const fixConflicts = useCallback(async (conflictDates: string[], onComplete?: () => void) => {
    try {
      setIsProcessing(true);
      setError(null);

      if (conflictDates.length === 0) return;

      await scheduleService.bulkDeleteSchedule(conflictDates);

      if (onComplete) onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fix conflicts');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Recalculate schedule from a date
  const recalculateFrom = useCallback(
    async (startDate: string, onComplete?: () => void) => {
      try {
        setIsProcessing(true);
        setError(null);

        const todayStr = toLocalISO(new Date());
        const start = startDate < todayStr ? todayStr : startDate;

        await autoScheduler.recalculateScheduleFrom(
          start,
          users,
          schedule,
          dayWeights,
          dutiesPerDay,
          autoScheduleOptions,
          ignoreHistoryInLogic
        );

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to recalculate');
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [users, schedule, dayWeights, dutiesPerDay, autoScheduleOptions, ignoreHistoryInLogic]
  );

  // Generate full week schedule
  const generateWeekSchedule = useCallback(
    async (weekDates: string[], onComplete?: () => void) => {
      try {
        setIsProcessing(true);
        setError(null);

        const todayStr = toLocalISO(new Date());
        const validDates = weekDates.filter((d) => d >= todayStr);

        // Remove existing entries for these dates (except locked and manual/replace/swap)
        const datesToClear = validDates.filter((d) => {
          const entry = schedule[d];
          return !entry || (!entry.isLocked && !isManualType(entry));
        });

        if (datesToClear.length > 0) {
          await scheduleService.bulkDeleteSchedule(datesToClear);
        }

        // Use a fresh in-memory schedule snapshot so autoFillSchedule
        // does not see deleted auto entries from stale React state.
        const freshSchedule = { ...schedule };
        for (const date of datesToClear) {
          delete freshSchedule[date];
        }

        // Generate new schedule
        const updates = await autoScheduler.autoFillSchedule(
          validDates,
          users,
          freshSchedule,
          dayWeights,
          dutiesPerDay,
          autoScheduleOptions,
          ignoreHistoryInLogic
        );

        await autoScheduler.saveAutoSchedule(updates, dayWeights);

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate schedule');
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [users, schedule, dayWeights, dutiesPerDay, autoScheduleOptions, ignoreHistoryInLogic]
  );

  // Get free users for a date
  const getFreeUsersForDate = useCallback(
    (date: string) => {
      return autoScheduler.getFreeUsersForDate(
        date,
        users,
        schedule,
        dayWeights,
        autoScheduleOptions,
        ignoreHistoryInLogic
      );
    },
    [users, schedule, dayWeights, autoScheduleOptions, ignoreHistoryInLogic]
  );

  // Get optimal assignment for a date
  const getOptimalAssignment = useCallback(
    (date: string) => {
      return autoScheduler.calculateOptimalAssignment(
        date,
        users,
        schedule,
        dayWeights,
        autoScheduleOptions,
        ignoreHistoryInLogic
      );
    },
    [users, schedule, dayWeights, autoScheduleOptions, ignoreHistoryInLogic]
  );

  return {
    isProcessing,
    error,
    fillGaps,
    fixConflicts,
    recalculateFrom,
    generateWeekSchedule,
    getFreeUsersForDate,
    getOptimalAssignment,
  };
};
