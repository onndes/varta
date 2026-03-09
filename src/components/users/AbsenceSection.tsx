import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry, TimelineEvent } from '../../types';
import { isAssignedInEntry } from '../../utils/assignment';
import { getUserStatusPeriods } from '../../utils/userStatus';
import { toLocalISO } from '../../utils/dateUtils';
import { getUserAvailabilityStatus } from '../../services/userService';

type AbsenceKey = 'vacation' | 'trip' | 'sick' | 'absent' | 'request';
type PeriodMode = 'all' | 'year' | 'month';

const ABSENCE_LABELS: Record<AbsenceKey, string> = {
  vacation: 'Відпустка',
  trip: 'Відрядження',
  sick: 'Лікарняний',
  absent: 'Відсутній',
  request: 'За власним бажанням',
};

const MONTH_NAMES = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

interface AbsenceSectionProps {
  user: User;
  schedule: Record<string, ScheduleEntry>;
  auditEvents: TimelineEvent[];
  todayStr: string;
  currentYear: number;
  currentMonth: number;
}

const countOverlapDays = (
  from?: string,
  to?: string,
  periodStart?: Date,
  periodEnd?: Date
): number => {
  if (!periodStart || !periodEnd) return 0;
  const start = from ? new Date(from) : new Date(periodStart);
  const end = to ? new Date(to) : new Date(periodEnd);
  const lo = start < periodStart ? periodStart : start;
  const hi = end > periodEnd ? periodEnd : end;
  if (hi < lo) return 0;
  return Math.floor((hi.getTime() - lo.getTime()) / 86400000) + 1;
};

