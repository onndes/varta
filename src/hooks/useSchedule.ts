// src/hooks/useSchedule.ts

import { useState, useEffect, useCallback } from 'react';
import type { ScheduleEntry, User, DayWeights } from '../types';
import * as scheduleService from '../services/scheduleService';
import * as auditService from '../services/auditService';
import * as settingsService from '../services/settingsService';
import * as userService from '../services/userService';
import { toAssignedUserIds } from '../utils/assignment';

/**
 * Custom hook for managing schedule
 */
export const useSchedule = (users: User[]) => {
  const [schedule, setSchedule] = useState<Record<string, ScheduleEntry>>({});
  const [dayWeights, setDayWeights] = useState<DayWeights>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Load schedule and settings
  const loadSchedule = useCallback(async () => {
    try {
      if (!initialLoaded) setLoading(true);
      setError(null);

      const [scheduleData, weights] = await Promise.all([
        scheduleService.getAllSchedule(),
        settingsService.getDayWeights(),
      ]);

      setSchedule(scheduleData);
      setDayWeights(weights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
      console.error('Error loading schedule:', err);
    } finally {
      setLoading(false);
      setInitialLoaded(true);
    }
  }, [initialLoaded]);

  // Assign user to a date
  const assignUser = useCallback(
    async (
      date: string,
      userId: number,
      isManual = true,
      options?: { maxPerDay?: number; replaceUserId?: number }
    ) => {
      try {
        const existing = await scheduleService.getScheduleByDate(date);
        const existingIds = toAssignedUserIds(existing?.userId);
        if (existingIds.includes(userId)) return;

        let nextIds = [...existingIds];
        const replaceUserId = options?.replaceUserId;
        if (typeof replaceUserId === 'number' && nextIds.includes(replaceUserId)) {
          nextIds = nextIds.filter((id) => id !== replaceUserId);

          if (await settingsService.getKarmaOnManualChanges()) {
            const dayIdx = new Date(date).getDay();
            const weight = dayWeights[dayIdx] || 1.0;
            await userService.updateUserDebt(replaceUserId, -weight);
            const prevUser = users.find((u) => u.id === replaceUserId);
            if (prevUser) {
              await auditService.logAction(
                'REMOVE',
                `${prevUser.name} замінено на ${date} (Карма -${weight})`
              );
            }
          } else {
            const prevUser = users.find((u) => u.id === replaceUserId);
            if (prevUser) {
              await auditService.logAction('REMOVE', `${prevUser.name} замінено на ${date}`);
            }
          }
        }

        if (options?.maxPerDay && nextIds.length >= options.maxPerDay) {
          throw new Error('Досягнуто ліміт чергувань на день');
        }

        nextIds.push(userId);

        const entry: ScheduleEntry = {
          date,
          userId: nextIds.length === 1 ? nextIds[0] : nextIds,
          type: isManual ? 'manual' : 'auto',
          isLocked: false,
        };

        await scheduleService.saveScheduleEntry(entry);

        // Погасити борг якщо boєць винен саме цей день тижня
        const user = users.find((u) => u.id === userId);
        if (user && isManual) {
          if (await settingsService.getKarmaOnManualChanges()) {
            const dayIdx = new Date(date).getDay();
            const weight = dayWeights[dayIdx] || 1.0;
            await userService.repayOwedDay(userId, dayIdx, weight);
          }
          await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
        } else if (user) {
          await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
        }

        await loadSchedule();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign user');
        throw err;
      }
    },
    [users, dayWeights, loadSchedule]
  );

  // Remove assignment
  const removeAssignment = useCallback(
    async (date: string, reason: 'request' | 'work' = 'work', targetUserId?: number) => {
      try {
        const entry = await scheduleService.getScheduleByDate(date);
        if (!entry || !entry.userId) return;
        const assignedIds = toAssignedUserIds(entry.userId);
        const removedUserId =
          typeof targetUserId === 'number' && assignedIds.includes(targetUserId)
            ? targetUserId
            : assignedIds[0];
        const user = users.find((u) => u.id === removedUserId);

        await scheduleService.removeAssignmentWithDebt(date, reason, dayWeights, removedUserId);

        if (user) {
          const dayIdx = new Date(date).getDay();
          const weight = dayWeights[dayIdx] || 1.0;

          if (reason === 'request') {
            await auditService.logAction('REMOVE', `${user.name} рапорт (Карма -${weight})`);
          } else {
            await auditService.logAction('REMOVE', `${user.name} службова (Карма 0)`);
          }
        }

        await loadSchedule();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove assignment');
        throw err;
      }
    },
    [users, dayWeights, loadSchedule]
  );

  // Get schedule for a user
  const getUserSchedule = useCallback(
    (userId: number) => {
      return Object.values(schedule).filter((entry) =>
        toAssignedUserIds(entry.userId).includes(userId)
      );
    },
    [schedule]
  );

  // Get schedule for a date range
  const getScheduleRange = useCallback(
    (startDate: string, endDate: string) => {
      return Object.entries(schedule)
        .filter(([date]) => date >= startDate && date <= endDate)
        .reduce(
          (acc, [date, entry]) => {
            acc[date] = entry;
            return acc;
          },
          {} as Record<string, ScheduleEntry>
        );
    },
    [schedule]
  );

  // Find conflicts
  const findConflicts = useCallback(
    (startDate?: string) => {
      return scheduleService.findScheduleConflicts(schedule, users, startDate);
    },
    [schedule, users]
  );

  // Find gaps
  const findGaps = useCallback(
    (dates: string[]) => {
      return scheduleService.findScheduleGaps(schedule, dates);
    },
    [schedule]
  );

  // Calculate user load
  const calculateUserLoad = useCallback(
    (userId: number) => {
      return scheduleService.calculateUserLoad(userId, schedule, dayWeights);
    },
    [schedule, dayWeights]
  );

  // Calculate effective load (real + debt)
  const calculateEffectiveLoad = useCallback(
    (user: User) => {
      return scheduleService.calculateEffectiveLoad(user, schedule, dayWeights);
    },
    [schedule, dayWeights]
  );

  // Get schedule stats
  const getStats = useCallback(() => {
    return scheduleService.getScheduleStats(schedule, dayWeights);
  }, [schedule, dayWeights]);

  // Toggle lock
  const toggleLock = useCallback(
    async (date: string, locked: boolean) => {
      try {
        await scheduleService.toggleScheduleLock(date, locked);
        await loadSchedule();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle lock');
        throw err;
      }
    },
    [loadSchedule]
  );

  // Bulk delete
  const bulkDelete = useCallback(
    async (dates: string[]) => {
      try {
        await scheduleService.bulkDeleteSchedule(dates);
        await auditService.logAction('BULK_DELETE', `Видалено ${dates.length} записів`);
        await loadSchedule();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to bulk delete');
        throw err;
      }
    },
    [loadSchedule]
  );

  // Initial load
  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  return {
    schedule,
    dayWeights,
    loading,
    error,
    loadSchedule,
    assignUser,
    removeAssignment,
    getUserSchedule,
    getScheduleRange,
    findConflicts,
    findGaps,
    calculateUserLoad,
    calculateEffectiveLoad,
    getStats,
    toggleLock,
    bulkDelete,
  };
};
