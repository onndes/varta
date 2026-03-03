import React from 'react';
import type { User } from '../../types';
import { STATUSES, DAY_SHORT_NAMES } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';
import { toLocalISO } from '../../utils/dateUtils';

interface UserRowProps {
  user: User;
  rowNumber: number;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onViewStats: (user: User) => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, rowNumber, onEdit, onDelete, onViewStats }) => {
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

  const toShortDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
        })
      : '..';

  const statusDateRange =
    (u.statusFrom || u.statusTo) && u.isActive && displayStatus !== 'ACTIVE' && showStatusDates
      ? `${toShortDate(u.statusFrom)}–${toShortDate(u.statusTo)}`
      : null;

  const statusBadgeText = `${u.isActive ? STATUSES[displayStatus] : 'Неактив'}${
    statusDateRange ? ` ${statusDateRange}` : ''
  }`;

  const blockedDateRange =
    u.blockedDaysFrom || u.blockedDaysTo
      ? `${toShortDate(u.blockedDaysFrom)}–${toShortDate(u.blockedDaysTo)}`
      : null;

  // Розділяємо ПІБ: прізвище (КАПСОМ), ім'я + по-батькові (тонше, менше)
  const nameParts = u.name.trim().split(/\s+/);
  const surname = nameParts[0] || '';
  const firstAndMiddle = nameParts.slice(1).join(' ');

  return (
    <tr className={!u.isActive ? 'user-row-inactive' : ''}>
      <td
        className="text-center text-muted ps-2"
        style={{ width: '44px', minWidth: '44px', maxWidth: '44px', fontSize: '0.75rem' }}
      >
        {rowNumber}
      </td>
      <td
        className="text-start ps-3"
        style={{ width: '96px', minWidth: '96px', maxWidth: '96px', whiteSpace: 'nowrap' }}
      >
        <small
          className="text-muted text-uppercase"
          style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
        >
          {formatRank(u.rank)}
        </small>
      </td>
      <td className="text-start" style={{ cursor: 'pointer' }} onClick={() => onViewStats(u)}>
        <div
          className="fw-bold text-uppercase"
          style={{ fontSize: '0.85rem', letterSpacing: '0.02em' }}
        >
          {surname}
        </div>
        {firstAndMiddle && (
          <div className="text-muted" style={{ fontSize: '0.78rem', opacity: 0.75 }}>
            {firstAndMiddle}
          </div>
        )}
        {u.note && (
          <div className="small text-muted" style={{ fontSize: '0.7rem' }}>
            {u.note}
          </div>
        )}
      </td>

      {/* Status column – status pill + blocked days/details */}
      <td className="text-start">
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className={`badge ${meta.cls}`} style={{ minWidth: '72px', fontSize: '0.75rem' }}>
            {statusBadgeText}
          </span>
          {u.status === 'OTHER' && u.statusComment && (
            <small className="text-muted fst-italic" style={{ fontSize: '0.7rem' }}>
              {u.statusComment}
            </small>
          )}
        </div>
        {u.blockedDays && u.blockedDays.length > 0 && (
          <div className="mt-1 d-flex gap-1 flex-wrap align-items-center">
            {u.blockedDays
              .slice()
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
            {blockedDateRange && (
              <small
                className="text-muted"
                style={{ fontSize: '0.66rem', whiteSpace: 'nowrap', marginLeft: '0.25rem' }}
              >
                ({blockedDateRange})
              </small>
            )}
          </div>
        )}
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
      <td className="text-end">
        <button
          className="btn btn-sm btn-outline-secondary me-1"
          onClick={() => onEdit({ ...u })}
          title="Редагувати"
        >
          <i className="fas fa-edit"></i>
        </button>
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