const AbsenceSection: React.FC<AbsenceSectionProps> = ({
  user,
  schedule,
  auditEvents,
  todayStr,
  currentYear,
  currentMonth,
}) => {
  const userSchedule = useMemo(
    () => Object.values(schedule).filter((s) => isAssignedInEntry(s, user.id!)),
    [schedule, user.id]
  );

  const [periodMode, setPeriodMode] = useState<PeriodMode>('year');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [shownAbsence, setShownAbsence] = useState<Record<AbsenceKey, boolean>>({
    vacation: true,
    trip: true,
    sick: true,
    absent: true,
    request: true,
  });
  const statusPeriods = useMemo(() => getUserStatusPeriods(user), [user]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    statusPeriods.forEach((period) => {
      if (period.from) years.add(new Date(period.from).getFullYear());
      if (period.to) years.add(new Date(period.to).getFullYear());
    });
    userSchedule.forEach((s) => years.add(new Date(s.date).getFullYear()));
    auditEvents
      .filter((e) => e.title === 'Зняття за рапортом')
      .forEach((e) => years.add(new Date(e.date).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [auditEvents, currentYear, statusPeriods, userSchedule]);

  const effectiveYear = availableYears.includes(selectedYear)
    ? selectedYear
    : availableYears[0] || currentYear;

  const periodRange = useMemo(() => {
    if (periodMode === 'all') {
      return { start: new Date('1970-01-01'), end: new Date(todayStr), label: 'За весь час' };
    }
    if (periodMode === 'year') {
      return {
        start: new Date(effectiveYear, 0, 1),
        end: new Date(effectiveYear, 11, 31),
        label: `За ${effectiveYear} рік`,
      };
    }
    return {
      start: new Date(effectiveYear, selectedMonth, 1),
      end: new Date(effectiveYear, selectedMonth + 1, 0),
      label: `За ${MONTH_NAMES[selectedMonth]} ${effectiveYear}`,
    };
  }, [periodMode, selectedMonth, effectiveYear, todayStr]);

  const absenceCounts = useMemo<Record<AbsenceKey, number>>(() => {
    const counts: Record<AbsenceKey, number> = {
      vacation: 0,
      trip: 0,
      sick: 0,
      absent: 0,
      request: 0,
    };

    statusPeriods.forEach((period) => {
      const days = countOverlapDays(period.from, period.to, periodRange.start, periodRange.end);
      if (period.status === 'VACATION') counts.vacation += days;
      if (period.status === 'TRIP') counts.trip += days;
      if (period.status === 'SICK') counts.sick += days;
      if (period.status === 'ABSENT') counts.absent += days;
    });

    counts.request = auditEvents.filter((e) => {
      if (e.title !== 'Зняття за рапортом') return false;
      const d = new Date(e.date);
      return d >= periodRange.start && d <= periodRange.end;
    }).length;

    return counts;
  }, [auditEvents, periodRange.end, periodRange.start, statusPeriods]);

  const visibleAbsenceKeys = useMemo(
    () => (Object.keys(ABSENCE_LABELS) as AbsenceKey[]).filter((k) => shownAbsence[k]),
    [shownAbsence]
  );

  const availableDaysTotal = useMemo(() => {
    const scheduleDates = Object.keys(schedule).sort();
    const earliestScheduleDate = scheduleDates[0] || todayStr;
    const start =
      user.dateAddedToAuto && user.dateAddedToAuto > earliestScheduleDate
        ? user.dateAddedToAuto
        : earliestScheduleDate;

    if (start > todayStr) return 0;

    const totalWindowDays =
      Math.floor((new Date(todayStr).getTime() - new Date(start).getTime()) / 86400000) + 1;

    let statusBlockedDays = 0;
    const cursor = new Date(start);
    const end = new Date(todayStr);
    while (cursor <= end) {
      const iso = toLocalISO(cursor);
      if (getUserAvailabilityStatus(user, iso) !== 'AVAILABLE') {
        statusBlockedDays++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return Math.max(0, totalWindowDays - statusBlockedDays);
  }, [schedule, todayStr, user]);

  return (
    <div className="card border-0 bg-light mb-3">
      <div className="card-body py-2">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <div className="fw-bold">Відсутність і рапорти</div>
          <div className="small text-muted">{periodRange.label}</div>
        </div>

        <div className="d-flex flex-wrap gap-2 mb-2">
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${periodMode === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPeriodMode('all')}
            >
              Всього
            </button>
            <button
              type="button"
              className={`btn ${periodMode === 'year' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPeriodMode('year')}
            >
              Рік
            </button>
            <button
              type="button"
              className={`btn ${periodMode === 'month' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setPeriodMode('month')}
            >
              Місяць
            </button>
          </div>

          {periodMode !== 'all' && (
            <select
              className="form-select form-select-sm"
              style={{ width: '110px' }}
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          )}

          {periodMode === 'month' && (
            <select
              className="form-select form-select-sm"
              style={{ width: '140px' }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((month, idx) => (
                <option key={month} value={idx}>
                  {month}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="d-flex flex-wrap gap-2 mb-2">
          {(Object.keys(ABSENCE_LABELS) as AbsenceKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${
                shownAbsence[key] ? 'btn-primary' : 'btn-outline-secondary'
              }`}
              onClick={() =>
                setShownAbsence((prev) => ({
                  ...prev,
                  [key]: !prev[key],
                }))
              }
            >
              {ABSENCE_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="small text-muted mb-2">
          Показано тільки вибрані категорії. Для відсутностей враховуються дні, для рапортів -
          кількість випадків.
        </div>
        <div className="small mb-2">
          <strong>Доступних днів для чергування:</strong> {availableDaysTotal}
        </div>
        <div className="d-flex justify-content-center">
          <table
            className="table table-sm mb-0 text-center"
            style={{ width: 'auto', minWidth: '280px' }}
          >
            <thead>
              <tr>
                <th className="text-center">Категорія</th>
                <th className="text-center">Кількість</th>
              </tr>
            </thead>
            <tbody>
              {visibleAbsenceKeys.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center text-muted">
                    Оберіть хоча б одну категорію
                  </td>
                </tr>
              ) : (
                visibleAbsenceKeys.map((key) => (
                  <tr key={key}>
                    <td>{ABSENCE_LABELS[key]}</td>
                    <td className="fw-bold">{absenceCounts[key]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AbsenceSection;
