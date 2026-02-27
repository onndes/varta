import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry } from '../../types';
import type { DeletedUserInfo } from '../../services/userService';
import ScheduleTableRow from './ScheduleTableRow';
import { toAssignedUserIds } from '../../utils/assignment';
import {
  compareByRankAndName,
  sortUsersBy,
  formatRank,
  type SortKey,
  type SortDir,
} from '../../utils/helpers';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
  historyMode?: boolean;
  deletedUserNames?: Record<number, DeletedUserInfo>;
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
  deletedUserNames = {},
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
                        background: isWeekend
                          ? 'var(--app-table-weekend-bg, #e9ecef)'
                          : 'var(--app-table-header-bg, #f8f9fa)',
                        color: 'var(--bs-body-color)',
                      }}
                    >
                      {dayLabel}
                    </td>
                    {slots.map((uid, slotIdx) => {
                      const user = uid != null ? usersById[uid] : null;
                      const deletedInfo = uid != null && !user ? deletedUserNames[uid] : null;
                      if (uid != null && (user || deletedInfo)) {
                        // Assigned slot (active or deleted user)
                        const isHistory = entry?.type === 'history' || entry?.type === 'import';
                        const isDeleted = !user && !!deletedInfo;
                        const cellClass =
                          'compact-cell' +
                          (isDeleted
                            ? ' past-locked'
                            : isHistory
                              ? ' history-entry'
                              : isPast && !historyMode
                                ? ' past-locked'
                                : ' assigned' + (entry?.isLocked ? ' locked' : ''));
                        const displayName = user?.name ?? deletedInfo?.name ?? '?';
                        return (
                          <td
                            key={slotIdx}
                            className={cellClass}
                            onClick={() => {
                              if (isDeleted) return; // Can't interact with deleted user's cell
                              if (isPast && !historyMode) return;
                              onCellClick(date, entry, uid);
                            }}
                            title={isDeleted ? `Видалений: ${displayName}` : undefined}
                          >
                            <span
                              className="no-print"
                              style={{ fontSize: '0.78rem', opacity: isDeleted ? 0.6 : 1 }}
                            >
                              {isDeleted && (
                                <i
                                  className="fas fa-user-slash me-1"
                                  style={{ fontSize: '0.65rem' }}
                                ></i>
                              )}
                              {displayName}
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

  // Find deleted users that have assignments in current week dates
  const deletedUsersInWeek = useMemo(() => {
    const found = new Map<number, DeletedUserInfo>();
    for (const date of weekDates) {
      const entry = schedule[date];
      if (!entry?.userId) continue;
      const ids = toAssignedUserIds(entry.userId);
      for (const id of ids) {
        if (!usersById[id] && deletedUserNames[id]) {
          found.set(id, deletedUserNames[id]);
        }
      }
    }
    return found;
  }, [weekDates, schedule, usersById, deletedUserNames]);

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
                      backgroundColor: isWeekend
                        ? 'var(--app-table-weekend-bg, #e9ecef)'
                        : 'var(--app-table-header-bg, #f8f9fa)',
                      color: 'var(--bs-body-color)',
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
            {/* Deleted users that still have assignments in this week */}
            {[...deletedUsersInWeek.entries()].map(([deletedId, info]) => (
              <tr
                key={`deleted-${deletedId}`}
                className="user-row-inactive"
                style={{ opacity: 0.6 }}
              >
                <td></td>
                <td className="text-start px-2 col-user-screen">
                  <span className="d-block">
                    <span className="rank-badge">{formatRank(info.rank)}</span>
                    <span className="fw-bold text-muted">{info.name}</span>
                  </span>
                  <span
                    className="badge bg-secondary text-white ms-1"
                    style={{ fontSize: '0.6rem' }}
                  >
                    <i className="fas fa-user-slash me-1" style={{ fontSize: '0.55rem' }}></i>
                    ВИДАЛЕНИЙ
                  </span>
                </td>
                <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
                  {info.rank}
                </td>
                <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
                  {info.name}
                </td>
                {weekDates.map((date) => {
                  const entry = schedule[date];
                  const ids = toAssignedUserIds(entry?.userId);
                  const isAssigned = ids.includes(deletedId);
                  return (
                    <td key={date} className={`compact-cell${isAssigned ? ' past-locked' : ''}`}>
                      <span className="no-print">{isAssigned ? 'НАРЯД' : ''}</span>
                      <span className="print-only">{isAssigned ? '08:00' : ''}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleTable;
