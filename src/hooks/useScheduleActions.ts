// src/hooks/useScheduleActions.ts

import { useCallback } from 'react';
import { useDialog } from '../components/useDialog';
import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../types';
import { formatDate, toLocalISO } from '../utils/dateUtils';
import {
  getAllSchedule,
  removeAssignmentWithDebt,
  acknowledgeScheduleConflicts,
} from '../services/scheduleService';
import * as autoSchedulerService from '../services/autoScheduler';
import { getAssignedCount } from '../utils/assignment';
import { isCurrentlyExcludedFromAuto } from '../utils/userExcludeFromAuto';

interface ScheduleIssues {
  conflicts: string[];
  criticalConflicts: string[];
  gaps: string[];
  conflictByDate: Record<string, number[]>;
}

interface UseScheduleActionsArgs {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  weekDates: string[];
  todayStr: string;
  dutiesPerDay: number;
  autoScheduleOptions: AutoScheduleOptions;
  cascadeStartDate: string | null;
  scheduleIssues: ScheduleIssues;
  pushHistory: (snapshot: Record<string, ScheduleEntry>, label: string) => void;
  fillGaps: (dates: string[]) => Promise<void>;
  recalculateFrom: (startDate: string) => Promise<void>;
  generateWeekSchedule: (dates: string[]) => Promise<void>;
  removeAssignment: (
    date: string,
    reason: 'request' | 'work',
    targetUserId?: number
  ) => Promise<void>;
  bulkDelete: (dates: string[]) => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  clearCascadeTrigger: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  refreshData: () => Promise<void>;
  undoHistory: (snapshot: Record<string, ScheduleEntry>) => Promise<void>;
  redoHistory: (snapshot: Record<string, ScheduleEntry>) => Promise<void>;
}

