import React from 'react';
import type { User } from '../../types';
import { STATUSES, DAY_SHORT_NAMES } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';

interface UserRowProps {
  user: User;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onViewStats: (user: User) => void;
  onResetDebt: (user: User) => void;
}

const UserRow: React.FC<UserRowProps> = ({ user, onEdit, onDelete, onViewStats, onResetDebt }) => {
  const u = user;

  return (
    <tr className={!u.isActive ? 'user-row-inactive' : ''}>
      <td className="text-start" style={{ cursor: 'pointer' }} onClick={() => onViewStats(u)}>
        <small className="d-block text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>
          {formatRank(u.rank)}
        </small>
        <span className="fw-bold">{u.name}</span>
        <div className="small text-muted">{u.note}</div>
      </td>
      <td className="text-center">
        <div className="d-flex align-items-center justify-content-center gap-2 flex-wrap">
          <span
            className={`badge ${u.isActive ? (u.status === 'ACTIVE' ? 'bg-success' : 'bg-warning text-dark') : 'bg-secondary'}`}
          >
            {u.isActive ? STATUSES[u.status] : 'НЕАКТИВНИЙ'}
          </span>
          {u.excludeFromAuto && (
            <span
              className="badge bg-warning text-dark"
              style={{ fontSize: '0.65rem', opacity: 0.8 }}
            >
              виключ. з авторозп.
            </span>
          )}
          {(u.statusFrom || u.statusTo) && u.isActive && u.status !== 'ACTIVE' && (
            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
              {u.statusFrom
                ? new Date(u.statusFrom).toLocaleDateString('uk-UA', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                : ''}
              {u.statusFrom && u.statusTo && ' - '}
              {u.statusTo
                ? new Date(u.statusTo).toLocaleDateString('uk-UA', {
                    day: '2-digit',
                    month: '2-digit',
                  })
                : ''}
            </small>
          )}
          {u.status === 'OTHER' && u.statusComment && (
            <small className="text-muted fst-italic" style={{ fontSize: '0.7rem' }}>
              {u.statusComment}
            </small>
          )}
        </div>
      </td>
      <td>
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
      <td>
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
