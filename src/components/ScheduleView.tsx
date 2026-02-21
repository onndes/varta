import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDialog } from './useDialog';
import type { User, ScheduleEntry, DayWeights, Signatories, AutoScheduleOptions } from '../types';
import { toLocalISO, getMondayOfWeek, getWeekNumber, getWeekYear } from '../utils/helpers';
import { formatDate } from '../utils/dateUtils';
import {
  applyKarmaForTransfer,
  calculateEffectiveLoad as calcEffectiveLoad,
  getAllSchedule,
  removeAssignmentWithDebt,
  saveScheduleEntry,
  bulkDeleteSchedule,
} from '../services/scheduleService';
import * as userService from '../services/userService';
import { useAutoScheduler } from '../hooks';
import * as autoSchedulerService from '../services/autoScheduler';
import * as auditService from '../services/auditService';
import WeekNavigator from './schedule/WeekNavigator';
import ScheduleControls from './schedule/ScheduleControls';
import PrintHeader from './schedule/PrintHeader';
import PrintFooter from './PrintFooter';
import ScheduleTable from './schedule/ScheduleTable';
import PrintCalendar from './schedule/PrintCalendar';
import AssignmentModal, { type SwapMode } from './schedule/AssignmentModal';
import ConfirmAssignModal from './schedule/ConfirmAssignModal';
import { isUserAvailable } from '../services/userService';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';
import { getAssignedCount, isAssignedInEntry, toAssignedUserIds } from '../utils/assignment';

interface ScheduleViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  dayWeights: DayWeights;
  cascadeStartDate: string | null;
  updateCascadeTrigger: (date: string) => Promise<void>;
  clearCascadeTrigger: () => Promise<void>;
  signatories: Signatories;
  autoScheduleOptions?: AutoScheduleOptions;
  dutiesPerDay: number;
}

interface SelectedCell {
  date: string;
  entry: ScheduleEntry | null;
  assignedUserId?: number;
}

