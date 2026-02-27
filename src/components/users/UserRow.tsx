import React from 'react';
import type { User } from '../../types';
import { STATUSES, DAY_SHORT_NAMES } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';
import { toLocalISO } from '../../utils/dateUtils';

interface UserRowProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onViewStats: (user: User) => void;
  onResetDebt: (user: User) => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, onEdit, onDelete, onViewStats, onResetDebt }) => {
  const u = user;
  const todayStr = toLocalISO(new Date());
  const statusEnded = !!u.statusTo && u.statusTo < todayStr;
  const displayStatus = statusEnded ? 'ACTIVE' : u.status;
  const showStatusDates = !statusEnded;

  // Map status codes to readable icon+label pairs
  const STATUS_META: Record<string, { icon: string; label: string; cls: string }> = {
    ACTIVE: { icon: 'fa-circle-check', label: 'В строю', cls: 'bg-success' },
    SICK: { icon: 'fa-kit-medical', label: 'Лікування', cls: 'text-bg-warning' },
    VACATION: { icon: 'fa-umbrella-beach', label: 'Відпустка', cls: 'text-bg-warning' },
    TRIP: { icon: 'fa-briefcase', label: 'Відрядж.', cls: 'text-bg-info' },
    ABSENT: { icon: 'fa-circle-minus', label: 'Відсутній', cls: 'text-bg-secondary' },
    OTHER: { icon: 'fa-circle-info', label: 'Інше', cls: 'text-bg-secondary' },
    INACTIVE: { icon: 'fa-circle-xmark', label: 'Неактив', cls: 'bg-secondary' },
  };

  const statusKey = !u.isActive ? 'INACTIVE' : displayStatus;
  const meta = STATUS_META[statusKey] ?? STATUS_META.OTHER;

  const dateRange =
    (u.statusFrom || u.statusTo) && u.isActive && u.status !== 'ACTIVE' && showStatusDates
      ? [
          u.statusFrom
            ? new Date(u.statusFrom).toLocaleDateString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
              })
            : '',
          u.statusTo
            ? new Date(u.statusTo).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
            : '',
        ]
          .filter(Boolean)
          .join(' – ')
      : null;

  return (
    <tr className={!u.isActive ? 'user-row-inactive' : ''}>
      <td className="text-start" style={{ cursor: 'pointer' }} onClick={() => onViewStats(u)}>
        <small className="d-block text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>
          {formatRank(u.rank)}
        </small>
        <span className="fw-bold">{u.name}</span>
        <div className="small text-muted">{u.note}</div>
      </td>

      {/* Status column – status pill + optional date range on same line */}
      <td className="text-start">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className={`badge ${meta.cls}`} style={{ minWidth: '72px', fontSize: '0.75rem' }}>
            {u.isActive ? STATUSES[displayStatus] : 'Неактив'}
          </span>
          {dateRange && (
            <small className="text-muted" style={{ fontSize: '0.73rem', whiteSpace: 'nowrap' }}>
              {dateRange}
            </small>
          )}
          {u.status === 'OTHER' && u.statusComment && (
            <small className="text-muted fst-italic" style={{ fontSize: '0.7rem' }}>
              {u.statusComment}
            </small>
          )}
        </div>
        {u.excludeFromAuto && (
          <div className="mt-1">
            <span
              className="badge bg-warning"
              style={{ fontSize: '0.62rem', color: '#000', letterSpacing: '0.01em' }}
            >
              <i className="fas fa-ban me-1" style={{ fontSize: '0.55rem' }}></i>без авторозп.
            </span>
          </div>
        )}
      </td>
      <td className="text-center">
        {u.blockedDays && u.blockedDays.length > 0 ? (
          <>
            <div className="d-flex gap-1 justify-content-center flex-wrap">
              {u.blockedDays
                .sort((a, b) => a - b)
                .map((d) => {
                  // Convert 1=Mon..7=Sun to JS day index: 1→1, 2→2,...,6→6, 7→0
                  const jsIdx = d === 7 ? 0 : d;
                  return (
                    <span
                      key={d}
                      className="badge bg-danger bg-opacity-75"
                      style={{ fontSize: '0.6rem' }}
                    >
                      {DAY_SHORT_NAMES[jsIdx] || d}
                    </span>
                  );
                })}
            </div>
            {(u.blockedDaysFrom || u.blockedDaysTo) && (
              <div className="text-muted text-center" style={{ fontSize: '0.6rem' }}>
                {u.blockedDaysFrom
                  ? new Date(u.blockedDaysFrom).toLocaleDateString('uk-UA', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : '..'}
                {' – '}
                {u.blockedDaysTo
                  ? new Date(u.blockedDaysTo).toLocaleDateString('uk-UA', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : '..'}
              </div>
            )}
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="text-center">
        <span
          className={
            u.debt < 0
              ? 'text-danger fw-bold'
              : u.debt > 0
                ? 'text-success fw-bold'
                : 'text-muted fw-bold'
          }
        >
          {u.debt > 0 ? '+' : ''}
          {u.debt.toFixed(1)}
        </span>
      </td>
      <td className="text-end">
        <button
          className="btn btn-sm btn-outline-secondary me-1"
          onClick={() => onEdit({ ...u })}
          title="Редагувати"
        >
          <i className="fas fa-edit"></i>
        </button>
        {u.debt !== 0 && (
          <button
            className="btn btn-sm btn-outline-warning me-1"
            onClick={() => onResetDebt(u)}
            title="Скинути карму"
          >
            <i className="fas fa-undo"></i>
          </button>
        )}
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={() => onDelete(u)}
          title="Видалити"
        >
          <i className="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  );
};

export default UserRow;
