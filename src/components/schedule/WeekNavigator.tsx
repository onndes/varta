import React, { useState, useMemo } from 'react';
import { getWeekNumber, getMondayOfWeek } from '../../utils/dateUtils';

interface WeekNavigatorProps {
  currentDate: Date;
  activeDate: Date;
  scheduledWeeksMap: Map<number, Set<number>>;
  onJumpToWeek: (weekNumber: number, year?: number) => void;
}

const MONTH_ABBR = [
  'Січ',
  'Лют',
  'Бер',
  'Кві',
  'Тра',
  'Чер',
  'Лип',
  'Сер',
  'Вер',
  'Жов',
  'Лис',
  'Гру',
];

/**
 * Week Navigator Component
 * Displays week squares grouped by month for the year.
 * Supports year switching.
 */
const WeekNavigator: React.FC<WeekNavigatorProps> = ({
  currentDate,
  activeDate,
  scheduledWeeksMap,
  onJumpToWeek,
}) => {
  const [displayYear, setDisplayYear] = useState(activeDate.getFullYear());
  // Dec 28 is always in the last ISO week of the year
  const maxWeeks = getWeekNumber(new Date(displayYear, 11, 28));
  const currentWeek = getWeekNumber(currentDate);
  const activeWeek = getWeekNumber(activeDate);
  const isActiveYear = displayYear === activeDate.getFullYear();
  const isCurrentYear = displayYear === currentDate.getFullYear();
  const yearWeeks = scheduledWeeksMap.get(displayYear);

  // Group week numbers by the month of their Monday
  const monthGroups = useMemo(() => {
    const groups: { month: number; weeks: number[] }[] = [];
    for (let w = 1; w <= maxWeeks; w++) {
      const monday = getMondayOfWeek(displayYear, w);
      const month = monday.getMonth();
      const last = groups[groups.length - 1];
      if (last && last.month === month) {
        last.weeks.push(w);
      } else {
        groups.push({ month, weeks: [w] });
      }
    }
    return groups;
  }, [displayYear, maxWeeks]);

  return (
    <div className="week-nav-container no-print">
      {/* Year switcher */}
      <div className="week-nav-year-row">
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={() => setDisplayYear((y) => y - 1)}
          title={`${displayYear - 1}`}
        >
          <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem' }}></i>
        </button>
        <span
          className={`fw-bold small ${isCurrentYear ? 'text-primary' : 'text-muted'}`}
          style={{ cursor: 'pointer', userSelect: 'none', minWidth: '40px', textAlign: 'center' }}
          onClick={() => setDisplayYear(currentDate.getFullYear())}
          title="Повернутися до поточного року"
        >
          {displayYear}
        </span>
        <button
          className="btn btn-sm btn-link text-muted p-0"
          onClick={() => setDisplayYear((y) => y + 1)}
          title={`${displayYear + 1}`}
        >
          <i className="fas fa-chevron-right" style={{ fontSize: '0.65rem' }}></i>
        </button>
      </div>

      {/* Month columns */}
      <div className="week-nav-months">
        {monthGroups.map(({ month, weeks }) => (
          // key uses first week number — unique even when December appears at both
          // start (ISO weeks 1-n belonging to prev-year Dec) and end of year
          <div key={weeks[0]} className="week-nav-month-col">
            <div className="week-nav-month-label">{MONTH_ABBR[month]}</div>
            {weeks.map((week) => {
              const isPast = isCurrentYear && week < currentWeek;
              const isCurrent = isCurrentYear && week === currentWeek;
              const isSelected = isActiveYear && week === activeWeek;
              const hasSchedule = !!yearWeeks && yearWeeks.has(week) && !isCurrent;
              const monday = getMondayOfWeek(displayYear, week);
              const tooltipDate = monday.toLocaleDateString('uk-UA', {
                day: 'numeric',
                month: 'short',
              });

              return (
                <div
                  key={week}
                  className={[
                    'week-square',
                    isPast ? 'past' : '',
                    isCurrent ? 'current' : '',
                    isSelected ? 'selected' : '',
                    hasSchedule ? 'has-schedule' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onJumpToWeek(week, displayYear)}
                >
                  {week}
                  <div className="week-tooltip">
                    Тиждень {week}
                    <br />
                    {tooltipDate}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeekNavigator;