interface PendingAssignConfirm {
  userId: number;
  transferFrom?: string;
  isRestDay: boolean;
  penalizeReplaced?: boolean;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({
  users,
  schedule,
  refreshData,
  logAction,
  dayWeights,
  cascadeStartDate,
  updateCascadeTrigger,
  clearCascadeTrigger,
  signatories,
  autoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  dutiesPerDay,
}) => {
  // Direct service operations (no duplicate useSchedule hook)
  const calculateEffectiveLoad = useCallback(
    (user: User) => calcEffectiveLoad(user, schedule, dayWeights),
    [schedule, dayWeights]
  );

  const assignUser = useCallback(
    async (
      date: string,
      userId: number,
      isManual = true,
      options?: { maxPerDay?: number; replaceUserId?: number; penalizeReplaced?: boolean }
    ) => {
      const existing = schedule[date];
      const existingIds = toAssignedUserIds(existing?.userId);
      if (existingIds.includes(userId)) return;

      let nextIds = [...existingIds];
      const replaceUserId = options?.replaceUserId;
      if (typeof replaceUserId === 'number' && nextIds.includes(replaceUserId)) {
        nextIds = nextIds.filter((id) => id !== replaceUserId);
        const prevUser = users.find((u) => u.id === replaceUserId);
        if (prevUser) {
          if (options?.penalizeReplaced) {
            // Apply karma penalty to the replaced user
            const dayIdx = new Date(date).getDay();
            const weight = dayWeights[dayIdx] || 1.0;
            await userService.updateUserDebt(replaceUserId, -weight);
            await auditService.logAction(
              'REMOVE',
              `${prevUser.name} замінено на ${date} (Карма -${weight})`
            );
          } else {
            await auditService.logAction('REMOVE', `${prevUser.name} замінено на ${date}`);
          }
        }
      }

      if (options?.maxPerDay && nextIds.length >= options.maxPerDay) {
        throw new Error('Досягнуто ліміт чергувань на день');
      }

      nextIds.push(userId);

      const isReplace = typeof replaceUserId === 'number';
      const entry: ScheduleEntry = {
        date,
        userId: nextIds.length === 1 ? nextIds[0] : nextIds,
        type: isManual ? (isReplace ? 'replace' : 'manual') : 'auto',
        isLocked: false,
      };

      await saveScheduleEntry(entry);

      // Repay owedDays if user owes this day of week
      const user = users.find((u) => u.id === userId);
      if (user && isManual) {
        const dayIdx = new Date(date).getDay();
        if (user.owedDays && user.owedDays[dayIdx] > 0) {
          const weight = dayWeights[dayIdx] || 1.0;
          await userService.updateOwedDays(userId, dayIdx, -1);
          if (user.debt < 0) {
            const newDebt = Math.min(0, Number((user.debt + weight).toFixed(2)));
            await userService.updateUserDebt(userId, newDebt - user.debt);
          }
        }
        await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
      } else if (user) {
        await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
      }
    },
    [users, dayWeights, schedule]
  );

  const removeAssignment = useCallback(
    async (date: string, reason: 'request' | 'work' = 'work', targetUserId?: number) => {
      const entry = schedule[date];
      if (!entry || !entry.userId) return;
      await removeAssignmentWithDebt(date, reason, dayWeights, targetUserId);
    },
    [schedule, dayWeights]
  );

  const bulkDelete = useCallback(async (dates: string[]) => {
    await bulkDeleteSchedule(dates);
    await auditService.logAction('BULK_DELETE', `Видалено ${dates.length} записів`);
  }, []);

  const { fillGaps, recalculateFrom, generateWeekSchedule } = useAutoScheduler(
    users,
    schedule,
    dayWeights,
    dutiesPerDay,
    autoScheduleOptions
  );

  const [currentMonday, setCurrentMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [swapMode, setSwapMode] = useState<SwapMode>('replace');
  const [pendingAssignConfirm, setPendingAssignConfirm] = useState<PendingAssignConfirm | null>(
    null
  );

  const { showAlert, showConfirm } = useDialog();

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i);
      dates.push(toLocalISO(d));
    }
    return dates;
  }, [currentMonday]);

  const todayStr = useMemo(() => toLocalISO(new Date()), []);

  const scheduledWeeksMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    Object.keys(schedule).forEach((dateStr) => {
      const d = new Date(dateStr);
      const year = getWeekYear(d); // ISO week-year, not calendar year
      const week = getWeekNumber(d);
      if (!map.has(year)) map.set(year, new Set());
      map.get(year)!.add(week);
    });
    return map;
  }, [schedule]);

  const scheduleIssues = useMemo(() => {
    const conflicts: string[] = [];
    const criticalConflicts: string[] = []; // User assigned but blocked (vacation/sick)
    const gaps: string[] = [];
    const conflictByDate: Record<string, number[]> = {};
    const checkStart = weekDates[0];

    Object.entries(schedule).forEach(([date, entry]) => {
      if (date < checkStart) return;
      const ids = toAssignedUserIds(entry.userId);
      const conflictIds = ids.filter((id) => {
        const user = users.find((u) => u.id === id);
        if (!user) return true;
        if (!isUserAvailable(user, date, schedule)) {
          if (user.status === 'VACATION' || user.status === 'SICK' || user.status === 'TRIP') {
            if (
              user.statusFrom &&
              user.statusTo &&
              date >= user.statusFrom &&
              date <= user.statusTo
            ) {
              criticalConflicts.push(date);
            }
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
  }, [schedule, users, weekDates, dutiesPerDay]);

  const shiftWeek = useCallback((offset: number) => {
    setCurrentMonday((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + offset * 7);
      return newDate;
    });
  }, []);

  // Keyboard navigation: ArrowLeft / ArrowRight to switch weeks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selectedCell || pendingAssignConfirm) return;
      shiftWeek(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shiftWeek, selectedCell, pendingAssignConfirm]);

  const jumpToWeek = (w: number, year?: number) =>
    setCurrentMonday(getMondayOfWeek(year ?? new Date().getFullYear(), w));

  const goToToday = () => {
    const d = new Date();
    const day = d.getDay();
    setCurrentMonday(new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))));
  };

  const handleDatePick = (dateValue: string) => {
    if (!dateValue) return;
    const d = new Date(dateValue);
    const day = d.getDay();
    setCurrentMonday(new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))));
  };

  const daysSinceLastDuty = useCallback(
    (userId: number, refDate: string): number => {
      const previousDates = Object.values(schedule)
        .filter((s) => s.date < refDate && toAssignedUserIds(s.userId).includes(userId))
        .map((s) => s.date)
        .sort();
      if (previousDates.length === 0) return Number.POSITIVE_INFINITY;
      const last = previousDates[previousDates.length - 1];
      const diff = new Date(refDate).getTime() - new Date(last).getTime();
      return Math.floor(diff / 86400000);
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
          // includeRestDay: skip rest-day check so rest-day users appear (with badge)
          return includeRestDay
            ? isUserAvailable(u, dateStr)
            : isUserAvailable(u, dateStr, schedule);
        })
        .sort((a, b) => {
          // Priority 1: Owed days for this day of week
          const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
          const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
          if (oweA !== oweB) return oweB - oweA;

          // Priority 2: Effective load (least load first)
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          if (loadA !== loadB) return loadA - loadB;

          // Priority 3: Karma (most negative first)
          if (a.debt !== b.debt) return a.debt - b.debt;

          // Priority 4: Days since last duty (most idle first)
          const idleA = daysSinceLastDuty(a.id!, dateStr);
          const idleB = daysSinceLastDuty(b.id!, dateStr);
          return idleB - idleA;
        });
    },
    [schedule, users, calculateEffectiveLoad, daysSinceLastDuty]
  );

  // Get users assigned on the same week (for swap/replace mode)
  const getWeekAssignedUsers = useCallback(
    (dateStr: string) => {
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));

      // Collect all unique user IDs assigned on this week (excluding target date)
      const weekUserIds = new Set<number>();
      for (const wd of weekDates) {
        if (wd === dateStr) continue;
        const entry = schedule[wd];
        if (entry) {
          toAssignedUserIds(entry.userId).forEach((id) => weekUserIds.add(id));
        }
      }

      // Filter: must be assigned this week, NOT assigned on target date, and active
      // Don't check isUserAvailable — rest-day users should still be swappable
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
          const idleA = daysSinceLastDuty(a.id!, dateStr);
          const idleB = daysSinceLastDuty(b.id!, dateStr);
          return idleB - idleA;
        });
    },
    [schedule, users, weekDates, calculateEffectiveLoad, daysSinceLastDuty]
  );

  // Check if cascade recalc could improve assignments (after getFreeUsers defined)
  const shouldShowCascadeRecalc = useMemo(() => {
    if (!cascadeStartDate) return false;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;

    // Check if there are unlocked entries that could be improved
    return Object.entries(schedule).some(([date, entry]) => {
      if (date < start || entry.type === 'manual') return false;

      const assignedIds = toAssignedUserIds(entry.userId);
      if (assignedIds.length === 0) return false;

      // Get available candidates excluding already assigned on the same date
      const freeUsers = getFreeUsers(date).filter((u) => !assignedIds.includes(u.id!));
      if (freeUsers.length === 0) return false;

      // Check each assigned slot; if any can be improved, suggest cascade
      return assignedIds.some((assignedId) => {
        const currentUser = users.find((u) => u.id === assignedId);
        if (!currentUser) return true;
        const currentLoad = calculateEffectiveLoad(currentUser);
        return freeUsers.some((u) => calculateEffectiveLoad(u) < currentLoad - 0.5);
      });
    });
  }, [cascadeStartDate, schedule, todayStr, users, getFreeUsers, calculateEffectiveLoad]);

  const hasEnoughActiveUsers = useCallback(async (): Promise<boolean> => {
    const activeUsers = users.filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto);
    if (activeUsers.length < 2) {
      await showAlert(
        '⚠️ НЕДОСТАТНЬО БІЙЦІВ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних бійці.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return false;
    }
    return true;
  }, [users, showAlert]);

  const runFillGaps = async () => {
    if (!(await hasEnoughActiveUsers())) return;

    const datesToFill = scheduleIssues.gaps.filter((d) => d >= todayStr).sort();
    if (datesToFill.length === 0) return;

    await fillGaps(datesToFill);
    await logAction('AUTO_FILL', `Заповнено ${datesToFill.length} днів`);
    await refreshData();
  };

  const runFixConflicts = async () => {
    if (!(await hasEnoughActiveUsers())) return;

    if (scheduleIssues.conflicts.length === 0) return;

    const isCritical = scheduleIssues.criticalConflicts.length > 0;
    const message = isCritical
      ? `Замінити ${scheduleIssues.criticalConflicts.length} блокованих працівників?`
      : `Видалити ${scheduleIssues.conflicts.length} конфліктних записів і заповнити?`;

    if (!(await showConfirm(message))) return;

    // Remove only conflicting assignees, keep valid assignees on same date
    for (const date of scheduleIssues.conflicts) {
      const badIds = scheduleIssues.conflictByDate[date] || [];
      for (const userId of badIds) {
        await removeAssignmentWithDebt(date, 'work', dayWeights, userId);
      }
    }

    // Fill only dates still under-filled after conflict cleanup
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
  };

  const runFullAutoSchedule = async () => {
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

    await generateWeekSchedule(validTargets);
    await logAction(
      'AUTO_SCHEDULE',
      `Перегенеровано тиждень ${validTargets[0]} - ${validTargets[validTargets.length - 1]}`
    );
    await refreshData();
  };

  const runClearWeek = async () => {
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

    await bulkDelete(datesToClear);
    await updateCascadeTrigger(weekDates[0]);
    await logAction('CLEAR_WEEK', `Очищено тиждень ${weekDates[0]} - ${weekDates[6]}`);
    await refreshData();
  };

  const runCascadeRecalc = async () => {
    if (!(await hasEnoughActiveUsers())) return;

    if (!cascadeStartDate) return;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    if (!(await showConfirm(`Перерахувати АВТОМАТИЧНІ призначення з ${formatDate(start)}?`)))
      return;

    await recalculateFrom(start);
    await clearCascadeTrigger(); // Clear trigger after successful recalc
    await logAction('CASCADE', `Перерахунок з ${start}`);
    await refreshData();
  };

  const isOnRestDay = useCallback(
    (userId: number, dateStr: string): boolean => {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevEntry = schedule[toLocalISO(prevDate)];
      return isAssignedInEntry(prevEntry, userId);
    },
    [schedule]
  );

  const getTransferSourceDate = useCallback(
    (userId: number, targetDate: string): string | undefined => {
      const assignedDates = Object.keys(schedule)
        .filter((d) => d !== targetDate && isAssignedInEntry(schedule[d], userId))
        .sort();
      if (assignedDates.length === 0) return undefined;

      const prevDates = assignedDates.filter((d) => d < targetDate);
      if (prevDates.length > 0) return prevDates[prevDates.length - 1];

      return assignedDates[0];
    },
    [schedule]
  );

  const executeAssign = async (
    userId: number,
    transferMode: 'none' | 'move',
    penalizeReplaced = false
  ) => {
    if (!selectedCell) return;

    const transferFrom =
      transferMode === 'move' ? getTransferSourceDate(userId, selectedCell.date) : undefined;

    if (transferFrom) {
      await removeAssignment(transferFrom, 'work', userId);
      await applyKarmaForTransfer(userId, transferFrom, selectedCell.date, dayWeights);
      await logAction('TRANSFER', `Перенесено з ${transferFrom} на ${selectedCell.date}`);
    }

    await assignUser(selectedCell.date, userId, true, {
      maxPerDay: dutiesPerDay,
      replaceUserId: selectedCell.assignedUserId,
      penalizeReplaced,
    });
    await updateCascadeTrigger(selectedCell.date);

    const u = users.find((user) => user.id === userId);
    const dayIdx = new Date(selectedCell.date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;
    if (u) await logAction('MANUAL', `${u.name} (Карма +${weight})`);

    setPendingAssignConfirm(null);
    setSelectedCell(null);
    await refreshData();
  };

  const handleAssign = async (userId: number | undefined, penalizeReplaced = false) => {
    if (!userId || !selectedCell) return;

    const isReplaceMode = Boolean(selectedCell.assignedUserId);
    const isRestDay = isOnRestDay(userId, selectedCell.date);

    if (isReplaceMode) {
      // Replace mode: skip transfer logic, just confirm if rest day
      if (isRestDay) {
        const userName = users.find((u) => u.id === userId)?.name || '';
        const ok = await showConfirm(
          `${userName} — відсипний (чергував вчора).\nВсе одно призначити?`
        );
        if (!ok) return;
      }
      await executeAssign(userId, 'none', penalizeReplaced);
      return;
    }

    // Fresh assignment mode: check rest day & transfer
    const transferFrom = getTransferSourceDate(userId, selectedCell.date);
    if (isRestDay || transferFrom) {
      setPendingAssignConfirm({ userId, transferFrom, isRestDay, penalizeReplaced });
      return;
    }

    await executeAssign(userId, 'none', penalizeReplaced);
  };

  const handleSwap = async (swapUserId: number, swapDate: string) => {
    if (!selectedCell?.assignedUserId) return;
    const { date: targetDate, assignedUserId: currentUserId } = selectedCell;

    if (!swapDate) return;

    // Remove both users from their respective dates
    await removeAssignment(targetDate, 'work', currentUserId);
    await removeAssignment(swapDate, 'work', swapUserId);

    // Re-read schedule to get fresh state
    const freshSchedule = await getAllSchedule();

    // Assign swapUser to targetDate and currentUser to swapDate (no karma)
    const targetEntry = freshSchedule[targetDate];
    const targetIds = toAssignedUserIds(targetEntry?.userId);
    targetIds.push(swapUserId);
    await saveScheduleEntry({
      date: targetDate,
      userId: targetIds.length === 1 ? targetIds[0] : targetIds,
      type: 'swap',
      isLocked: false,
    });

    const swapEntry = freshSchedule[swapDate];
    const swapIds = toAssignedUserIds(swapEntry?.userId);
    swapIds.push(currentUserId);
    await saveScheduleEntry({
      date: swapDate,
      userId: swapIds.length === 1 ? swapIds[0] : swapIds,
      type: 'swap',
      isLocked: false,
    });

    const currentUser = users.find((u) => u.id === currentUserId);
    const swapUser = users.find((u) => u.id === swapUserId);
    await logAction(
      'SWAP',
      `Обмін: ${currentUser?.name} (${targetDate}) ↔ ${swapUser?.name} (${swapDate})`
    );

    setSelectedCell(null);
    await refreshData();
  };

  const handleRemove = async (reason: 'request' | 'work') => {
    if (!selectedCell?.entry || !selectedCell.entry.userId || !selectedCell.assignedUserId) return;
    const { date } = selectedCell;
    const dayIdx = new Date(date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;

    await removeAssignment(date, reason, selectedCell.assignedUserId);
    await updateCascadeTrigger(date);

    const u = users.find((user) => user.id === selectedCell.assignedUserId);
    if (u) {
      if (reason === 'request') {
        await logAction('REMOVE', `${u.name} рапорт (Карма -${weight})`);
      } else {
        await logAction('REMOVE', `Службова`);
      }
    }

    setSelectedCell(null);
    await refreshData();
  };

  return (
    <div className="schedule-view-wrapper">
      <WeekNavigator
        currentDate={new Date()}
        activeDate={new Date(weekDates[0])}
        scheduledWeeksMap={scheduledWeeksMap}
        onJumpToWeek={jumpToWeek}
      />

      <ScheduleControls
        weekDates={weekDates}
        cascadeStartDate={cascadeStartDate}
        shouldShowCascade={shouldShowCascadeRecalc}
        conflictsCount={scheduleIssues.conflicts.length}
        criticalConflictsCount={scheduleIssues.criticalConflicts.length}
        onPrevWeek={() => shiftWeek(-1)}
        onNextWeek={() => shiftWeek(1)}
        onToday={goToToday}
        onDatePick={handleDatePick}
        onFillGaps={runFillGaps}
        onFixConflicts={runFixConflicts}
        onAutoSchedule={runFullAutoSchedule}
        onCascadeRecalc={runCascadeRecalc}
        onClearWeek={runClearWeek}
      />

      <PrintHeader signatories={signatories} weekDates={weekDates} />

      <ScheduleTable
        users={users}
        weekDates={weekDates}
        schedule={schedule}
        todayStr={todayStr}
        onCellClick={(date, entry, assignedUserId) => {
          setSelectedCell({ date, entry, assignedUserId });
          setSwapMode('replace');
        }}
      />

      <PrintCalendar weekDates={weekDates} schedule={schedule} users={users} />

      <PrintFooter signatories={signatories} />

      <AssignmentModal
        show={!!selectedCell}
        date={selectedCell?.date || ''}
        assignedUserId={selectedCell?.assignedUserId}
        users={users}
        freeUsers={selectedCell ? getFreeUsers(selectedCell.date, true) : []}
        swapUsers={selectedCell ? getWeekAssignedUsers(selectedCell.date) : []}
        schedule={schedule}
        weekDates={weekDates}
        swapMode={swapMode}
        onSetSwapMode={setSwapMode}
        onAssign={(userId, penalize) => handleAssign(userId, penalize)}
        onSwap={handleSwap}
        onRemove={handleRemove}
        onClose={() => setSelectedCell(null)}
        isOnRestDay={isOnRestDay}
        calculateEffectiveLoad={calculateEffectiveLoad}
        daysSinceLastDuty={daysSinceLastDuty}
        hasEntry={!!selectedCell?.entry}
      />

      <ConfirmAssignModal
        show={!!pendingAssignConfirm && !!selectedCell}
        pending={pendingAssignConfirm}
        targetDate={selectedCell?.date || ''}
        users={users}
        onConfirmMove={(userId) =>
          executeAssign(userId, 'move', pendingAssignConfirm?.penalizeReplaced)
        }
        onConfirmAdd={(userId) =>
          executeAssign(userId, 'none', pendingAssignConfirm?.penalizeReplaced)
        }
        onClose={() => setPendingAssignConfirm(null)}
      />
    </div>
  );
};

export default ScheduleView;
