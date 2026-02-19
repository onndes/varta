// src/hooks/useSchedule.ts

import { useState, useEffect, useCallback } from 'react';
import type { ScheduleEntry, User, DayWeights } from '../types';
import * as scheduleService from '../services/scheduleService';
import * as auditService from '../services/auditService';
import * as settingsService from '../services/settingsService';

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
    async (date: string, userId: number, isManual = true) => {
      try {
        // Check if there's already an assignment for this date
        const existing = await scheduleService.getScheduleByDate(date);
        if (existing && existing.userId) {
          const prevId = Array.isArray(existing.userId) ? existing.userId[0] : existing.userId;
          if (prevId && prevId !== userId) {
            // Previous user was replaced — restore their karma (service/work reason, no penalty)
            const dayIdx = new Date(date).getDay();
            const weight = dayWeights[dayIdx] || 1.0;
            // Give back weight so they don't lose credit for a shift they didn't serve
            await import('../services/userService').then((us) =>
              us.updateUserDebt(prevId, -weight)
            );
            const prevUser = users.find((u) => u.id === prevId);
            if (prevUser) {
              await auditService.logAction(
                'REMOVE',
                `${prevUser.name} замінено на ${date} (Карма -${weight})`
              );
            }
          }
        }

        const entry: ScheduleEntry = {
          date,
          userId,
          type: isManual ? 'manual' : 'auto',
          isLocked: false,
        };

        await scheduleService.saveScheduleEntry(entry);

        // Repay owedDays if user owes this day of week (Bug 5)
        const user = users.find((u) => u.id === userId);
        if (user && isManual) {
          const dayIdx = new Date(date).getDay();
          if (user.owedDays && user.owedDays[dayIdx] > 0) {
            const weight = dayWeights[dayIdx] || 1.0;
            await import('../services/userService').then(async (us) => {
              await us.updateOwedDays(userId, dayIdx, -1);
              // Restore karma (owed day repaid)
              if (user.debt < 0) {
                const newDebt = Math.min(0, Number((user.debt + weight).toFixed(2)));
                await us.updateUserDebt(userId, newDebt - user.debt);
              }
            });
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
    async (date: string, reason: 'request' | 'work' = 'work') => {
      try {
        const entry = await scheduleService.getScheduleByDate(date);
        if (!entry || !entry.userId) return;

        const user = users.find((u) => u.id === entry.userId);

        await scheduleService.removeAssignmentWithDebt(date, reason, dayWeights);

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
      return Object.values(schedule).filter((entry) => entry.userId === userId);
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
