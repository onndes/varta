import React from 'react';
import type { User } from '../../types';
import Modal from '../Modal';

interface AssignmentModalProps {
  show: boolean;
  date: string;
  assignedUserId?: number;
  users: User[];
  freeUsers: User[];
  swapMode: 'replace' | 'remove';
  onSetSwapMode: (mode: 'replace' | 'remove') => void;
  onAssign: (userId: number) => void;
  onRemove: (reason: 'request' | 'work') => void;
  onClose: () => void;
  isOnRestDay: (userId: number, date: string) => boolean;
  calculateEffectiveLoad: (user: User) => number;
  hasEntry: boolean;
}

const UserListItem: React.FC<{
  user: User;
  date: string;
  isRest: boolean;
  effectiveLoad: number;
  onAssign: (userId: number) => void;
}> = ({ user, date, isRest, effectiveLoad, onAssign }) => {
  const dayIdx = new Date(date).getDay();
  const owes = (user.owedDays && user.owedDays[dayIdx]) || 0;

  return (
    <button
      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isRest ? 'list-group-item-warning' : ''}`}
      onClick={() => onAssign(user.id!)}
    >
      <div>
        <span className="fw-bold">{user.name}</span>
        {owes > 0 && <span className="badge bg-danger ms-2">борг цього дня: {owes}</span>}
        {isRest && <span className="badge bg-warning text-dark ms-2">відсипний</span>}
        <div className="small text-muted">Ефект. навант: {effectiveLoad.toFixed(1)}</div>
      </div>
      <span
        className={user.debt < 0 ? 'text-danger' : user.debt > 0 ? 'text-success' : 'text-muted'}
      >
        Карма: {user.debt > 0 ? '+' + user.debt : user.debt}
      </span>
    </button>
  );
};

const AssignmentModal: React.FC<AssignmentModalProps> = ({
  show,
  date,
  assignedUserId,
  users,
  freeUsers,
  swapMode,
  onSetSwapMode,
  onAssign,
  onRemove,
  onClose,
  isOnRestDay,
  calculateEffectiveLoad,
  hasEntry,
}) => {
  const assignedUser = users.find((u) => u.id === assignedUserId);

  return (
    <Modal show={show} onClose={onClose} title={`Наряд на ${date}`}>
      <div>
        {hasEntry ? (
          <div>
            <div className="alert alert-secondary py-2 mb-3">
              <strong>{assignedUser?.name}</strong>
            </div>
            <div className="btn-group w-100 mb-3">
              <button
                className={`btn btn-sm ${swapMode === 'replace' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => onSetSwapMode('replace')}
              >
                Заміна
              </button>
              <button
                className={`btn btn-sm ${swapMode === 'remove' ? 'btn-danger' : 'btn-outline-danger'}`}
                onClick={() => onSetSwapMode('remove')}
              >
                Зняти
              </button>
            </div>
            {swapMode === 'replace' && (
              <div className="list-group" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {freeUsers.map((u) => (
                  <UserListItem
                    key={u.id}
                    user={u}
                    date={date}
                    isRest={isOnRestDay(u.id!, date)}
                    effectiveLoad={calculateEffectiveLoad(u)}
                    onAssign={onAssign}
                  />
                ))}
              </div>
            )}
            {swapMode === 'remove' && (
              <div className="d-grid gap-2">
                <button className="btn btn-outline-danger" onClick={() => onRemove('request')}>
                  За рапортом (Карма МІНУС)
                </button>
                <div className="small text-muted text-center">
                  Боєць буде &quot;винен&quot; системі.
                </div>
                <button className="btn btn-outline-secondary" onClick={() => onRemove('work')}>
                  Службова (Карма 0)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="list-group" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {freeUsers.map((u) => (
              <UserListItem
                key={u.id}
                user={u}
                date={date}
                isRest={isOnRestDay(u.id!, date)}
                effectiveLoad={calculateEffectiveLoad(u)}
                onAssign={onAssign}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AssignmentModal;
