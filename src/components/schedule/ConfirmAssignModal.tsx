import React from 'react';
import type { User } from '../../types';
import { getWeekNumber } from '../../utils/dateUtils';
import { getMondayOfWeek } from '../../utils/dateUtils';
import Modal from '../Modal';

interface PendingAssignConfirm {
  userId: number;
  transferFrom?: string;
  isRestDay: boolean;
}

interface ConfirmAssignModalProps {
  show: boolean;
  pending: PendingAssignConfirm | null;
  targetDate: string;
  users: User[];
  onConfirmMove: (userId: number) => void;
  onConfirmAdd: (userId: number) => void;
  onClose: () => void;
}

const getWeekRelationLabel = (fromDate: string, toDate: string): string => {
  const fromMonday = getMondayOfWeek(
    new Date(fromDate).getFullYear(),
    getWeekNumber(new Date(fromDate))
  );
  const toMonday = getMondayOfWeek(new Date(toDate).getFullYear(), getWeekNumber(new Date(toDate)));
  const diffMs = fromMonday.getTime() - toMonday.getTime();
  if (diffMs < 0) return 'з минулого тижня';
  if (diffMs > 0) return 'з наступного тижня';
  return 'з цього тижня';
};

const ConfirmAssignModal: React.FC<ConfirmAssignModalProps> = ({
  show,
  pending,
  targetDate,
  users,
  onConfirmMove,
  onConfirmAdd,
  onClose,
}) => {
  if (!pending) return null;

  const userName = users.find((u) => u.id === pending.userId)?.name || 'Невідомо';

  return (
    <Modal show={show} onClose={onClose} title="Підтвердження призначення">
      <div>
        <div className="alert alert-warning py-2">
          Ви виконуєте ручну зміну призначення. Перевірте дію перед підтвердженням.
        </div>

        <div className="mb-3">
          <div>
            <strong>Боєць:</strong> {userName}
          </div>
          <div>
            <strong>Нова дата:</strong> {new Date(targetDate).toLocaleDateString('uk-UA')}
            {' · '}
            тиждень #{getWeekNumber(new Date(targetDate))} (тиждень призначення)
          </div>
          {pending.transferFrom && (
            <div>
              <strong>Поточне чергування:</strong>{' '}
              {new Date(pending.transferFrom).toLocaleDateString('uk-UA')}
              {' · '}
              тиждень #{getWeekNumber(new Date(pending.transferFrom))} (
              {getWeekRelationLabel(pending.transferFrom, targetDate)})
            </div>
          )}
          {pending.isRestDay && (
            <div className="text-warning-emphasis mt-2">
              Увага: це відсипний день (боєць чергував вчора).
            </div>
          )}
        </div>

        <div className="d-grid gap-2">
          {pending.transferFrom && (
            <button className="btn btn-primary" onClick={() => onConfirmMove(pending.userId)}>
              Перенести старе чергування на нову дату
            </button>
          )}
          <button className="btn btn-soft-warning" onClick={() => onConfirmAdd(pending.userId)}>
            Лишити старе чергування і додати нове
          </button>
          <button className="btn btn-outline-secondary" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmAssignModal;
