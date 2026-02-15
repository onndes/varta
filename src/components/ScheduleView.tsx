import React, { useState, useMemo, useCallback } from 'react';
import type { User, ScheduleEntry, DayWeights, Signatories } from '../types';
import { toLocalISO, getMondayOfWeek, getWeekNumber } from '../utils/helpers';
import { countUserDaysOfWeek, countUserAssignments } from '../services/scheduleService';
import { useSchedule, useAutoScheduler } from '../hooks';
import Modal from './Modal';
import WeekNavigator from './schedule/WeekNavigator';
import ScheduleControls from './schedule/ScheduleControls';
import PrintHeader from './schedule/PrintHeader';
import ScheduleTable from './schedule/ScheduleTable';
import PrintCalendar from './schedule/PrintCalendar';
import { isUserAvailable } from './schedule/availability.utils';

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
}

interface SelectedCell {
  date: string;
  entry: ScheduleEntry | null;
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
  signatories: _signatories, // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const { assignUser, removeAssignment, bulkDelete, calculateEffectiveLoad } = useSchedule(users);
  const { fillGaps, recalculateFrom } = useAutoScheduler(users, schedule, dayWeights);

  const [currentMonday, setCurrentMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [swapMode, setSwapMode] = useState<'replace' | 'remove'>('replace');

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
    const checkStart = weekDates[0];

    Object.entries(schedule).forEach(([date, entry]) => {
      if (date < checkStart) return;
      const user = users.find((u) => u.id === entry.userId);
      if (user && !isUserAvailable(user, date)) {
        conflicts.push(date);
        // Critical: user is blocked by vacation/sick leave
        if (user.status === 'VACATION' || user.status === 'SICK' || user.status === 'TRIP') {
          if (user.statusFrom && user.statusTo && date >= user.statusFrom && date <= user.statusTo) {
            criticalConflicts.push(date);
          }
        }
      }
    });

    weekDates.forEach((d) => {
      if (!schedule[d]) gaps.push(d);
    });

    return { conflicts, criticalConflicts, gaps };
  }, [schedule, users, weekDates]);

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

  const getFreeUsers = useCallback((dateStr: string) => {
    const dayIndex = new Date(dateStr).getDay();
    const assignedIds = new Set(weekDates.map((d) => schedule[d]?.userId).filter((id) => id));

    return users
      .filter((u) => !assignedIds.has(u.id!) && isUserAvailable(u, dateStr))
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
  }, [weekDates, schedule, users, calculateEffectiveLoad]);

  // Check if cascade recalc could improve assignments (after getFreeUsers defined)
  const shouldShowCascadeRecalc = useMemo(() => {
    if (!cascadeStartDate) return false;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    
    // Check if there are unlocked entries that could be improved
    return Object.entries(schedule).some(([date, entry]) => {
      if (date < start || entry.type === 'manual') return false;
      
      const currentUser = users.find(u => u.id === entry.userId);
      if (!currentUser) return false;
      
      // Get other available candidates
      const freeUsers = getFreeUsers(date).filter(u => u.id !== currentUser.id);
      if (freeUsers.length === 0) return false;
      
      // Check if any candidate has better priority
      const currentLoad = calculateEffectiveLoad(currentUser);
      return freeUsers.some(u => calculateEffectiveLoad(u) < currentLoad - 0.5);
    });
  }, [cascadeStartDate, schedule, todayStr, users, getFreeUsers, calculateEffectiveLoad]);

  const runFillGaps = async () => {
    const datesToFill = scheduleIssues.gaps.filter((d) => d >= todayStr).sort();
    if (datesToFill.length === 0) return;

    await fillGaps(datesToFill);
    await logAction('AUTO_FILL', `Заповнено ${datesToFill.length} днів`);
    await refreshData();
  };

  const runFixConflicts = async () => {
    if (scheduleIssues.conflicts.length === 0) return;
    
    const isCritical = scheduleIssues.criticalConflicts.length > 0;
    const message = isCritical 
      ? `Замінити ${scheduleIssues.criticalConflicts.length} блокованих працівників?`
      : `Видалити ${scheduleIssues.conflicts.length} конфліктних записів і заповнити?`;
    
    if (!confirm(message)) return;

    // Remove conflicts
    await bulkDelete(scheduleIssues.conflicts);
    
    // Immediately fill the gaps with available users
    await fillGaps(scheduleIssues.conflicts);
    
    await logAction('AUTO_FIX', `Замінено ${scheduleIssues.conflicts.length} конфліктів`);
    await refreshData();
  };

  const runFullAutoSchedule = async () => {
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
    return prevEntry?.userId === userId;
  };

  const handleAssign = async (userId: number | undefined) => {
    if (!userId || !selectedCell) return;

    if (isOnRestDay(userId, selectedCell.date)) {
      if (!confirm('⚠️ Цей боєць вчора був на чергуванні (відсипний день). Все одно призначити?')) {
        return;
      }
    }

    await assignUser(selectedCell.date, userId, true);
    await updateCascadeTrigger(selectedCell.date);

    const u = users.find((user) => user.id === userId);
    const dayIdx = new Date(selectedCell.date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;
    if (u) await logAction('MANUAL', `${u.name} (Карма +${weight})`);

    setSelectedCell(null);
    await refreshData();
  };

  const handleRemove = async (reason: 'request' | 'work') => {
    if (!selectedCell?.entry || !selectedCell.entry.userId) return;
    const { date, entry } = selectedCell;
    const dayIdx = new Date(date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;

    await removeAssignment(date, reason);
    await updateCascadeTrigger(date);

    const u = users.find((user) => user.id === entry.userId);
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

      <PrintHeader />

      <ScheduleTable
        users={users}
        weekDates={weekDates}
        schedule={schedule}
        todayStr={todayStr}
        onCellClick={(date, entry) => {
          setSelectedCell({ date, entry });
          setSwapMode('replace');
        }}
      />

      <PrintCalendar weekDates={weekDates} schedule={schedule} users={users} />

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
                  <strong>{users.find((u) => u.id === selectedCell.entry!.userId)?.name}</strong>
                </div>
                <div className="btn-group w-100 mb-3">
                  <button className={`btn btn-sm ${swapMode === 'replace' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setSwapMode('replace')}>Заміна</button>
                  <button className={`btn btn-sm ${swapMode === 'remove' ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => setSwapMode('remove')}>Зняти</button>
                </div>
                {swapMode === 'replace' && (
                  <div className="list-group" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {getFreeUsers(selectedCell.date).map((u) => {
                      const dayIdx = new Date(selectedCell.date).getDay();
                      const owes = (u.owedDays && u.owedDays[dayIdx]) || 0;
                      return (
                        <button key={u.id} className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isOnRestDay(u.id!, selectedCell.date) ? 'list-group-item-warning' : ''}`} onClick={() => handleAssign(u.id)}>
                          <div>
                            <span className="fw-bold">{u.name}</span>
                            {owes > 0 && <span className="badge bg-danger ms-2">борг цього дня: {owes}</span>}
                            {isOnRestDay(u.id!, selectedCell.date) && <span className="badge bg-warning text-dark ms-2">відсипний</span>}
                            <div className="small text-muted">Ефект. навант: {calculateEffectiveLoad(u).toFixed(1)}</div>
                          </div>
                          <span className={u.debt < 0 ? 'text-danger' : u.debt > 0 ? 'text-success' : 'text-muted'}>Карма: {u.debt > 0 ? '+' + u.debt : u.debt}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {swapMode === 'remove' && (
                  <div className="d-grid gap-2">
                    <button className="btn btn-outline-danger" onClick={() => handleRemove('request')}>За рапортом (Карма МІНУС)</button>
                    <div className="small text-muted text-center">Боєць буде "винен" системі.</div>
                    <button className="btn btn-outline-secondary" onClick={() => handleRemove('work')}>Службова (Карма 0)</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="list-group" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {getFreeUsers(selectedCell.date).map((u) => {
                  const dayIdx = new Date(selectedCell.date).getDay();
                  const owes = (u.owedDays && u.owedDays[dayIdx]) || 0;
                  return (
                    <button key={u.id} className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isOnRestDay(u.id!, selectedCell.date) ? 'list-group-item-warning' : ''}`} onClick={() => handleAssign(u.id)}>
                      <div>
                        <span className="fw-bold">{u.name}</span>
                        {owes > 0 && <span className="badge bg-danger ms-2">борг цього дня: {owes}</span>}
                        {isOnRestDay(u.id!, selectedCell.date) && <span className="badge bg-warning text-dark ms-2">відсипний</span>}
                        <div className="small text-muted">Ефект. навант: {calculateEffectiveLoad(u).toFixed(1)}</div>
                      </div>
                      <span className={u.debt < 0 ? 'text-danger' : u.debt > 0 ? 'text-success' : 'text-muted'}>Карма: {u.debt > 0 ? '+' + u.debt : u.debt}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleView;
