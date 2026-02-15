import React from 'react';
import { getWeekNumber } from '../../utils/helpers';

interface WeekNavigatorProps {
  currentDate: Date;
  activeDate: Date;
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
  const currentWeek = getWeekNumber(currentDate);
  const activeWeek = getWeekNumber(activeDate);

  return (
    <div className="week-nav-container no-print">
      <small className="text-muted w-100 text-center mb-1">
        Тижні року {currentDate.getFullYear()}
      </small>
      {weeks.map((w) => (
        <div
          key={w}
          className={`week-square ${w < currentWeek ? 'past' : ''} ${w === currentWeek ? 'current' : ''} ${w === activeWeek ? 'selected' : ''} ${scheduledWeeks.has(w) && w !== currentWeek ? 'has-schedule' : ''}`}
          onClick={() => onJumpToWeek(w)}
        >
          {w}
          <div className="week-tooltip">Тиждень {w}</div>
        </div>
      ))}
    </div>
  );
};

export default WeekNavigator;
