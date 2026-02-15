import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, formatNameForPrint } from '../../utils/helpers';

interface PrintCalendarProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  users: User[];
}

/**
 * Print Calendar Component
 * Grid layout for calendar-style printing
 */
const PrintCalendar: React.FC<PrintCalendarProps> = ({ weekDates, schedule, users }) => {
  return (
    <div className="view-calendar print-only mt-3">
      <div className="calendar-grid">
        {weekDates.map((date) => {
          const entry = schedule[date];
          const user = entry ? users.find((u) => u.id === entry.userId) : null;
          const d = new Date(date);
          const isWeekend = d.getDay() % 6 === 0;

          return (
            <div
              key={date}
              className={`calendar-col print-cal-cell ${isWeekend ? 'weekend-bg' : ''}`}
            >
              <div className="print-cal-header">
                <span>{d.toLocaleDateString('uk-UA', { weekday: 'long' })}</span>
                <span>{d.getDate()}</span>
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
  );
};

export default PrintCalendar;
