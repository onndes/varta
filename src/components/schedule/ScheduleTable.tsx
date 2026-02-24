import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry } from '../../types';
import ScheduleTableRow from './ScheduleTableRow';
import { toAssignedUserIds } from '../../utils/assignment';
import { compareByRankAndName, sortUsersBy, type SortKey, type SortDir } from '../../utils/helpers';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
  historyMode?: boolean;
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
  historyMode = false,
  onCellClick,
}) => {
  const activeUsers = users.filter((u) => u.isActive);
  const usersById = Object.fromEntries(activeUsers.map((u) => [u.id!, u]));

  // Hooks must be called unconditionally before any early return
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };

  const displayUsers = useMemo(() => {
    if (sortKey) return sortUsersBy(activeUsers, sortKey, sortDir);
    return [...activeUsers].sort(compareByRankAndName);
  }, [activeUsers, sortKey, sortDir]);

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
                        const isHistory = entry?.type === 'history' || entry?.type === 'import';
                        const cellClass =
                          'compact-cell' +
                          (isHistory
                            ? ' history-entry'
                            : isPast && !historyMode
                              ? ' past-locked'
                              : ' assigned' + (entry?.isLocked ? ' locked' : ''));
                        return (
                          <td
                            key={slotIdx}
                            className={cellClass}
                            onClick={() => {
                              if (isPast && !historyMode) return;
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
                              if (isPast && !historyMode) return;
                              onCellClick(date, null, undefined);
                            }}
                          >
                            {(!isPast || historyMode) && (
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
  return (
    <div className="view-table">
      <div className="card shadow-sm border-0">
        <table className="compact-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th className="col-user-screen" style={{ width: '250px', userSelect: 'none' }}>
                <span
                  className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
                  style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                  onClick={() => toggleSort('name')}
                  title="Сортувати за ПІБ"
                >
                  ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </span>
                <span
                  className={`badge ${sortKey === 'rank' ? 'bg-primary' : 'bg-light text-secondary border'} fw-semibold text-dark`}
                  style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                  onClick={() => toggleSort('rank')}
                  title="Сортувати за званням"
                >
                  <i className="fas fa-medal me-1" style={{ fontSize: '0.65rem' }}></i>Звання
                  {sortKey === 'rank' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </span>
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
                  historyMode={historyMode}
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
