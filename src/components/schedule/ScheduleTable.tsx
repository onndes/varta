import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry } from '../../types';
import type { DeletedUserInfo } from '../../services/userService';
import { getUserAvailabilityStatus } from '../../services/userService';
import ScheduleTableRow from './ScheduleTableRow';
import { toAssignedUserIds, isAssignedInEntry } from '../../utils/assignment';
import {
  compareByRankAndName,
  sortUsersBy,
  formatRank,
  type SortKey,
  type SortDir,
} from '../../utils/helpers';
import { CompactScheduleView } from './CompactScheduleView';
import { ScheduleTableHeader } from './ScheduleTableHeader';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
  rowFilter: 'all' | 'available' | 'assigned';
  historyMode?: boolean;
  deletedUserNames?: Record<number, DeletedUserInfo>;
  onUserClick?: (user: User) => void;
  dowHistoryWeeks?: number;
  dowHistoryMode?: 'numbers' | 'dots';
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
  onQuickAssignClick: (date: string, user: User) => void;
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
  rowFilter,
  historyMode = false,
  deletedUserNames = {},
  onUserClick,
  dowHistoryWeeks = 4,
  dowHistoryMode = 'numbers',
  onCellClick,
  onQuickAssignClick,
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
    let base = sortKey
      ? sortUsersBy(activeUsers, sortKey, sortDir)
      : [...activeUsers].sort(compareByRankAndName);
    if (rowFilter === 'available') {
      base = base.filter((u) =>
        weekDates.some((d) => getUserAvailabilityStatus(u, d) === 'AVAILABLE')
      );
    } else if (rowFilter === 'assigned') {
      base = base.filter((u) => weekDates.some((d) => isAssignedInEntry(schedule[d], u.id!)));
    }
    return base;
  }, [activeUsers, sortKey, sortDir, rowFilter, weekDates, schedule]);

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

  // ── Day-centric compact view for large teams (> 20) ──────────────────
  if (activeUsers.length > 20) {
    return (
      <CompactScheduleView
        weekDates={weekDates}
        schedule={schedule}
        todayStr={todayStr}
        dutiesPerDay={dutiesPerDay}
        historyMode={historyMode}
        deletedUserNames={deletedUserNames}
        usersById={usersById}
        onCellClick={onCellClick}
      />
    );
  }

  // ── Standard user-row view for small teams (≤ 20) ────────────────────
  return (
    <div className="view-table-outer">
      <div className="view-table">
        <div className="card shadow-sm border-0">
          <table className="compact-table">
            <ScheduleTableHeader
              weekDates={weekDates}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              onDateClick={(date) => onCellClick(date, null, undefined)}
            />
            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + weekDates.length}
                    className="text-center text-muted py-4 no-print"
                  >
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
                    dowHistoryWeeks={dowHistoryWeeks}
                    dowHistoryMode={dowHistoryMode}
                    onUserClick={onUserClick}
                    onCellClick={onCellClick}
                    onQuickAssignClick={onQuickAssignClick}
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
                  <td
                    className="text-start col-user-screen"
                    style={{ minWidth: '70px', paddingRight: 0 }}
                  >
                    <small
                      className="text-muted text-uppercase"
                      style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
                    >
                      {formatRank(info.rank)}
                    </small>
                  </td>
                  <td className="text-start px-2 col-user-screen">
                    <div
                      className="fw-bold text-uppercase text-muted"
                      style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
                    >
                      {info.name.trim().split(/\s+/)[0]}
                    </div>
                    {info.name.trim().split(/\s+/).length > 1 && (
                      <div
                        className="text-muted"
                        style={{ fontSize: '0.73rem', opacity: 0.5, lineHeight: 1.2 }}
                      >
                        {info.name.trim().split(/\s+/).slice(1).join(' ')}
                      </div>
                    )}
                    <span className="badge bg-secondary text-white" style={{ fontSize: '0.55rem' }}>
                      <i className="fas fa-user-slash me-1" style={{ fontSize: '0.5rem' }}></i>
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
    </div>
  );
};

export default ScheduleTable;
