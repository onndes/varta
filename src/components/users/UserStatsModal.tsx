import React, { useEffect, useMemo, useState } from 'react';
import type { User, ScheduleEntry, DayWeights, TimelineEvent } from '../../types';
import { DAY_NAMES_FULL, STATUSES } from '../../utils/constants';
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
import { getUserStatusPeriods } from '../../utils/userStatus';
import AbsenceSection from './AbsenceSection';
import TimelineSection from './TimelineSection';
import UserStatsTables from './UserStatsTables';

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
  const statusPeriods = useMemo(() => getUserStatusPeriods(user), [user]);
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
    statusPeriods.forEach((period) => {
      if (period.from) {
        events.push({
          date: period.from,
          title: 'Початок службової відсутності',
          details: `Статус: ${STATUSES[period.status] || period.status}`,
          tone: 'warning',
        });
      }
      if (period.to) {
        events.push({
          date: period.to,
          title: 'Завершення службової відсутності',
          details: `Статус: ${STATUSES[period.status] || period.status}`,
          tone: 'success',
        });
      }
    });
    return events;
  }, [statusPeriods]);

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
      <UserStatsTables
        totalAssignments={totalAssignments}
        totalLoad={totalLoad}
        debt={user.debt}
        owedDays={owedDays}
        daysCount={daysCount}
      />

      <TimelineSection timeline={timeline} />
    </Modal>
  );
};

export default UserStatsModal;
