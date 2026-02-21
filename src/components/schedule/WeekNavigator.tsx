import React, { useState } from 'react';
import { getWeekNumber } from '../../utils/helpers';

interface WeekNavigatorProps {
  currentDate: Date;
  activeDate: Date;
  scheduledWeeksMap: Map<number, Set<number>>;
  onJumpToWeek: (weekNumber: number, year?: number) => void;
}

/**
 * Week Navigator Component
 * Displays 53 week squares for the year with visual indicators.
 * Supports year switching.
 */
const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  currentDate,
  activeDate,
  scheduledWeeksMap,
  onJumpToWeek,
}) => {
  const [displayYear, setDisplayYear] = useState(activeDate.getFullYear());
  // Dec 28 is always in the last ISO week of the year — its week number = max weeks for that year
  const maxWeeks = getWeekNumber(new Date(displayYear, 11, 28));
  const weeks = Array.from({ length: maxWeeks }, (_, i) => i + 1);
  const currentWeek = getWeekNumber(currentDate);
  const activeWeek = getWeekNumber(activeDate);
  const isActiveYear = displayYear === activeDate.getFullYear();
  const isCurrentYear = displayYear === currentDate.getFullYear();

  return (
    <div className="week-nav-container no-print">
      <div className="w-100 d-flex justify-content-center align-items-center gap-2 mb-1">
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={() => setDisplayYear((y) => y - 1)}
          title={`${displayYear - 1}`}
        >
          <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem' }}></i>
        </button>
        <small
          className={`fw-bold ${isCurrentYear ? 'text-primary' : 'text-muted'}`}
          style={{ cursor: 'pointer', userSelect: 'none', minWidth: '40px', textAlign: 'center' }}
          onClick={() => setDisplayYear(currentDate.getFullYear())}
          title="Повернутися до поточного року"
        >
          {displayYear}
        </small>
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={() => setDisplayYear((y) => y + 1)}
          title={`${displayYear + 1}`}
        >
          <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
        </button>
      </div>
      {weeks.map((week) => {
        const isPast = isCurrentYear && week < currentWeek;
        const isCurrent = isCurrentYear && week === currentWeek;
        const isSelected = isActiveYear && week === activeWeek;
        const yearWeeks = scheduledWeeksMap.get(displayYear);
        const hasSchedule = !!yearWeeks && yearWeeks.has(week) && !isCurrent;

        return (
          <div
            key={week}
            className={`week-square 
              ${isPast ? 'past' : ''} 
              ${isCurrent ? 'current' : ''} 
              ${isSelected ? 'selected' : ''} 
              ${hasSchedule ? 'has-schedule' : ''}`}
            onClick={() => onJumpToWeek(week, displayYear)}
          >
            {week}
            <div className="week-tooltip">Тиждень {week}</div>
          </div>
        );
      })}
    </div>
  );
};

export default WeekNavigator;
