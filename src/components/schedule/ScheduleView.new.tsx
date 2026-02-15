import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights, Signatories } from '../../types';
import { STATUSES } from '../../utils/constants';
import {
  toLocalISO,
  getWeekNumber,
  getMondayOfWeek,
  formatRank,
  formatNameForPrint,
} from '../../utils/helpers';
import { useSchedule, useAutoScheduler } from '../../hooks';
import Modal from '../Modal';
import WeekNavigator from './WeekNavigator';

// Helper functions
const getUserAvailabilityStatus = (u: User, dateStr: string) => {
  if (!u.isActive) return 'UNAVAILABLE';
  if (u.status === 'ACTIVE') return 'AVAILABLE';

  if (u.statusFrom || u.statusTo) {
    const from = u.statusFrom || '0000-01-01';
    const to = u.statusTo || '9999-12-31';

    if (dateStr >= from && dateStr <= to) return 'STATUS_BUSY';

    if (u.statusFrom) {
      const dayBefore = new Date(u.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (toLocalISO(new Date(dateStr)) === toLocalISO(dayBefore)) return 'PRE_STATUS_DAY';
    }

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

const ScheduleView: React.FC<ScheduleViewProps> = (props) => {
  // Destructure props
  const {
    users,
    schedule,
    refreshData,
    logAction,
    dayWeights,
    cascadeStartDate,
    updateCascadeTrigger,
    signatories,
  } = props;

  // Use hooks
  const { assignUser, removeAssignment, bulkDelete, calculateEffectiveLoad } =
    useSchedule(users);
  const { fillGaps, recalculateFrom } = useAutoScheduler(users, schedule, dayWeights);

  // State
  const [currentMonday, setCurrentMonday] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const [selectedCell, setSelectedCell] = useState<{ date: string; entry: ScheduleEntry | null } | null>(null);

  // Calculate week dates
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

  // Find scheduled weeks
  const scheduledWeeks = useMemo(() => {
    const weeks = new Set<number>();
    Object.keys(schedule).forEach((dateStr) => weeks.add(getWeekNumber(new Date(dateStr))));
    return weeks;
  }, [schedule]);

  // Navigation
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

  // Render simplified version
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
          </div>
          <div className="fw-bold fs-5">
            {new Date(weekDates[0]).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} —{' '}
            {new Date(weekDates[6]).toLocaleDateString('uk-UA', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </div>
      </div>

      {/* TODO: Add calendar and controls */}
      <div className="alert alert-info">
        <strong>Компонент в процесі рефакторингу...</strong>
        <br />
        WeekNavigator винесений ✅
        <br />
        Календар і контроли будуть додані далі...
      </div>
    </div>
  );
};

export default ScheduleView;
