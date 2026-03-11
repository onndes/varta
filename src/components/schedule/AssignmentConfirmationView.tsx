// src/components/schedule/AssignmentConfirmationView.tsx — confirmation step component
import React from 'react';
import type { User } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import type { PendingAction } from './assignmentModalUtils';

interface ConfirmationViewProps {
  pending: PendingAction;
  date: string;
  assignedUser?: User;
  users: User[];
  onConfirm: () => void;
  onCancel: () => void;
}

/** Full-screen confirmation step before executing an assignment action. */
export const ConfirmationView: React.FC<ConfirmationViewProps> = ({
  pending,
  date,
  assignedUser,
  users,
  onConfirm,
  onCancel,
}) => {
  const newUser = pending.type !== 'remove' ? users.find((u) => u.id === pending.userId) : null;

  return (
    <div>
      <div className="alert alert-warning py-2 mb-3">
        <i className="fas fa-exclamation-triangle me-2"></i>
        <strong>Підтвердження дії</strong>
      </div>

      <div className="mb-3">
        <div className="mb-2">
          <strong>Дата:</strong> {formatDate(date)}
        </div>

        {pending.type === 'replace' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-danger me-2">
                <i className="fas fa-minus"></i>
              </span>
              <span>
                Знімається: <strong>{assignedUser?.name}</strong>
                {pending.penalize && <span className="text-danger ms-1">(−карма)</span>}
              </span>
            </div>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-success me-2">
                <i className="fas fa-plus"></i>
              </span>
              <span>
                Призначається: <strong>{newUser?.name}</strong>
              </span>
            </div>
          </>
        )}

        {pending.type === 'swap' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-primary me-2">
                <i className="fas fa-retweet"></i>
              </span>
              <span>
                <strong>{assignedUser?.name}</strong> ({formatDate(date)})
              </span>
            </div>
            <div className="text-center my-1">
              <i className="fas fa-arrows-up-down text-muted"></i>
            </div>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-primary me-2">
                <i className="fas fa-retweet"></i>
              </span>
              <span>
                <strong>{newUser?.name}</strong> ({formatDate(pending.swapDate)})
              </span>
            </div>
            <div className="small text-muted mt-2">Без штрафів для обох осіб</div>
          </>
        )}

        {pending.type === 'remove' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-danger me-2">
                <i className="fas fa-user-minus"></i>
              </span>
              <span>
                Знімається: <strong>{assignedUser?.name}</strong>
              </span>
            </div>
            <div className="small mt-1">
              {pending.reason === 'request' ? (
                <span className="text-danger">
                  <i className="fas fa-file-alt me-1"></i>За рапортом — Карма МІНУС
                </span>
              ) : (
                <span className="text-muted">
                  <i className="fas fa-briefcase me-1"></i>Службова — Карма 0
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="d-grid gap-2">
        <button className="btn btn-primary" onClick={onConfirm}>
          <i className="fas fa-check me-1"></i>Підтвердити
        </button>
        <button className="btn btn-outline-secondary" onClick={onCancel}>
          Назад
        </button>
      </div>
    </div>
  );
};
