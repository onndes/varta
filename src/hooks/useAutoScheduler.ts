// src/hooks/useAutoScheduler.ts

import { useState, useCallback, useRef } from 'react';
import type {
  User,
  ScheduleEntry,
  DayWeights,
  AutoScheduleOptions,
  SchedulerProgressCallback,
  SchedulerVisCallback,
  SchedulerVisEvent,
} from '../types';
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
  const [progress, setProgress] = useState<{ phase: string; percent: number } | null>(null);

  // AbortController for stopping long-running optimization (Multi-Restart / LNS)
  const abortControllerRef = useRef<AbortController | null>(null);

  // Stable progress callback ref to avoid re-renders during scheduling
  const progressCallback = useRef<SchedulerProgressCallback>((phase, percent) => {
    setProgress({ phase, percent });
  });

  // Build a DOM-based visualization callback (direct class manipulation for perf)
  const createVisCallback = useCallback((): SchedulerVisCallback | undefined => {
    if (!autoScheduleOptions.enableSchedulerVisualization) return undefined;
    const speed = autoScheduleOptions.schedulerVisSpeed ?? 0;

    const VIS_CLASSES = [
      'vis-date',
      'vis-candidate',
      'vis-select',
      'vis-swap',
      'vis-swap-try',
      'vis-assigned',
      'vis-lookahead-try',
      'vis-lookahead-best',
      'vis-restart-try',
      'vis-restart',
      'vis-restart-best',
    ];

    const clearTransient = () => {
      document
        .querySelectorAll(
          '.vis-date, .vis-candidate, .vis-select, .vis-swap, .vis-swap-try, .vis-lookahead-try, .vis-lookahead-best, .vis-restart-try, .vis-restart'
        )
        .forEach((el) => {
          el.classList.remove(
            'vis-date',
            'vis-candidate',
            'vis-select',
            'vis-swap',
            'vis-swap-try',
            'vis-lookahead-try',
            'vis-lookahead-best',
            'vis-restart-try',
            'vis-restart'
          );
        });
    };

    const clearAll = () => {
      document.querySelectorAll(VIS_CLASSES.map((c) => '.' + c).join(', ')).forEach((el) => {
        VIS_CLASSES.forEach((c) => el.classList.remove(c));
      });
    };

    // At speed 0, yield a frame to let the browser paint, otherwise use a timed delay
    const delay = (ms: number) => {
      if (ms <= 0) return new Promise<void>((r) => requestAnimationFrame(() => r()));
      return new Promise<void>((r) => setTimeout(r, ms));
    };

    const findCell = (date: string, userId: number): Element | null =>
      document.querySelector(`td[data-date="${date}"][data-user-id="${userId}"]`);

    const findDateCells = (date: string): NodeListOf<Element> =>
      document.querySelectorAll(`td[data-date="${date}"]`);

    return async (event: SchedulerVisEvent) => {
      switch (event.type) {
        case 'greedy-date': {
          clearTransient();
          if (event.dates?.[0]) {
            findDateCells(event.dates[0]).forEach((el) => el.classList.add('vis-date'));
          }
          await delay(speed);
          break;
        }
        case 'greedy-candidate': {
          // Remove previous candidates, keep date highlight and assigned
          document
            .querySelectorAll('.vis-candidate')
            .forEach((el) => el.classList.remove('vis-candidate'));
          if (event.dates?.[0] && event.userIds) {
            for (const uid of event.userIds) {
              findCell(event.dates[0], uid)?.classList.add('vis-candidate');
            }
          }
          await delay(speed * 1.5);
          break;
        }
        case 'greedy-select': {
          document
            .querySelectorAll('.vis-candidate')
            .forEach((el) => el.classList.remove('vis-candidate'));
          if (event.dates?.[0] && event.userIds?.[0]) {
            const cell = findCell(event.dates[0], event.userIds[0]);
            if (cell) {
              cell.classList.add('vis-select');
              await delay(speed * 2);
              cell.classList.remove('vis-select');
              // Persistent highlight — stays until phase ends
              cell.classList.add('vis-assigned');
            }
          }
          // Clear date highlight
          document.querySelectorAll('.vis-date').forEach((el) => el.classList.remove('vis-date'));
          break;
        }
        case 'lookahead-try': {
          document
            .querySelectorAll('.vis-lookahead-try')
            .forEach((el) => el.classList.remove('vis-lookahead-try'));
          if (event.dates?.[0] && event.userIds?.[0]) {
            findCell(event.dates[0], event.userIds[0])?.classList.add('vis-lookahead-try');
          }
          await delay(speed);
          break;
        }
        case 'lookahead-best': {
          document
            .querySelectorAll('.vis-lookahead-try, .vis-lookahead-best')
            .forEach((el) => el.classList.remove('vis-lookahead-try', 'vis-lookahead-best'));
          if (event.dates?.[0] && event.userIds?.[0]) {
            const cell = findCell(event.dates[0], event.userIds[0]);
            if (cell) {
              cell.classList.add('vis-lookahead-best');
              await delay(speed * 1.5);
            }
          }
          break;
        }
        case 'swap-try': {
          // Brief flash showing the algorithm is evaluating this combination
          document
            .querySelectorAll('.vis-swap-try')
            .forEach((el) => el.classList.remove('vis-swap-try'));
          if (event.dates && event.userIds) {
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                findCell(event.dates[i], uid)?.classList.add('vis-swap-try');
              }
            }
          }
          // No explicit delay — throttling is done at the emitter side (~60fps)
          await delay(0);
          break;
        }
        case 'swap-accept': {
          clearTransient();
          if (event.dates && event.userIds) {
            // Remove old vis-restart-best from affected dates before flash
            for (const d of event.dates) {
              document
                .querySelectorAll(`td[data-date="${d}"].vis-restart-best`)
                .forEach((el) => el.classList.remove('vis-restart-best'));
            }
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                findCell(event.dates[i], uid)?.classList.add('vis-swap');
              }
            }
          }
          await delay(speed * 2.5);
          // After flash: promote swapped cells to persistent best highlight
          if (event.dates && event.userIds) {
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                const cell = findCell(event.dates[i], uid);
                if (cell) {
                  cell.classList.remove('vis-swap');
                  cell.classList.add('vis-restart-best');
                }
              }
            }
          }
          document.querySelectorAll('.vis-swap').forEach((el) => el.classList.remove('vis-swap'));
          break;
        }
        case 'restart-try': {
          // Show which dates differ from best — quick amber flash
          document
            .querySelectorAll('.vis-restart-try')
            .forEach((el) => el.classList.remove('vis-restart-try'));
          if (event.dates && event.userIds) {
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                findCell(event.dates[i], uid)?.classList.add('vis-restart-try');
              }
            }
          }
          await delay(speed);
          break;
        }
        case 'restart-best': {
          // Persistent highlight of the current best assignment (purple border)
          document
            .querySelectorAll('.vis-restart-best')
            .forEach((el) => el.classList.remove('vis-restart-best'));
          if (event.dates && event.userIds) {
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                findCell(event.dates[i], uid)?.classList.add('vis-restart-best');
              }
            }
          }
          break;
        }
        case 'restart-improve': {
          clearTransient();
          if (event.dates && event.userIds) {
            for (let i = 0; i < event.dates.length; i++) {
              const uid = event.userIds[i];
              if (uid !== undefined) {
                findCell(event.dates[i], uid)?.classList.add('vis-restart');
              }
            }
          }
          await delay(speed * 3);
          document
            .querySelectorAll('.vis-restart')
            .forEach((el) => el.classList.remove('vis-restart'));
          // Note: restart-best is updated by the next 'restart-best' event from the optimizer
          break;
        }
        case 'phase-start':
          clearAll();
          break;
        case 'phase-end':
        case 'clear':
          clearAll();
          break;
      }
    };
  }, [autoScheduleOptions.enableSchedulerVisualization, autoScheduleOptions.schedulerVisSpeed]);

  // Stop the current scheduler run (aborts Multi-Restart/LNS loop)
  const stopScheduler = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Auto fill gaps
  const fillGaps = useCallback(
    async (dates: string[], onComplete?: () => void) => {
      const ac = new AbortController();
      abortControllerRef.current = ac;
      try {
        setIsProcessing(true);
        setError(null);
        setProgress(null);

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
          ignoreHistoryInLogic,
          progressCallback.current,
          ac.signal,
          createVisCallback()
        );

        await autoScheduler.saveAutoSchedule(updates, dayWeights);

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fill gaps');
        throw err;
      } finally {
        setIsProcessing(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    },
    [
      users,
      schedule,
      dayWeights,
      dutiesPerDay,
      autoScheduleOptions,
      ignoreHistoryInLogic,
      createVisCallback,
    ]
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
      const ac = new AbortController();
      abortControllerRef.current = ac;
      try {
        setIsProcessing(true);
        setError(null);
        setProgress(null);

        const todayStr = toLocalISO(new Date());
        const start = startDate < todayStr ? todayStr : startDate;

        await autoScheduler.recalculateScheduleFrom(
          start,
          users,
          schedule,
          dayWeights,
          dutiesPerDay,
          autoScheduleOptions,
          ignoreHistoryInLogic,
          progressCallback.current,
          ac.signal
        );

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to recalculate');
        throw err;
      } finally {
        setIsProcessing(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    },
    [users, schedule, dayWeights, dutiesPerDay, autoScheduleOptions, ignoreHistoryInLogic]
  );

  // Generate full week schedule
  const generateWeekSchedule = useCallback(
    async (weekDates: string[], onComplete?: () => void) => {
      const ac = new AbortController();
      abortControllerRef.current = ac;
      try {
        setIsProcessing(true);
        setError(null);
        setProgress(null);

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
          ignoreHistoryInLogic,
          progressCallback.current,
          ac.signal,
          createVisCallback()
        );

        await autoScheduler.saveAutoSchedule(updates, dayWeights);

        if (onComplete) onComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate schedule');
        throw err;
      } finally {
        setIsProcessing(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    },
    [
      users,
      schedule,
      dayWeights,
      dutiesPerDay,
      autoScheduleOptions,
      ignoreHistoryInLogic,
      createVisCallback,
    ]
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
    progress,
    fillGaps,
    fixConflicts,
    recalculateFrom,
    generateWeekSchedule,
    getFreeUsersForDate,
    getOptimalAssignment,
    stopScheduler,
  };
};
