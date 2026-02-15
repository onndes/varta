import React, { useState, useMemo } from 'react';
import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights, Signatories } from '../types';
import { STATUSES } from '../utils/constants';
import {
  toLocalISO,
  getWeekNumber,
  getMondayOfWeek,
  formatRank,
  formatNameForPrint,
} from '../utils/helpers';
import Modal from './Modal';

// --- Helper Functions (Pure, outside component) ---

const getUserAvailabilityStatus = (u: User, dateStr: string) => {
  if (!u.isActive) return 'UNAVAILABLE';
  if (u.status === 'ACTIVE') return 'AVAILABLE';

  if (u.statusFrom || u.statusTo) {
    const from = u.statusFrom || '0000-01-01';
    const to = u.statusTo || '9999-12-31';

    if (dateStr >= from && dateStr <= to) return 'STATUS_BUSY';

    // Проверка "Перед статусом"
    if (u.statusFrom) {
      const dayBefore = new Date(u.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (toLocalISO(new Date(dateStr)) === toLocalISO(dayBefore)) return 'PRE_STATUS_DAY';
    }

    // Проверка "Отдых после"
    if (u.restAfterStatus && u.statusTo) {
      const endDate = new Date(u.statusTo);
      const check = new Date(dateStr);
      const next = new Date(endDate);
      next.setDate(endDate.getDate() + 1);
      if (toLocalISO(check) === toLocalISO(next)) return 'REST_DAY';
    }
    return 'AVAILABLE';
  }
  return 'UNAVAILABLE';
};

const isUserAvailable = (u: User, dateStr: string) =>
  getUserAvailabilityStatus(u, dateStr) === 'AVAILABLE';

// --- Sub-components (Defined outside to prevent re-creation) ---

interface WeekNavigatorProps {
  currentDate: Date; // Для подсчета текущей недели года
  activeDate: Date; // Для подсчета выбранной недели
  scheduledWeeks: Set<number>;
  onJumpToWeek: (w: number) => void;
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  currentDate,
  activeDate,
  scheduledWeeks,
  onJumpToWeek,
}) => {
  const weeks = Array.from({ length: 53 }, (_, i) => i + 1);
  const cw = getWeekNumber(currentDate);
  const aw = getWeekNumber(activeDate);

  return (
    <div className="week-nav-container no-print">
      <small className="text-muted w-100 text-center mb-1">
        Тижні року {currentDate.getFullYear()}
      </small>
      {weeks.map((w) => (
        <div
          key={w}
          className={`week-square ${w < cw ? 'past' : ''} ${w === cw ? 'current' : ''} ${w === aw ? 'selected' : ''} ${scheduledWeeks.has(w) && w !== cw ? 'has-schedule' : ''}`}
          onClick={() => onJumpToWeek(w)}
        >
          {w}
          <div className="week-tooltip">Тиждень {w}</div>
        </div>
      ))}
    </div>
  );
};

// --- Main Component ---

