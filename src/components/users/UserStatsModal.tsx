import React, { useEffect, useMemo, useState } from 'react';
import type { User, ScheduleEntry, DayWeights, TimelineEvent } from '../../types';
import { DAY_NAMES_FULL } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';
import { toLocalISO } from '../../utils/dateUtils';
import { getPoolCommonFrom, getUserFairnessFrom } from '../../utils/fairness';
import {
  calculateUserLoad,
  countUserAssignments,
  countUserDaysOfWeek,
} from '../../services/scheduleService';
import { getUserAvailabilityStatus, isUserAvailable } from '../../services/userService';
import * as auditService from '../../services/auditService';
import Modal from '../Modal';
import { isAssignedInEntry } from '../../utils/assignment';
import { getLogicSchedule } from '../../utils/assignment';
import AbsenceSection from './AbsenceSection';
import TimelineSection from './TimelineSection';

interface UserStatsModalProps {
  user: User;
  users?: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  ignoreHistoryInLogic?: boolean;
  onClose: () => void;
}

const UserStatsModal: React.FC<UserStatsModalProps> = ({
  user,
  users = [],
  schedule,
  dayWeights,
  ignoreHistoryInLogic = false,
  onClose,
}) => {
  const [auditEvents, setAuditEvents] = useState<TimelineEvent[]>([]);
  const todayStr = useMemo(() => toLocalISO(new Date()), []);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const currentMonth = useMemo(() => new Date().getMonth(), []);
  const logicSchedule = useMemo(
    () => getLogicSchedule(schedule, ignoreHistoryInLogic),
    [schedule, ignoreHistoryInLogic]
  );

  const userSchedule = useMemo(
    () => Object.values(logicSchedule).filter((s) => isAssignedInEntry(s, user.id!)),
    [logicSchedule, user.id]
  );
  const totalAssignments = userSchedule.length;

  const dates = userSchedule.map((s) => s.date).sort();
  const firstDuty = dates.length > 0 ? new Date(dates[0]).toLocaleDateString('uk-UA') : 'Немає';

  const daysCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalLoad = 0;

  userSchedule.forEach((s) => {
    const d = new Date(s.date).getDay();
    daysCount[d]++;
    totalLoad += dayWeights[d] || 1.0;
  });

  const owedDays = user.owedDays || {};
  const hasOwedDays = Object.values(owedDays).some((v) => v > 0);

  const statusEvents = useMemo(() => {
    const events: TimelineEvent[] = [];
    if (user.status !== 'ACTIVE' && (user.statusFrom || user.statusTo)) {
      if (user.statusFrom) {
        events.push({
          date: user.statusFrom,
          title: 'Початок службової відсутності',
          details: `Статус: ${user.status}`,
          tone: 'warning',
        });
      }
      if (user.statusTo) {
        events.push({
          date: user.statusTo,
          title: 'Завершення службової відсутності',
          details: `Статус: ${user.status}`,
          tone: 'success',
        });
      }
    }
    return events;
  }, [user.status, user.statusFrom, user.statusTo]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const logs = await auditService.getRecentLogs(2000);
      const nameNeedle = user.name.toLowerCase();
      const filtered = logs.filter((l) => l.details.toLowerCase().includes(nameNeedle));

      const mapped: TimelineEvent[] = filtered.map((l) => {
        const date = toLocalISO(new Date(l.timestamp));
        if (l.action === 'REMOVE' && l.details.includes('рапорт')) {
          return { date, title: 'Зняття за рапортом', details: l.details, tone: 'danger' };
        }
        if (l.action === 'REMOVE') {
          return { date, title: 'Службове зняття', details: l.details, tone: 'warning' };
        }
        if (l.action === 'MANUAL') {
          return { date, title: 'Ручне призначення', details: l.details, tone: 'primary' };
        }
        if (l.action === 'ASSIGN') {
          return { date, title: 'Призначення', details: l.details, tone: 'primary' };
        }
        if (l.action === 'AUTO_FILL' || l.action === 'AUTO_FIX' || l.action === 'AUTO_SCHEDULE') {
          return { date, title: 'Автоперерахунок', details: l.details, tone: 'secondary' };
        }
        return { date, title: l.action, details: l.details, tone: 'secondary' };
      });

      if (!cancelled) setAuditEvents(mapped);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user.name]);

  const dutyEvents = useMemo<TimelineEvent[]>(
    () =>
      userSchedule.map((s) => {
        const typeLabel: Record<string, string> = {
          manual: 'Ручне чергування',
          auto: 'Авто чергування',
          replace: 'Заміна',
          swap: 'Обмін',
          critical: 'Критичний день',
        };
        const toneMap: Record<string, TimelineEvent['tone']> = {
          manual: 'primary',
          auto: 'success',
          replace: 'warning',
          swap: 'warning',
          critical: 'danger',
        };
        return {
          date: s.date,
          title: typeLabel[s.type] || s.type,
          details: `Запис у графіку (${s.type})`,
          tone: toneMap[s.type] || 'secondary',
        };
      }),
    [userSchedule]
  );

  const timeline = useMemo(() => {
    return [...dutyEvents, ...statusEvents, ...auditEvents]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 120);
  }, [dutyEvents, statusEvents, auditEvents]);

  const queueInsight = useMemo(() => {
    const dayIdx = new Date(todayStr).getDay();
    const availability = getUserAvailabilityStatus(user, todayStr);
    const fairnessFrom = getUserFairnessFrom(user, todayStr);
    const oweToday = (user.owedDays && user.owedDays[dayIdx]) || 0;

    const autoPool = users.filter(
      (u) =>
        u.isActive && !u.isExtra && !u.excludeFromAuto && isUserAvailable(u, todayStr, schedule)
    );
    const poolCommonFrom = getPoolCommonFrom(autoPool, todayStr);

    const dowToday = user.id
      ? countUserDaysOfWeek(user.id, schedule, poolCommonFrom)[dayIdx] || 0
      : 0;
    const totalInPoolWindow = user.id ? countUserAssignments(user.id, schedule, poolCommonFrom) : 0;
    const loadInPoolWindow = user.id
      ? calculateUserLoad(user.id, schedule, dayWeights, poolCommonFrom)
      : 0;

    return {
      availability,
      fairnessFrom,
      oweToday,
      poolCommonFrom,
      dowToday,
      totalInPoolWindow,
      loadInPoolWindow,
      effectiveInPoolWindow: loadInPoolWindow + (user.debt || 0),
    };
  }, [dayWeights, schedule, todayStr, user, users]);

  return (
    <Modal
      show={true}
      onClose={onClose}
      title={`${formatRank(user.rank)} ${user.name}`}
      size="modal-lg"
    >
      <div className="alert alert-secondary mb-3">
        <strong>Перше чергування:</strong> {firstDuty}
      </div>
      <div className="alert alert-info py-2 mb-3">
        <div className="fw-bold mb-1">Чому може не ставити зараз</div>
        <div className="small">
          {queueInsight.availability !== 'AVAILABLE' ? (
            <span>
              Зараз недоступний за статусом ({queueInsight.availability}), тому не бере участь в
              автопризначенні на сьогодні ({todayStr}).
            </span>
          ) : (
            <span>
              У черзі враховується період з {queueInsight.poolCommonFrom || 'початку даних'}.
              Сьогоднішній день тижня: {DAY_NAMES_FULL[new Date(todayStr).getDay()]}. Для цього дня:
              борг={queueInsight.oweToday}, у цьому дні вже відпрацьовано={queueInsight.dowToday},
              всього в поточному періоді={queueInsight.totalInPoolWindow}, рейтинг=
              {queueInsight.effectiveInPoolWindow.toFixed(1)}.
            </span>
          )}
        </div>
        {queueInsight.fairnessFrom && (
          <div className="small mt-1 text-muted">
            Персональна дата чесного обліку: {queueInsight.fairnessFrom}
          </div>
        )}
      </div>
      <AbsenceSection
        user={user}
        schedule={schedule}
        auditEvents={auditEvents}
        todayStr={todayStr}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
      <div className="row mb-3">
        <div className="col-4">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalAssignments}</h3>
              <small className="text-muted">Всього чергувань</small>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalLoad.toFixed(1)}</h3>
              <small className="text-muted">Навантаження</small>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className={`card ${user.debt < 0 ? 'bg-danger bg-opacity-10' : 'bg-light'}`}>
            <div className="card-body text-center">
              <h3
                className={`fw-bold mb-0 ${user.debt < 0 ? 'text-danger' : user.debt > 0 ? 'text-success' : ''}`}
              >
                {user.debt > 0 ? '+' : ''}
                {user.debt.toFixed(1)}
              </h3>
              <small className="text-muted">Карма</small>
            </div>
          </div>
        </div>
      </div>

      {hasOwedDays && (
        <div className="alert alert-warning py-2 mb-3">
          <i className="fas fa-exclamation-triangle me-2"></i>
          <strong>Повинен відробити:</strong>{' '}
          {Object.entries(owedDays)
            .filter(([, v]) => v > 0)
            .map(([day, count]) => `${DAY_NAMES_FULL[parseInt(day)]} (${count})`)
            .join(', ')}
        </div>
      )}

      <table className="table table-sm table-bordered table-align-center">
        <thead className="table-light">
          <tr>
            <th>День тижня</th>
            <th className="text-end">Відпрацьовано</th>
            <th className="text-end">Борг</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
            const dayNum = parseInt(dayKey, 10);
            const owed = owedDays[dayNum] || 0;
            return (
              <tr key={dayNum} className={owed > 0 ? 'table-warning' : ''}>
                <td>{DAY_NAMES_FULL[dayNum]}</td>
                <td className="text-end">{daysCount[dayNum] || 0}</td>
                <td className="text-end">
                  {owed > 0 ? <span className="text-danger fw-bold">{owed}</span> : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <TimelineSection timeline={timeline} />
    </Modal>
  );
};

export default UserStatsModal;
