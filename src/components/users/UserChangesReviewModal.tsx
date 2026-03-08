import React from 'react';
import type { UserChangeItem } from '../../utils/userEditDiff';
import Modal from '../Modal';

interface UserChangesReviewModalProps {
  show: boolean;
  userName: string;
  changes: UserChangeItem[];
  isApplying?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

const UserChangesReviewModal: React.FC<UserChangesReviewModalProps> = ({
  show,
  userName,
  changes,
  isApplying = false,
  onApply,
  onDiscard,
  onCancel,
}) => {
  return (
    <Modal
      show={show}
      onClose={isApplying ? () => undefined : onCancel}
      title={`Застосувати зміни: ${userName}`}
      size="modal-lg"
    >
      <div className="mb-3">
        <div className="fw-semibold mb-1">Виявлено незастосовані зміни</div>
        <div className="text-muted small">
          Перевірте, що саме змінилось у картці особи, і вирішіть, чи потрібно це зберігати.
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        {changes.map((change) => (
          <div key={change.label} className="border rounded p-3 bg-light-subtle">
            <div className="fw-semibold mb-2">{change.label}</div>
            <div className="small text-muted mb-1">Було</div>
            <div className="small mb-2">{change.before}</div>
            <div className="small text-muted mb-1">Стало</div>
            <div className="small">{change.after}</div>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={isApplying}>
          Повернутись до редагування
        </button>
        <button type="button" className="btn btn-outline-danger" onClick={onDiscard} disabled={isApplying}>
          Не застосовувати
        </button>
        <button type="button" className="btn btn-primary" onClick={onApply} disabled={isApplying}>
          {isApplying ? 'Застосування...' : 'Застосувати зміни'}
        </button>
      </div>
    </Modal>
  );
};

export default UserChangesReviewModal;
