import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';

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
          const assignedUsers = entry
            ? toAssignedUserIds(entry.userId)
                .map((id) => users.find((u) => u.id === id))
                .filter((u): u is User => Boolean(u))
            : [];
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
              {assignedUsers.map((user) => (
                <div className="print-cal-slot" key={user.id}>
                  <div style={{ fontSize: '1em' }}>{formatRank(user.rank)}</div>
                  <div>
                    <p className="print-cal-fio">{splitFormattedName(user.name).surname}</p>
                    <p className="print-cal-fio">{splitFormattedName(user.name).firstName}</p>
                    <p className="print-cal-fio">{splitFormattedName(user.name).middleName}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PrintCalendar;
