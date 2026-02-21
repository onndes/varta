import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import ScheduleTableRow from './ScheduleTableRow';
import { toAssignedUserIds } from '../../utils/assignment';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
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
  dutiesPerDay,
  onCellClick,
}) => {
  const activeUsers = users.filter((u) => u.isActive);
  const usersById = Object.fromEntries(activeUsers.map((u) => [u.id!, u]));

  // ── Day-centric compact view for large teams (> 20) ──────────────────
  if (activeUsers.length > 20) {
    const slotsPerDay = Math.max(dutiesPerDay, 1);
    return (
      <div className="view-table">
        <div className="card shadow-sm border-0">
          <table className="compact-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Дата</th>
                {Array.from({ length: slotsPerDay }, (_, i) => (
                  <th key={i}>Черг. {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDates.map((date) => {
                const entry = schedule[date];
                const assignedIds = toAssignedUserIds(entry?.userId);
                const isPast = date < todayStr;
                const d = new Date(date);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayLabel = d.toLocaleDateString('uk-UA', {
                  weekday: 'short',
                  day: 'numeric',
                  month: '2-digit',
                });
                // Build slot cells: filled + empty up to slotsPerDay
                const slots: (number | null)[] = [
                  ...assignedIds,
                  ...Array(Math.max(0, slotsPerDay - assignedIds.length)).fill(null),
                ];
                return (
                  <tr key={date}>
                    <td
                      className="text-start fw-bold"
                      style={{
                        fontSize: '0.82rem',
                        background: isWeekend ? '#e9ecef' : '#f8f9fa',
                      }}
                    >
                      {dayLabel}
                    </td>
                    {slots.map((uid, slotIdx) => {
                      const user = uid != null ? usersById[uid] : null;
                      if (uid != null && user) {
                        // Assigned slot
                        const cellClass =
                          'compact-cell' +
                          (isPast
                            ? ' past-locked'
                            : ' assigned' + (entry?.isLocked ? ' locked' : ''));
                        return (
                          <td
                            key={slotIdx}
                            className={cellClass}
                            onClick={() => {
                              if (isPast) return;
                              onCellClick(date, entry, uid);
                            }}
                          >
                            <span className="no-print" style={{ fontSize: '0.78rem' }}>
                              {user.name}
                            </span>
                          </td>
                        );
                      } else {
                        // Empty slot
                        return (
                          <td
                            key={slotIdx}
                            className="compact-cell"
                            style={{ color: '#adb5bd' }}
                            onClick={() => {
                              if (isPast) return;
                              onCellClick(date, null, undefined);
                            }}
                          >
                            {!isPast && (
                              <span
                                className="no-print"
                                style={{ fontSize: '1rem', lineHeight: 1 }}
                              >
                                +
                              </span>
                            )}
                          </td>
                        );
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Standard user-row view for small teams (≤ 20) ────────────────────
  const displayUsers = activeUsers;

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
            {displayUsers.length === 0 ? (
              <tr>
                <td colSpan={2 + weekDates.length} className="text-center text-muted py-4 no-print">
                  <i className="fas fa-users me-2"></i>Немає бійців у складі
                </td>
              </tr>
            ) : (
              displayUsers.map((user, idx) => (
                <ScheduleTableRow
                  key={user.id}
                  user={user}
                  index={idx}
                  weekDates={weekDates}
                  schedule={schedule}
                  todayStr={todayStr}
                  onCellClick={onCellClick}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleTable;
