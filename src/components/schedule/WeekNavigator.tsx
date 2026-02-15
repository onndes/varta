import React from 'react';
import { getWeekNumber } from '../../utils/helpers';

interface WeekNavigatorProps {
  currentDate: Date;
  activeDate: Date;
  scheduledWeeks: Set<number>;
  onJumpToWeek: (weekNumber: number) => void;
}

/**
 * Week Navigator Component
 * Displays 53 week squares for the year with visual indicators
 */
const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  currentDate,
  activeDate,
  scheduledWeeks,
  onJumpToWeek,
}) => {
  const weeks = Array.from({ length: 53 }, (_, i) => i + 1);
  const currentWeek = getWeekNumber(currentDate);
  const activeWeek = getWeekNumber(activeDate);

  return (
    <div className="week-nav-container no-print">
      <small className="text-muted w-100 text-center mb-1">
        Тижні року {currentDate.getFullYear()}
      </small>
      {weeks.map((week) => {
        const isPast = week < currentWeek;
        const isCurrent = week === currentWeek;
        const isSelected = week === activeWeek;
        const hasSchedule = scheduledWeeks.has(week) && !isCurrent;

        return (
          <div
            key={week}
            className={`week-square 
              ${isPast ? 'past' : ''} 
              ${isCurrent ? 'current' : ''} 
              ${isSelected ? 'selected' : ''} 
              ${hasSchedule ? 'has-schedule' : ''}`}
            onClick={() => onJumpToWeek(week)}
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
