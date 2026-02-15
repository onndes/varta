import React from 'react';
import type { User } from '../../types';
import { formatRank } from '../../utils/helpers';

interface UserListProps {
  users: User[];
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onViewStats: (user: User) => void;
  onResetDebt: (user: User) => void;
}

/**
 * User List Component
 * Displays table of all users with action buttons
 */
const UserList: React.FC<UserListProps> = ({
  users,
  onEdit,
  onDelete,
  onViewStats,
  onResetDebt,
}) => {
  const sortedUsers = [...users].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.debt - a.debt;
  });

  return (
    <div className="table-responsive">
      <table className="table table-hover">
        <thead className="table-light">
          <tr>
            <th style={{ width: '200px' }}>ПІБ</th>
            <th style={{ width: '120px' }}>Звання</th>
            <th style={{ width: '100px' }}>Статус</th>
            <th style={{ width: '100px' }}>Баланс</th>
            <th>Примітка</th>
            <th style={{ width: '180px' }}>Дії</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((u) => (
            <tr key={u.id} className={!u.isActive ? 'table-secondary' : ''}>
              <td className="fw-bold">{u.name}</td>
              <td>
                <span className="badge bg-secondary">{formatRank(u.rank)}</span>
              </td>
              <td>
                {!u.isActive ? (
                  <span className="badge bg-danger">ЗВІЛЬНЕНИЙ</span>
                ) : u.status !== 'ACTIVE' ? (
                  <span className="badge bg-warning text-dark">{u.status}</span>
                ) : (
                  <span className="badge bg-success">АКТИВНИЙ</span>
                )}
              </td>
              <td>
                <span
                  className={`fw-bold ${
                    u.debt > 0 ? 'text-success' : u.debt < 0 ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {u.debt > 0 ? '+' : ''}
                  {u.debt.toFixed(1)}
                </span>
              </td>
              <td>
                <small className="text-muted">{u.note || '—'}</small>
              </td>
              <td>
                <div className="btn-group btn-group-sm">
                  <button
                    className="btn btn-outline-primary"
                    onClick={() => onEdit(u)}
                    title="Редагувати"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  <button
                    className="btn btn-outline-info"
                    onClick={() => onViewStats(u)}
                    title="Статистика"
                  >
                    <i className="fas fa-chart-bar"></i>
                  </button>
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => onResetDebt(u)}
                    title="Скинути баланс"
                  >
                    <i className="fas fa-undo"></i>
                  </button>
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => onDelete(u)}
                    title="Видалити"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserList;
