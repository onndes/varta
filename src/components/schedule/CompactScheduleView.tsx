// src/components/schedule/CompactScheduleView.tsx — day-centric view for large teams (>20)
import React from 'react';
import type { ScheduleEntry } from '../../types';
import type { DeletedUserInfo } from '../../services/userService';
import { toAssignedUserIds } from '../../utils/assignment';

interface CompactScheduleViewProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
  historyMode?: boolean;
  deletedUserNames: Record<number, DeletedUserInfo>;
  usersById: Record<number, { name: string }>;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
}

/** Day-centric compact schedule view used for teams with more than 20 members. */
export const CompactScheduleView: React.FC<CompactScheduleViewProps> = ({
  weekDates,
  schedule,
  todayStr,
  dutiesPerDay,
  historyMode = false,
  deletedUserNames,
  usersById,
  onCellClick,
}) => {
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
                      const isHistory = entry?.type === 'history' || entry?.type === 'import';
                      const isDeleted = !user && !!deletedInfo;
                      const cellClass =
                        'compact-cell' +
                        (isDeleted
                          ? ' past-locked'
                          : isHistory
                            ? ' history-entry'
                            : isPast && !historyMode
                              ? ' assigned-past'
                              : ' assigned' + (entry?.isLocked ? ' locked' : ''));
                      const displayName = user?.name ?? deletedInfo?.name ?? '?';

                      return (
                        <td
                          key={slotIdx}
                          className={cellClass}
                          onClick={() => {
                            if (isDeleted) return;
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
                            <span className="no-print" style={{ fontSize: '1rem', lineHeight: 1 }}>
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
};
