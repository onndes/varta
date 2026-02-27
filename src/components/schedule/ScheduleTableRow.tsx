import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, formatNameForPrint } from '../../utils/helpers';
import { STATUSES } from '../../utils/constants';
import { getUserAvailabilityStatus } from '../../services/userService';
import { isAssignedInEntry } from '../../utils/assignment';

interface ScheduleTableRowProps {
  user: User;
  index: number;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  historyMode?: boolean;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
}

/**
 * Single row in schedule table representing one user
 */
const ScheduleTableRow: React.FC<ScheduleTableRowProps> = ({
  user,
  index,
  weekDates,
  schedule,
  todayStr,
  historyMode = false,
  onCellClick,
}) => {
  // Split name: surname (CAPS) + first/middle (dimmer)
  const nameParts = user.name.trim().split(/\s+/);
  const nameRest = nameParts.slice(1).join(' ');

  // Status label logic: show only if relevant to current time
  let statusLabel: string | null = null;

  if (!user.isActive) {
    statusLabel = 'ЗВІЛЬНЕНИЙ';
  } else if (user.status !== 'ACTIVE') {
    const today = new Date(todayStr);
    const statusFrom = user.statusFrom ? new Date(user.statusFrom) : null;
    const statusTo = user.statusTo ? new Date(user.statusTo) : null;

    // If status hasn't started yet (future)
    if (statusFrom && statusFrom > today) {
      const diffDays = Math.ceil((statusFrom.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        // Show if starts within 2 weeks
        statusLabel = `${STATUSES[user.status]} з ${statusFrom.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}`;
      }
    }
    // If status ended more than 7 days ago — hide
    else if (statusTo && statusTo < today) {
      const diffDays = Math.ceil((today.getTime() - statusTo.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        // Show for 7 days after end
        statusLabel = STATUSES[user.status];
      }
    }
    // Status is active now
    else {
      statusLabel = STATUSES[user.status];
    }
  }

  return (
    <tr className={!user.isActive ? 'user-row-inactive' : ''}>
      <td>{index + 1}</td>
      <td
        className="text-start col-user-screen"
        style={{
          width: '96px',
          minWidth: '96px',
          maxWidth: '96px',
          paddingRight: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <small
          className="text-muted text-uppercase"
          style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
        >
          {formatRank(user.rank)}
        </small>
      </td>
      <td className="text-start px-2 col-user-screen">
        <div
          className="fw-bold text-uppercase"
          style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
        >
          {nameParts[0]}
        </div>
        {nameRest && (
          <div
            className="text-muted"
            style={{ fontSize: '0.73rem', opacity: 0.7, lineHeight: 1.2 }}
          >
            {nameRest}
          </div>
        )}
        <div className="d-flex flex-wrap gap-1 mt-1">
          {!user.isActive && (
            <span className="badge bg-secondary text-white no-print" style={{ fontSize: '0.6rem' }}>
              ВІДСУТНІЙ
            </span>
          )}
          {user.excludeFromAuto && (
            <span
              className="badge bg-warning text-dark no-print"
              style={{ fontSize: '0.6rem', opacity: 0.75 }}
            >
              без авторозп.
            </span>
          )}
          {statusLabel && (
            <span className="badge bg-warning text-dark no-print" style={{ fontSize: '0.6rem' }}>
              {statusLabel}
            </span>
          )}
        </div>
      </td>
      <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
        {user.rank}
      </td>
      <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
        {formatNameForPrint(user.name)}
      </td>
      {weekDates.map((date) => {
        const entry = schedule[date];
        const isAssigned = isAssignedInEntry(entry, user.id!);
        const availabilityStatus = getUserAvailabilityStatus(user, date);
        const available = availabilityStatus === 'AVAILABLE';
        const isPast = new Date(date) < new Date(todayStr);

        let cellClass = 'compact-cell';
        let screenContent: React.ReactNode = '';
        let printContent = '';

        if (isAssigned) {
          if (entry.type === 'history' || entry.type === 'import') {
            cellClass += ' history-entry';
          } else {
            cellClass +=
              isPast && !historyMode
                ? ' past-locked'
                : ' assigned' + (entry.isLocked ? ' locked' : '');
          }

          // Show icon for type: lock, replace, swap, manual, auto, history
          let icon = '';
          if (entry.isLocked) {
            icon = ' bi bi-lock-fill';
          } else if (entry.type === 'import') {
            icon = ' bi bi-box-arrow-in-down';
          } else if (entry.type === 'history') {
            icon = ' bi bi-clock-history';
          } else if (entry.type === 'replace') {
            icon = ' bi bi-arrow-repeat';
          } else if (entry.type === 'swap') {
            icon = ' bi bi-arrow-left-right';
          } else if (entry.type === 'manual') {
            icon = ' bi bi-hand-index-thumb';
          } else if (entry.type === 'auto') {
            icon = ' bi bi-gear-fill';
          }

          screenContent = (
            <>
              НАРЯД <i className={`${icon} ms-1`} />
            </>
          );
          printContent = '08:00';
        } else if (!available) {
          cellClass += ' unavailable';

          // Show status text in unavailable cells
          if (availabilityStatus === 'STATUS_BUSY') {
            screenContent = STATUSES[user.status] || 'ЗАЙНЯТИЙ';
          } else if (availabilityStatus === 'REST_DAY') {
            screenContent = 'ЗВІЛЬН. ВІД ЧЕРГ.';
          } else if (availabilityStatus === 'DAY_BLOCKED') {
            screenContent = 'ЗАБЛОКОВАНО';
          } else if (availabilityStatus === 'PRE_STATUS_DAY') {
            screenContent = 'ЗВІЛЬН. ВІД ЧЕРГ.';
          } else {
            screenContent = '—';
          }
        }

        return (
          <td
            key={date}
            className={cellClass}
            onClick={() => {
              if (isPast && !historyMode) return;
              onCellClick(date, isAssigned ? entry : null, isAssigned ? user.id : undefined);
            }}
          >
            <span className="no-print">{screenContent}</span>
            <span className="print-only">{printContent}</span>
          </td>
        );
      })}
    </tr>
  );
};

export default ScheduleTableRow;