export const useScheduleActions = ({
  users,
  schedule,
  dayWeights,
  weekDates,
  todayStr,
  dutiesPerDay,
  autoScheduleOptions,
  cascadeStartDate,
  scheduleIssues,
  pushHistory,
  fillGaps,
  recalculateFrom,
  generateWeekSchedule,
  bulkDelete,
  updateCascadeTrigger,
  clearCascadeTrigger,
  logAction,
  refreshData,
  undoHistory,
  redoHistory,
}: UseScheduleActionsArgs) => {
  const { showAlert, showConfirm, showChoice, showDatePick } = useDialog();

  const hasEnoughActiveUsers = useCallback(async (): Promise<boolean> => {
    const activeUsers = users.filter(
      (u) => u.isActive && !u.isExtra && !isCurrentlyExcludedFromAuto(u, todayStr)
    );
    if (activeUsers.length < 2) {
      await showAlert(
        '⚠️ НЕДОСТАТНЬО ОСІБ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних особи.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return false;
    }
    return true;
  }, [users, showAlert, todayStr]);

  const runFillGaps = useCallback(async () => {
    if (!(await hasEnoughActiveUsers())) return;

    const datesToFill = scheduleIssues.gaps.filter((d) => d >= todayStr).sort();
    if (datesToFill.length === 0) return;

    pushHistory(schedule, 'Заповнення прогалин');
    await fillGaps(datesToFill);
    await logAction('AUTO_FILL', `Заповнено ${datesToFill.length} днів`);
    await refreshData();
  }, [
    hasEnoughActiveUsers,
    scheduleIssues,
    todayStr,
    schedule,
    pushHistory,
    fillGaps,
    logAction,
    refreshData,
  ]);

  const runFixConflicts = useCallback(async () => {
    if (scheduleIssues.conflicts.length === 0) return;

    const isCritical = scheduleIssues.criticalConflicts.length > 0;
    if (isCritical) {
      if (!(await hasEnoughActiveUsers())) return;
      const message = `Замінити ${scheduleIssues.criticalConflicts.length} блокованих працівників?`;
      if (!(await showConfirm(message))) return;
    } else {
      const choice = await showChoice({
        message:
          `Видалити ${scheduleIssues.conflicts.length} конфліктних записів і заповнити?\n\n` +
          'Або можна залишити їх як свідоме виключення.',
        confirmLabel: 'Виправити',
        secondaryLabel: 'Залишити так',
        cancelLabel: 'Скасувати',
      });
      if (choice === 'cancel') return;
      if (choice === 'secondary') {
        pushHistory(schedule, 'Підтвердження конфліктів');
        await acknowledgeScheduleConflicts(scheduleIssues.conflictByDate);
        await logAction(
          'ACK_CONFLICT',
          `Підтверджено ${scheduleIssues.conflicts.length} конфліктних записів як виняток`
        );
        await refreshData();
        return;
      }
      if (!(await hasEnoughActiveUsers())) return;
    }

    pushHistory(schedule, 'Виправлення конфліктів');

    for (const date of scheduleIssues.conflicts) {
      const badIds = scheduleIssues.conflictByDate[date] || [];
      for (const userId of badIds) {
        await removeAssignmentWithDebt(date, 'work', dayWeights, userId);
      }
    }

    const freshSchedule = await getAllSchedule();
    const datesToFill = scheduleIssues.conflicts.filter(
      (d) => getAssignedCount(freshSchedule[d]) < dutiesPerDay
    );
    if (datesToFill.length > 0) {
      const updates = await autoSchedulerService.autoFillSchedule(
        datesToFill,
        users,
        freshSchedule,
        dayWeights,
        dutiesPerDay,
        autoScheduleOptions
      );
      await autoSchedulerService.saveAutoSchedule(updates, dayWeights);
    }

    await logAction('AUTO_FIX', `Замінено ${scheduleIssues.conflicts.length} конфліктів`);
    await refreshData();
  }, [
    hasEnoughActiveUsers,
    scheduleIssues,
    schedule,
    pushHistory,
    dayWeights,
    dutiesPerDay,
    autoScheduleOptions,
    users,
    logAction,
    refreshData,
    showConfirm,
    showChoice,
  ]);

  const runFullAutoSchedule = useCallback(async () => {
    if (!(await hasEnoughActiveUsers())) return;

    const validTargets = weekDates.filter((d) => d >= todayStr);
    if (validTargets.length === 0) {
      await showAlert('Неможливо змінити минуле.');
      return;
    }
    const hasExistingEntries = validTargets.some((d) => Boolean(schedule[d]));
    if (
      hasExistingEntries &&
      !(await showConfirm(
        'Перегенерувати тиждень?\n\nНезаблоковані призначення на цьому тиждні буде очищено і побудовано заново.'
      ))
    ) {
      return;
    }
    pushHistory(schedule, 'Генерація тижня');
    await generateWeekSchedule(validTargets);
    // A freshly generated week is already the most up-to-date schedule.
    // Any pending cascade trigger is now obsolete — clear it so the
    // "Optimize" button does not appear immediately after generation.
    await clearCascadeTrigger();
    await logAction(
      'AUTO_SCHEDULE',
      `Перегенеровано тиждень ${validTargets[0]} - ${validTargets[validTargets.length - 1]}`
    );
    await refreshData();
  }, [
    hasEnoughActiveUsers,
    weekDates,
    todayStr,
    schedule,
    pushHistory,
    generateWeekSchedule,
    clearCascadeTrigger,
    logAction,
    refreshData,
    showAlert,
    showConfirm,
  ]);

  const runClearWeek = useCallback(async () => {
    const datesToClear = weekDates.filter((date) => Boolean(schedule[date]));
    if (datesToClear.length === 0) {
      await showAlert('На цьому тиждні немає призначень для очищення.');
      return;
    }

    if (
      !(await showConfirm(
        `Очистити призначення за поточний тиждень?\n\nБуде видалено записів: ${datesToClear.length}`
      ))
    ) {
      return;
    }

    pushHistory(schedule, 'Очищення тижня');
    await bulkDelete(datesToClear);
    await updateCascadeTrigger(weekDates[0]);
    await logAction('CLEAR_WEEK', `Очищено тиждень ${weekDates[0]} - ${weekDates[6]}`);
    await refreshData();
  }, [
    weekDates,
    schedule,
    pushHistory,
    bulkDelete,
    updateCascadeTrigger,
    logAction,
    refreshData,
    showAlert,
    showConfirm,
  ]);

  const runCascadeRecalc = useCallback(async () => {
    if (!(await hasEnoughActiveUsers())) return;
    if (!cascadeStartDate) return;

    // Default date = today + 2 days (buffer so near-term plans aren't disrupted).
    const defaultD = new Date(todayStr + 'T12:00:00');
    defaultD.setDate(defaultD.getDate() + 2);
    const defaultDate = toLocalISO(defaultD);

    const earliestChange = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    const selectedDate = await showDatePick({
      message: `Зміни зафіксовано з ${formatDate(earliestChange)}. Ручні та заблоковані записи не зачіпаються.`,
      defaultDate,
      minDate: todayStr,
    });
    if (!selectedDate) return;

    pushHistory(schedule, 'Оптимізація');
    await recalculateFrom(selectedDate);
    await clearCascadeTrigger();
    await logAction('CASCADE', `Перерахунок з ${selectedDate}`);
    await refreshData();
  }, [
    hasEnoughActiveUsers,
    cascadeStartDate,
    todayStr,
    schedule,
    pushHistory,
    recalculateFrom,
    clearCascadeTrigger,
    logAction,
    refreshData,
    showDatePick,
  ]);

  const runDismissCascade = useCallback(async () => {
    await clearCascadeTrigger();
  }, [clearCascadeTrigger]);

  const runUndo = useCallback(async () => {
    await undoHistory(schedule);
    await refreshData();
  }, [undoHistory, schedule, refreshData]);

  const runRedo = useCallback(async () => {
    await redoHistory(schedule);
    await refreshData();
  }, [redoHistory, schedule, refreshData]);

  return {
    runFillGaps,
    runFixConflicts,
    runFullAutoSchedule,
    runClearWeek,
    runCascadeRecalc,
    runDismissCascade,
    runUndo,
    runRedo,
  };
};
