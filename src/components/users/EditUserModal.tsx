import React from 'react';
import type { User } from '../../types';
import { RANKS, STATUSES } from '../../utils/constants';
import Modal from '../Modal';

interface EditUserModalProps {
  user: User;
  onChange: (user: User) => void;
  onSave: () => void;
  onClose: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ user, onChange, onSave, onClose }) => {
  return (
    <Modal show={true} onClose={onClose} title="Редагування" size="modal-lg">
      <div className="row">
        <div className="col-md-6 mb-3">
          <label className="small text-muted">Військове звання</label>
          <select
            className="form-select"
            value={user.rank}
            onChange={(e) => onChange({ ...user, rank: e.target.value })}
          >
            {RANKS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="col-md-6 mb-3">
          <label className="small text-muted">Статус</label>
          <select
            className="form-select"
            value={user.status}
            onChange={(e) => onChange({ ...user, status: e.target.value as User['status'] })}
          >
            {Object.keys(STATUSES).map((st) => (
              <option key={st} value={st}>
                {STATUSES[st]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {user.status !== 'ACTIVE' && (
        <div className="row">
          <div className="col-md-6 mb-3">
            <label className="small text-muted">Дата початку</label>
            <input
              type="date"
              className="form-control"
              value={user.statusFrom}
              onChange={(e) => onChange({ ...user, statusFrom: e.target.value })}
            />
          </div>
          <div className="col-md-6 mb-3">
            <label className="small text-muted">Дата завершення</label>
            <input
              type="date"
              className="form-control"
              value={user.statusTo}
              onChange={(e) => onChange({ ...user, statusTo: e.target.value })}
            />
          </div>
          <div className="col-12 mb-3">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                checked={user.restAfterStatus}
                onChange={(e) => onChange({ ...user, restAfterStatus: e.target.checked })}
              />
              <label className="form-check-label small">Відпочинок після завершення статусу</label>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3">
        <label className="small text-muted">Посада / Примітка</label>
        <input
          className="form-control"
          value={user.note}
          onChange={(e) => onChange({ ...user, note: e.target.value })}
        />
      </div>

      <div className="mb-3">
        <div className="form-check">
          <input
            type="checkbox"
            className="form-check-input"
            checked={user.isActive}
            onChange={(e) => onChange({ ...user, isActive: e.target.checked })}
          />
          <label className="form-check-label">Активний (бере участь у варті)</label>
        </div>
      </div>

      <button className="btn btn-primary w-100" onClick={onSave}>
        ЗБЕРЕГТИ
      </button>
    </Modal>
  );
};

export default EditUserModal;
