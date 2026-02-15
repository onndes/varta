import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, formatNameForPrint } from '../../utils/helpers';
import { STATUSES } from '../../utils/constants';
import { getUserAvailabilityStatus } from './availability.utils';

interface ScheduleTableRowProps {
  user: User;
  index: number;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  onCellClick: (date: string, entry: ScheduleEntry | null) => void;
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
  onCellClick,
}) => {
  const statusLabel = !user.isActive
    ? 'ЗВІЛЬНЕНИЙ'
    : user.status !== 'ACTIVE'
      ? STATUSES[user.status]
      : null;

  return (
    <tr className={!user.isActive ? 'user-row-inactive' : ''}>
      <td>{index + 1}</td>
      <td className="text-start px-2 col-user-screen">
        <span className="d-block">
          <span className="rank-badge">{formatRank(user.rank)}</span>
          <span className="fw-bold text-dark">{user.name}</span>
        </span>
        {statusLabel && (
          <span className="badge bg-warning text-dark ms-2 no-print" style={{ fontSize: '0.6rem' }}>
            {statusLabel}
          </span>
        )}
      </td>
      <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
        {user.rank}
      </td>
      <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
        {formatNameForPrint(user.name)}
      </td>
      {weekDates.map((date) => {
        const entry = schedule[date];
        const isAssigned = entry?.userId === user.id;
        const available = getUserAvailabilityStatus(user, date) === 'AVAILABLE';
        const isPast = new Date(date) < new Date(todayStr);

        let cellClass = 'compact-cell';
        let screenContent = '';
        let printContent = '';

        if (isAssigned) {
          cellClass += isPast ? ' past-locked' : ' assigned' + (entry.isLocked ? ' locked' : '');
          screenContent = 'НАРЯД' + (entry.isLocked ? ' 🔒' : '');
          printContent = '08:00';
        } else if (!available) {
          cellClass += ' unavailable';
        }

        return (
          <td
            key={date}
            className={cellClass}
            onClick={() => {
              if (isPast) return;
              onCellClick(date, isAssigned ? entry : null);
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
