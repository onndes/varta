import React from 'react';
import type { User } from '../../types';
import { getWeekNumber } from '../../utils/dateUtils';
import Modal from '../Modal';

interface PendingAssignConfirm {
  userId: number;
  lastDutyDate?: string;
  daysSinceLastDuty?: number;
  isRestDay: boolean;
}

interface ConfirmAssignModalProps {
  show: boolean;
  pending: PendingAssignConfirm | null;
  targetDate: string;
  users: User[];
  onConfirm: (userId: number) => void;
  onClose: () => void;
}

const ConfirmAssignModal: React.FC<ConfirmAssignModalProps> = ({
  show,
  pending,
  targetDate,
  users,
  onConfirm,
  onClose,
}) => {
  if (!pending) return null;

  const userName = users.find((u) => u.id === pending.userId)?.name || 'Невідомо';

  return (
    <Modal show={show} onClose={onClose} title="Підтвердження призначення">
      <div>
        <div className="alert alert-warning py-2">
          Ви виконуєте ручне призначення на обрану дату. Перевірте дію перед підтвердженням.
        </div>

        <div className="mb-3">
          <div>
            <strong>Боєць:</strong> {userName}
          </div>
          <div>
            <strong>Дата призначення:</strong> {new Date(targetDate).toLocaleDateString('uk-UA')}
            {' · '}
            тиждень #{getWeekNumber(new Date(targetDate))}
          </div>
          <div>
            <strong>Останнє чергування:</strong>{' '}
            {pending.lastDutyDate ? new Date(pending.lastDutyDate).toLocaleDateString('uk-UA') : 'немає в базі'}
            {pending.daysSinceLastDuty !== undefined && (
              <>
                {' · '}
                {pending.daysSinceLastDuty} дн. до вибраної дати
              </>
            )}
          </div>
          {pending.isRestDay && (
            <div className="text-warning-emphasis mt-2">
              Увага: це відсипний день (боєць чергував вчора).
            </div>
          )}
        </div>

        <div className="d-grid gap-2">
          <button className="btn btn-primary" onClick={() => onConfirm(pending.userId)}>
            Підтвердити призначення
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