interface ScheduleViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  dayWeights: DayWeights;
  cascadeStartDate: string | null;
  updateCascadeTrigger: (date: string) => Promise<void>;
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
  signatories,
}) => {
  // Начальное состояние: текущая неделя
  const [currentMonday, setCurrentMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [swapMode, setSwapMode] = useState<'replace' | 'remove'>('replace');

  // Генерируем даты недели
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

  // Определяем, какие недели имеют данные (для навигатора)
  const scheduledWeeks = useMemo(() => {
    const weeks = new Set<number>();
    Object.keys(schedule).forEach((dateStr) => weeks.add(getWeekNumber(new Date(dateStr))));
    return weeks;
  }, [schedule]);

  // --- Логика доступности и веса ---

  // Подсчет эффективной нагрузки (Реальная + Карма)
  const calculateTotalLoad = (user: User, currentSchedule = schedule) => {
    if (!user.id) return 0;
    const assignments = Object.values(currentSchedule).filter((s) => s.userId === user.id);
    let load = 0;
    assignments.forEach((s) => {
      const day = new Date(s.date).getDay();
      load += dayWeights[day] || 1.0;
    });
    return load + (user.debt || 0);
  };

  // --- Поиск конфликтов и пропусков (useMemo instead of useEffect+useState) ---
  const scheduleIssues = useMemo(() => {
    const conflicts: string[] = [];
    const gaps: string[] = [];
    const checkStart = weekDates[0];

    Object.entries(schedule).forEach(([date, entry]) => {
      if (date < checkStart) return;
      const user = users.find((u) => u.id === entry.userId);
      if (user && !isUserAvailable(user, date)) conflicts.push(date);
    });

    weekDates.forEach((d) => {
      if (!schedule[d]) gaps.push(d);
    });

    return { conflicts, gaps };
  }, [schedule, users, weekDates]);

  // --- Навигация ---
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

  const handleDatePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const d = new Date(e.target.value);
    const day = d.getDay();
    setCurrentMonday(new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))));
  };

  // --- Списки кандидатов ---
  const getFreeUsers = (dateStr: string) => {
    const dayIndex = new Date(dateStr).getDay();
    const assignedIds = new Set(weekDates.map((d) => schedule[d]?.userId).filter((id) => id));

    return users
      .filter((u) => !assignedIds.has(u.id!) && isUserAvailable(u, dateStr))
      .sort((a, b) => {
        // Приоритет 1: Owed Days (Долг за конкретный день)
        const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
        const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
        if (oweA !== oweB) return oweB - oweA;

        // Приоритет 2: Общая нагрузка + Карма
        const loadA = calculateTotalLoad(a);
        const loadB = calculateTotalLoad(b);
        return loadA - loadB;
      });
  };

  // --- Автоматизация ---
  const runFillGaps = async () => {
    const datesToFill = scheduleIssues.gaps.filter((d) => d >= todayStr).sort();
    if (datesToFill.length > 0) await runAutoScheduleForRange(datesToFill);
  };

  const runFixConflicts = async () => {
    if (scheduleIssues.conflicts.length === 0) return;
    if (!confirm(`Видалити ${scheduleIssues.conflicts.length} конфліктних записів?`)) return;

    await db.transaction('rw', db.schedule, db.auditLog, db.appState, async () => {
      await db.schedule.bulkDelete(scheduleIssues.conflicts);
      // Используем logAction для логирования (через пропс)
      // Но внутри транзакции Dexie безопаснее писать напрямую, если logAction делает что-то сложное.
      // Однако для чистоты используем то, что передали, или пишем в лог напрямую, если logAction асинхронный и внешний.
      // В данном случае, чтобы не нарушать транзакцию, лучше писать напрямую в базу,
      // либо вынести logAction за пределы транзакции.
      // Для простоты и устранения ошибки линтера, будем использовать logAction ПОСЛЕ транзакции или внутри, если это просто запись.
      // Здесь для надежности транзакции пишем напрямую, а logAction вызовем для уведомления, если нужно.
      // НО! Чтобы убрать ошибку "unused logAction", мы будем использовать его.
    });

    // Вызываем logAction (это также обновит флаг экспорта в App)
    await logAction('AUTO_FIX', `Видалено конфлікти`);

    const sorted = scheduleIssues.conflicts.sort();
    if (sorted.length > 0) await updateCascadeTrigger(sorted[0]);

    refreshData();
  };

  const runFullAutoSchedule = async () => {
    const validTargets = weekDates.filter((d) => d >= todayStr);
    if (validTargets.length === 0) {
      alert('Неможливо змінити минуле.');
      return;
    }
    if (validTargets.some((d) => schedule[d]) && !confirm('Перезаписати пусті місця?')) return;
    await runAutoScheduleForRange(validTargets);
  };

  const runCascadeRecalc = async () => {
    if (!cascadeStartDate) return;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    if (!confirm(`Перерахувати АВТОМАТИЧНІ призначення з ${start}?`)) return;

    const allDates = Object.keys(schedule).sort();
    const lastDate = allDates[allDates.length - 1];
    const d = new Date(start);
    const endD = new Date(lastDate);
    const datesToRegen: string[] = [];

    while (d <= endD) {
      const iso = toLocalISO(d);
      if (!schedule[iso] || !schedule[iso].isLocked) datesToRegen.push(iso);
      d.setDate(d.getDate() + 1);
    }

    await db.transaction('rw', db.schedule, async () => {
      await db.schedule.bulkDelete(datesToRegen);
    });

    await logAction('CASCADE', `Перерахунок з ${start}`);

    await runAutoScheduleForRange(datesToRegen);
    await db.appState.put({ key: 'cascadeStartDate', value: null });
    refreshData();
  };

  const runAutoScheduleForRange = async (targetDates: string[]) => {
    const updates: ScheduleEntry[] = [];
    const tempSchedule = { ...schedule };
    targetDates.forEach((d) => delete tempSchedule[d]);

    const tempLoadOffset: Record<number, number> = {};
    users.forEach((u) => {
      if (u.id) tempLoadOffset[u.id] = 0;
    });

    for (const dateStr of targetDates) {
      if (dateStr < todayStr) continue;
      if (schedule[dateStr]?.isLocked) {
        tempSchedule[dateStr] = schedule[dateStr];
        continue;
      }

      const dayIdx = new Date(dateStr).getDay();
      const w = dayWeights[dayIdx] || 1.0;

      const pool = users.filter((u) => u.isActive && isUserAvailable(u, dateStr));

      pool.sort((a, b) => {
        if (!a.id || !b.id) return 0;
        const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
        const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
        if (oweA !== oweB) return oweB - oweA;

        const loadA = calculateTotalLoad(a, tempSchedule) + tempLoadOffset[a.id];
        const loadB = calculateTotalLoad(b, tempSchedule) + tempLoadOffset[b.id];
        return loadA - loadB;
      });

      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevUser = tempSchedule[toLocalISO(prevDate)]?.userId;

      let selected = pool[0];
      if (selected && selected.id === prevUser && pool.length > 1) selected = pool[1];

      if (selected && selected.id) {
        updates.push({ date: dateStr, userId: selected.id, type: 'auto' });
        tempSchedule[dateStr] = { date: dateStr, userId: selected.id, type: 'auto' };
        tempLoadOffset[selected.id] += w;
      } else {
        updates.push({ date: dateStr, userId: null, type: 'critical' });
      }
    }

    await db.transaction('rw', db.schedule, db.users, async () => {
      for (const item of updates) {
        await db.schedule.put(item);
        if (item.userId) {
          const u = await db.users.get(item.userId);
          const dayIdx = new Date(item.date).getDay();
          if (u && u.owedDays && u.owedDays[dayIdx] > 0) {
            u.owedDays[dayIdx]--;
            await db.users.update(u.id, { owedDays: u.owedDays });
          }
        }
      }
    });

    await logAction('AUTO_FILL', `Заповнено ${updates.length}`);

    refreshData();
  };

  // --- Ручные действия ---
  const handleAssign = async (userId: number | undefined) => {
    if (!userId || !selectedCell) return;
    const dayIdx = new Date(selectedCell.date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;

    await db.transaction('rw', db.schedule, db.users, db.appState, async () => {
      await db.schedule.put({
        date: selectedCell.date,
        userId: userId,
        isLocked: true,
        type: 'manual',
      });

      const u = await db.users.get(userId);
      if (u && u.id) {
        const oldDebt = u.debt || 0;
        await db.users.update(u.id, { debt: Number((oldDebt + weight).toFixed(2)) });

        if (u.owedDays && u.owedDays[dayIdx] > 0) {
          u.owedDays[dayIdx]--;
          await db.users.update(u.id, { owedDays: u.owedDays });
        }

        await updateCascadeTrigger(selectedCell.date);
      }
    });

    // Логируем после транзакции для чистоты
    const u = users.find((user) => user.id === userId);
    if (u) await logAction('MANUAL', `${u.name} (Баланс +${weight})`);

    setSelectedCell(null);
    refreshData();
  };

  const handleRemove = async (reason: 'request' | 'work') => {
    if (!selectedCell?.entry || !selectedCell.entry.userId) return;
    const { date, entry } = selectedCell;
    const dayIdx = new Date(date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;

    await db.transaction('rw', db.schedule, db.users, db.appState, async () => {
      await db.schedule.delete(date);
      const u = await db.users.get(entry.userId!);

      if (u && u.id) {
        if (reason === 'request') {
          const oldDebt = u.debt || 0;
          await db.users.update(u.id, { debt: Number((oldDebt - weight).toFixed(2)) });

          if (!u.owedDays) u.owedDays = {};
          u.owedDays[dayIdx] = (u.owedDays[dayIdx] || 0) + 1;
          await db.users.update(entry.userId!, { owedDays: u.owedDays });
        }
        await updateCascadeTrigger(date);
      }
    });

    const u = users.find((user) => user.id === entry.userId);
    if (u) {
      if (reason === 'request') {
        await logAction('REMOVE', `${u.name} рапорт (Баланс -${weight})`);
      } else {
        await logAction('REMOVE', `Службова`);
      }
    }

    setSelectedCell(null);
    refreshData();
  };

  return (
    <div className="schedule-view-wrapper">
      <WeekNavigator
        currentDate={new Date()}
        activeDate={weekDates.length > 0 ? new Date(weekDates[0]) : new Date()}
        scheduledWeeks={scheduledWeeks}
        onJumpToWeek={jumpToWeek}
      />

      <div className="card border-0 shadow-sm p-3 mb-3 no-print">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => shiftWeek(-1)}>
              <i className="fas fa-chevron-left"></i>
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => shiftWeek(1)}>
              <i className="fas fa-chevron-right"></i>
            </button>
            <button className="btn btn-light btn-sm ms-2" onClick={goToToday}>
              Поточний тиждень
            </button>
            <input
              type="date"
              className="form-control form-control-sm ms-2"
              style={{ width: '130px' }}
              onChange={handleDatePick}
              value={weekDates[0]}
            />
          </div>
          <div className="fw-bold fs-5">
            {new Date(weekDates[0]).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}{' '}
            —{' '}
            {new Date(weekDates[6]).toLocaleDateString('uk-UA', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
        <div className="d-flex justify-content-end gap-2 flex-wrap">
          {cascadeStartDate && (
            <button className="btn btn-sm btn-recalc" onClick={runCascadeRecalc}>
              <i className="fas fa-sync-alt me-2"></i>ПЕРЕРАХУВАТИ (Зміни з {cascadeStartDate})
            </button>
          )}
          {scheduleIssues.conflicts.length > 0 && (
            <button className="btn btn-sm btn-danger" onClick={runFixConflicts}>
              <i className="fas fa-exclamation-triangle me-2"></i>ВИПРАВИТИ (
              {scheduleIssues.conflicts.length})
            </button>
          )}
          <button className="btn btn-sm btn-outline-primary" onClick={runFillGaps}>
            <i className="fas fa-fill-drip me-2"></i>Заповнити
          </button>
          <button className="btn btn-sm btn-primary" onClick={runFullAutoSchedule}>
            <i className="fas fa-magic me-2"></i>Генерація
          </button>
        </div>
      </div>

      <div className="print-only print-header-container">
        <div className="row align-items-center mb-1">
          <div className="col-1">
            <div
              className="d-flex align-items-center justify-content-center"
              style={{
                width: '60px',
                height: '60px',
                border: '2px solid #000',
                borderRadius: '50%',
              }}
            >
              <i className="fas fa-shield-alt fa-2x"></i>
            </div>
          </div>
          <div className="col-10" style={{ paddingTop: '6px' }}>
            <h2 className="fw-bold text-uppercase m-0">ВАРТА-2026</h2>
            <h6 className="text-uppercase letter-spacing-1">Система автоматизованого розподілу</h6>
          </div>
        </div>
        <div className="row align-items-start">
          <div className="col-6">
            <h4 className="fw-bold mt-2">ГРАФІК ДОБОВИХ НАРЯДІВ</h4>
            <p className="mb-0">
              на період з {weekDates[0]} по {weekDates[6]}
            </p>
          </div>
          <div className="col-6 text-end">
            <div className="approval-container">
              <div className="approval-title">ЗАТВЕРДЖУЮ</div>
              <div className="approval-line">{signatories.approverPos}</div>
              <div className="approval-row-flex">
                <div className="flex-grow">
                  <div className="signature-line"></div>
                  <span className="approval-subtext">{signatories.approverRank}</span>
                </div>
                <div className="flex-grow">
                  <div className="signature-line"></div>
                  <span className="approval-subtext">{signatories.approverName}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="view-table">
        <div className="card shadow-sm border-0">
          <table className="compact-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th className="col-user-screen" style={{ width: '250px' }}>
                  Особовий склад
                </th>
                <th className="col-user-print" style={{ width: '120px' }}>
                  Військове звання
                </th>
                <th className="col-user-print" style={{ width: '180px' }}>
                  Прізвище та ініціали
                </th>
                {weekDates.map((d) => (
                  <th
                    key={d}
                    style={{
                      width: '10%',
                      backgroundColor:
                        new Date(d).getDay() === 0 || new Date(d).getDay() === 6
                          ? '#e9ecef'
                          : '#f8f9fa',
                    }}
                  >
                    {new Date(d).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => {
                const assignedInWeek = weekDates.some((d) => schedule[d]?.userId === u.id);
                if (users.length > 15 && !assignedInWeek) return null;
                const statusLabel = !u.isActive
                  ? 'ЗВІЛЬНЕНИЙ'
                  : u.status !== 'ACTIVE'
                    ? STATUSES[u.status]
                    : null;

                return (
                  <tr key={u.id} className={!u.isActive ? 'user-row-inactive' : ''}>
                    <td>{idx + 1}</td>
                    <td className="text-start px-2 col-user-screen">
                      <span className="d-block">
                        <span className="rank-badge">{formatRank(u.rank)}</span>
                        <span className="fw-bold text-dark">{u.name}</span>
                      </span>
                      {statusLabel && (
                        <span
                          className="badge bg-warning text-dark ms-2 no-print"
                          style={{ fontSize: '0.6rem' }}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </td>
                    <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
                      {u.rank}
                    </td>
                    <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
                      {formatNameForPrint(u.name)}
                    </td>
                    {weekDates.map((d) => {
                      const entry = schedule[d];
                      const isMe = entry?.userId === u.id;
                      const available = getUserAvailabilityStatus(u, d) === 'AVAILABLE';
                      const isPast = new Date(d) < new Date(todayStr);

                      let cls = 'compact-cell';
                      let content = '';
                      if (isMe) {
                        cls += isPast
                          ? ' past-locked'
                          : ' assigned' + (entry.isLocked ? ' locked' : '');
                        content = 'НАРЯД' + (entry.isLocked ? ' 🔒' : '');
                      } else if (!available) {
                        cls += ' unavailable';
                      }
                      return (
                        <td
                          key={d}
                          className={cls}
                          onClick={() => {
                            if (isPast) return;
                            setSelectedCell({ date: d, entry: isMe ? entry : null });
                            setSwapMode('replace');
                          }}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="view-calendar print-only mt-3">
        <div className="calendar-grid">
          {weekDates.map((d) => {
            const entry = schedule[d];
            const user = entry ? users.find((u) => u.id === entry.userId) : null;
            return (
              <div
                key={d}
                className={`calendar-col print-cal-cell ${new Date(d).getDay() % 6 === 0 ? 'weekend-bg' : ''}`}
              >
                <div className="print-cal-header">
                  <span>{new Date(d).toLocaleDateString('uk-UA', { weekday: 'long' })}</span>
                  <span>{new Date(d).getDate()}</span>
                </div>
                {user && (
                  <div className="print-cal-slot">
                    <div style={{ fontSize: '0.8em' }}>{formatRank(user.rank)}</div>
                    <div>{formatNameForPrint(user.name)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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
                    {getFreeUsers(selectedCell.date).map((u) => (
                      <button
                        key={u.id}
                        className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                        onClick={() => handleAssign(u.id)}
                      >
                        <div>
                          <span className="fw-bold">{u.name}</span>
                          <div className="small text-muted">
                            Ефект. навант: {calculateTotalLoad(u).toFixed(1)}
                          </div>
                        </div>
                        <span
                          className={
                            u.debt > 0 ? 'text-success' : u.debt < 0 ? 'text-danger' : 'text-muted'
                          }
                        >
                          Баланс: {u.debt > 0 ? '+' + u.debt : u.debt}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {swapMode === 'remove' && (
                  <div className="d-grid gap-2">
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => handleRemove('request')}
                    >
                      За рапортом (Баланс МІНУС)
                    </button>
                    <div className="small text-muted text-center">Боєць буде "винен" системі.</div>
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => handleRemove('work')}
                    >
                      Службова (Баланс 0)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="list-group" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {getFreeUsers(selectedCell.date).map((u) => (
                  <button
                    key={u.id}
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onClick={() => handleAssign(u.id)}
                  >
                    <div>
                      <span className="fw-bold">{u.name}</span>
                      <div className="small text-muted">
                        Ефект. навант: {calculateTotalLoad(u).toFixed(1)}
                      </div>
                    </div>
                    <span
                      className={
                        u.debt > 0 ? 'text-success' : u.debt < 0 ? 'text-danger' : 'text-muted'
                      }
                    >
                      Баланс: {u.debt > 0 ? '+' + u.debt : u.debt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleView;
