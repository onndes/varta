import React, { useState, useMemo, useCallback } from 'react';
import type { User, ScheduleEntry, DayWeights, Signatories, AutoScheduleOptions } from '../types';
import { toLocalISO, getMondayOfWeek, getWeekNumber } from '../utils/helpers';
import {
  applyKarmaForTransfer,
  countUserAssignments,
  countUserDaysOfWeek,
  getAllSchedule,
  removeAssignmentWithDebt,
} from '../services/scheduleService';
import { useSchedule, useAutoScheduler } from '../hooks';
import * as autoSchedulerService from '../services/autoScheduler';
import Modal from './Modal';
import WeekNavigator from './schedule/WeekNavigator';
import ScheduleControls from './schedule/ScheduleControls';
import PrintHeader from './schedule/PrintHeader';
import PrintFooter from './PrintFooter';
import ScheduleTable from './schedule/ScheduleTable';
import PrintCalendar from './schedule/PrintCalendar';
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
  const { assignUser, removeAssignment, calculateEffectiveLoad } = useSchedule(users);
  const { fillGaps, recalculateFrom } = useAutoScheduler(
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
  const [swapMode, setSwapMode] = useState<'replace' | 'remove'>('replace');
  const [pendingAssignConfirm, setPendingAssignConfirm] = useState<PendingAssignConfirm | null>(
    null
  );

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

  const scheduledWeeks = useMemo(() => {
    const weeks = new Set<number>();
    Object.keys(schedule).forEach((dateStr) => weeks.add(getWeekNumber(new Date(dateStr))));
    return weeks;
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

  const shiftWeek = (offset: number) => {
    const newDate = new Date(currentMonday);
    newDate.setDate(newDate.getDate() + offset * 7);
    setCurrentMonday(newDate);
  };

  const jumpToWeek = (w: number) => setCurrentMonday(getMondayOfWeek(new Date().getFullYear(), w));

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

  const getFreeUsers = useCallback(
    (dateStr: string) => {
      const dayIndex = new Date(dateStr).getDay();
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));

      return users
        .filter((u) => !assignedOnDate.has(u.id!) && isUserAvailable(u, dateStr, schedule))
        .sort((a, b) => {
          // Priority 1: Owed days for this day of week
          const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
          const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
          if (oweA !== oweB) return oweB - oweA;

          // Priority 2: Day-of-week balance ("ladder")
          const dowA = countUserDaysOfWeek(a.id!, schedule)[dayIndex] || 0;
          const dowB = countUserDaysOfWeek(b.id!, schedule)[dayIndex] || 0;
          if (dowA !== dowB) return dowA - dowB;

          // Priority 3: Total assignments
          const totalA = countUserAssignments(a.id!, schedule);
          const totalB = countUserAssignments(b.id!, schedule);
          if (totalA !== totalB) return totalA - totalB;

          // Priority 4: Effective load (weighted + debt)
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          return loadA - loadB;
        });
    },
    [schedule, users, calculateEffectiveLoad]
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

  const runFillGaps = async () => {
    // Check if there are at least 2 active users available for scheduling
    const activeUsers = users.filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto);
    if (activeUsers.length < 2) {
      alert(
        '⚠️ НЕДОСТАТНЬО БІЙЦІВ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних бійці.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return;
    }

    const datesToFill = scheduleIssues.gaps.filter((d) => d >= todayStr).sort();
    if (datesToFill.length === 0) return;

    await fillGaps(datesToFill);
    await logAction('AUTO_FILL', `Заповнено ${datesToFill.length} днів`);
    await refreshData();
  };

  const runFixConflicts = async () => {
    // Check if there are at least 2 active users available for scheduling
    const activeUsers = users.filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto);
    if (activeUsers.length < 2) {
      alert(
        '⚠️ НЕДОСТАТНЬО БІЙЦІВ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних бійці.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return;
    }

    if (scheduleIssues.conflicts.length === 0) return;

    const isCritical = scheduleIssues.criticalConflicts.length > 0;
    const message = isCritical
      ? `Замінити ${scheduleIssues.criticalConflicts.length} блокованих працівників?`
      : `Видалити ${scheduleIssues.conflicts.length} конфліктних записів і заповнити?`;

    if (!confirm(message)) return;

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
    // Check if there are at least 2 active users available for scheduling
    const activeUsers = users.filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto);
    if (activeUsers.length < 2) {
      alert(
        '⚠️ НЕДОСТАТНЬО БІЙЦІВ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних бійці.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return;
    }

    const validTargets = weekDates.filter((d) => d >= todayStr);
    if (validTargets.length === 0) {
      alert('Неможливо змінити минуле.');
      return;
    }
    if (validTargets.some((d) => schedule[d]) && !confirm('Перезаписати пусті місця?')) return;

    await fillGaps(validTargets);
    await logAction('AUTO_SCHEDULE', `Автоматичне планування тижня`);
    await refreshData();
  };

  const runCascadeRecalc = async () => {
    // Check if there are at least 2 active users available for scheduling
    const activeUsers = users.filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto);
    if (activeUsers.length < 2) {
      alert(
        '⚠️ НЕДОСТАТНЬО БІЙЦІВ!\n\nДля автоматичного розподілу потрібно мінімум 2 активних бійці.\n\nЗараз доступно: ' +
          activeUsers.length
      );
      return;
    }

    if (!cascadeStartDate) return;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    if (!confirm(`Перерахувати АВТОМАТИЧНІ призначення з ${start}?`)) return;

    await recalculateFrom(start);
    await clearCascadeTrigger(); // Clear trigger after successful recalc
    await logAction('CASCADE', `Перерахунок з ${start}`);
    await refreshData();
  };

  const isOnRestDay = (userId: number, dateStr: string): boolean => {
    const prevDate = new Date(dateStr);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevEntry = schedule[toLocalISO(prevDate)];
    return isAssignedInEntry(prevEntry, userId);
  };

  const getTransferSourceDate = (userId: number, targetDate: string): string | undefined => {
    const assignedDates = Object.keys(schedule)
      .filter((d) => d !== targetDate && isAssignedInEntry(schedule[d], userId))
      .sort();
    if (assignedDates.length === 0) return undefined;

    const prevDates = assignedDates.filter((d) => d < targetDate);
    if (prevDates.length > 0) return prevDates[prevDates.length - 1];

    // If there is no previous duty, use the nearest upcoming one.
    return assignedDates[0];
  };

  const getWeekRelationLabel = (fromDate: string, toDate: string): string => {
    const fromMonday = getMondayOfWeek(new Date(fromDate).getFullYear(), getWeekNumber(new Date(fromDate)));
    const toMonday = getMondayOfWeek(new Date(toDate).getFullYear(), getWeekNumber(new Date(toDate)));
    const diffMs = fromMonday.getTime() - toMonday.getTime();
    if (diffMs < 0) return 'з минулого тижня';
    if (diffMs > 0) return 'з наступного тижня';
    return 'з цього тижня';
  };

  const executeAssign = async (
    userId: number,
    transferMode: 'none' | 'move'
  ) => {
    if (!selectedCell) return;

    const transferFrom =
      transferMode === 'move'
        ? getTransferSourceDate(userId, selectedCell.date)
        : undefined;

    if (transferFrom) {
      await removeAssignment(transferFrom, 'work', userId);
      await applyKarmaForTransfer(userId, transferFrom, selectedCell.date, dayWeights);
      await logAction('TRANSFER', `Перенесено з ${transferFrom} на ${selectedCell.date}`);
    }

    await assignUser(selectedCell.date, userId, true, {
      maxPerDay: dutiesPerDay,
      replaceUserId: selectedCell.assignedUserId,
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

  const handleAssign = async (userId: number | undefined) => {
    if (!userId || !selectedCell) return;

    const isRestDay = isOnRestDay(userId, selectedCell.date);
    const transferFrom = getTransferSourceDate(userId, selectedCell.date);

    if (isRestDay || transferFrom) {
      setPendingAssignConfirm({ userId, transferFrom, isRestDay });
      return;
    }

    await executeAssign(userId, 'none');
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
        scheduledWeeks={scheduledWeeks}
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

      <Modal
        show={!!selectedCell}
        onClose={() => setSelectedCell(null)}
        title={`Наряд на ${selectedCell?.date}`}
      >
        {selectedCell && (
          <div>
            {selectedCell.entry ? (
              <div>
                <div className="alert alert-secondary py-2 mb-3">
                  <strong>{users.find((u) => u.id === selectedCell.assignedUserId)?.name}</strong>
                </div>
                <div className="btn-group w-100 mb-3">
                  <button
                    className={`btn btn-sm ${swapMode === 'replace' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setSwapMode('replace')}
                  >
                    Заміна
                  </button>
                  <button
                    className={`btn btn-sm ${swapMode === 'remove' ? 'btn-danger' : 'btn-outline-danger'}`}
                    onClick={() => setSwapMode('remove')}
                  >
                    Зняти
                  </button>
                </div>
                {swapMode === 'replace' && (
                  <div className="list-group" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {getFreeUsers(selectedCell.date).map((u) => {
                      const dayIdx = new Date(selectedCell.date).getDay();
                      const owes = (u.owedDays && u.owedDays[dayIdx]) || 0;
                      return (
                        <button
                          key={u.id}
                          className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isOnRestDay(u.id!, selectedCell.date) ? 'list-group-item-warning' : ''}`}
                          onClick={() => handleAssign(u.id)}
                        >
                          <div>
                            <span className="fw-bold">{u.name}</span>
                            {owes > 0 && (
                              <span className="badge bg-danger ms-2">борг цього дня: {owes}</span>
                            )}
                            {isOnRestDay(u.id!, selectedCell.date) && (
                              <span className="badge bg-warning text-dark ms-2">відсипний</span>
                            )}
                            <div className="small text-muted">
                              Ефект. навант: {calculateEffectiveLoad(u).toFixed(1)}
                            </div>
                          </div>
                          <span
                            className={
                              u.debt < 0
                                ? 'text-danger'
                                : u.debt > 0
                                  ? 'text-success'
                                  : 'text-muted'
                            }
                          >
                            Карма: {u.debt > 0 ? '+' + u.debt : u.debt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {swapMode === 'remove' && (
                  <div className="d-grid gap-2">
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => handleRemove('request')}
                    >
                      За рапортом (Карма МІНУС)
                    </button>
                    <div className="small text-muted text-center">Боєць буде "винен" системі.</div>
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => handleRemove('work')}
                    >
                      Службова (Карма 0)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="list-group" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {getFreeUsers(selectedCell.date).map((u) => {
                  const dayIdx = new Date(selectedCell.date).getDay();
                  const owes = (u.owedDays && u.owedDays[dayIdx]) || 0;
                  return (
                    <button
                      key={u.id}
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isOnRestDay(u.id!, selectedCell.date) ? 'list-group-item-warning' : ''}`}
                      onClick={() => handleAssign(u.id)}
                    >
                      <div>
                        <span className="fw-bold">{u.name}</span>
                        {owes > 0 && (
                          <span className="badge bg-danger ms-2">борг цього дня: {owes}</span>
                        )}
                        {isOnRestDay(u.id!, selectedCell.date) && (
                          <span className="badge bg-warning text-dark ms-2">відсипний</span>
                        )}
                        <div className="small text-muted">
                          Ефект. навант: {calculateEffectiveLoad(u).toFixed(1)}
                        </div>
                      </div>
                      <span
                        className={
                          u.debt < 0 ? 'text-danger' : u.debt > 0 ? 'text-success' : 'text-muted'
                        }
                      >
                        Карма: {u.debt > 0 ? '+' + u.debt : u.debt}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        show={!!pendingAssignConfirm && !!selectedCell}
        onClose={() => setPendingAssignConfirm(null)}
        title="Підтвердження призначення"
      >
        {pendingAssignConfirm && selectedCell && (
          <div>
            <div className="alert alert-warning py-2">
              Ви виконуєте ручну зміну призначення. Перевірте дію перед підтвердженням.
            </div>

            <div className="mb-3">
              <div>
                <strong>Боєць:</strong>{' '}
                {users.find((u) => u.id === pendingAssignConfirm.userId)?.name || 'Невідомо'}
              </div>
              <div>
                <strong>Нова дата:</strong>{' '}
                {new Date(selectedCell.date).toLocaleDateString('uk-UA')}
                {' · '}
                тиждень #{getWeekNumber(new Date(selectedCell.date))} (тиждень призначення)
              </div>
              {pendingAssignConfirm.transferFrom && (
                <div>
                  <strong>Поточне чергування:</strong>{' '}
                  {new Date(pendingAssignConfirm.transferFrom).toLocaleDateString('uk-UA')}
                  {' · '}
                  тиждень #{getWeekNumber(new Date(pendingAssignConfirm.transferFrom))}{' '}
                  ({getWeekRelationLabel(pendingAssignConfirm.transferFrom, selectedCell.date)})
                </div>
              )}
              {pendingAssignConfirm.isRestDay && (
                <div className="text-warning-emphasis mt-2">
                  Увага: це відсипний день (боєць чергував вчора).
                </div>
              )}
            </div>

            <div className="d-grid gap-2">
              {pendingAssignConfirm.transferFrom && (
                <button
                  className="btn btn-primary"
                  onClick={() => executeAssign(pendingAssignConfirm.userId, 'move')}
                >
                  Перенести старе чергування на нову дату
                </button>
              )}
              <button
                className="btn btn-soft-warning"
                onClick={() => executeAssign(pendingAssignConfirm.userId, 'none')}
              >
                Лишити старе чергування і додати нове
              </button>
              <button className="btn btn-outline-secondary" onClick={() => setPendingAssignConfirm(null)}>
                Скасувати
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleView;
