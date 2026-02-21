import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import ScheduleTableRow from './ScheduleTableRow';
import { isAssignedInEntry } from '../../utils/assignment';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
}

/**
 * Schedule Table Component
 * Main weekly schedule table
 */
const ScheduleTable: React.FC<ScheduleTableProps> = ({
  users,
  weekDates,
  schedule,
  todayStr,
  onCellClick,
}) => {
  // Filter users: show only active users; if <=15 active users show all, otherwise only with assignments
  const activeUsers = users.filter((u) => u.isActive);
  const displayUsers = activeUsers.filter((u) => {
    if (activeUsers.length <= 15) return true;
    return weekDates.some((d) => isAssignedInEntry(schedule[d], u.id!));
  });

  return (
    <div className="view-table">
      <div className="card shadow-sm border-0">
        <table className="compact-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th className="col-user-screen" style={{ width: '250px' }}>
                Особовий склад
              </th>
              <th className="col-user-print" style={{ width: '120px' }}>
                Військове звання
              </th>
              <th className="col-user-print" style={{ width: '180px' }}>
                Прізвище та ініціали
              </th>
              {weekDates.map((date) => {
                const d = new Date(date);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayMonth = d.toLocaleDateString('uk-UA', {
                  weekday: 'short',
                  day: 'numeric',
                  month: '2-digit',
                });
                return (
                  <th
                    key={date}
                    style={{
                      width: '10%',
                      backgroundColor: isWeekend ? '#e9ecef' : '#f8f9fa',
                    }}
                  >
                    {dayMonth}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayUsers.map((user, idx) => (
              <ScheduleTableRow
                key={user.id}
                user={user}
                index={idx}
                weekDates={weekDates}
                schedule={schedule}
                todayStr={todayStr}
                onCellClick={onCellClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleTable;
