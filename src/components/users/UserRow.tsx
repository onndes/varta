import React from 'react';
import type { User } from '../../types';
import { STATUSES } from '../../utils/constants';
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
      <td style={{ cursor: 'pointer' }} onClick={() => onViewStats(u)}>
        <small className="d-block text-muted text-uppercase" style={{ fontSize: '0.7rem' }}>
          {formatRank(u.rank)}
        </small>
        <span className="fw-bold">{u.name}</span>
        <div className="small text-muted">{u.note}</div>
      </td>
      <td>
        <div className="d-flex align-items-center gap-2">
          <span
            className={`badge ${u.isActive ? (u.status === 'ACTIVE' ? 'bg-success' : 'bg-warning text-dark') : 'bg-secondary'}`}
          >
            {u.isActive ? STATUSES[u.status] : 'НЕАКТИВНИЙ'}
          </span>
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
        </div>
      </td>
      <td>
        <span className={u.debt > 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}>
          {u.debt > 0 ? '+' : ''}
          {u.debt.toFixed(1)}
        </span>
      </td>
      <td className="text-end">
        <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => onEdit({ ...u })}>
          <i className="fas fa-edit"></i>
        </button>
        {u.debt !== 0 && (
          <button className="btn btn-sm btn-outline-warning me-1" onClick={() => onResetDebt(u)}>
            <i className="fas fa-undo"></i>
          </button>
        )}
        <button className="btn btn-sm btn-outline-danger" onClick={() => onDelete(u)}>
          <i className="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  );
};

export default UserRow;
