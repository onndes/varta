import React, { useState } from 'react';
import type { User } from '../../types';
import { RANKS } from '../../utils/constants';
import { isDuplicateName } from '../../services/importPersonnelFromExcelService';

interface AddUserFormProps {
  onAdd: (name: string, rank: string, note: string, birthday?: string) => Promise<void>;
  existingUsers?: User[];
}

const AddUserForm: React.FC<AddUserFormProps> = ({ onAdd, existingUsers }) => {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('Солдат');
  const [note, setNote] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const submitUser = async (forceDuplicate = false) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (!forceDuplicate && existingUsers && isDuplicateName(trimmedName, existingUsers)) {
      setShowDuplicateWarning(true);
      return;
    }

    await onAdd(trimmedName, rank, note.trim(), birthday || undefined);
    setName('');
    setNote('');
    setBirthday('');
    setShowDuplicateWarning(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitUser();
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label className="form-label small fw-medium">Військове звання</label>
        <select
          className="form-select form-select-sm"
          value={rank}
          onChange={(e) => setRank(e.target.value)}
        >
          {RANKS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Прізвище, ім'я, по-батькові</label>
        <input
          className="form-control form-control-sm"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setShowDuplicateWarning(false);
          }}
          placeholder="ШЕВЧЕНКО Тарас Григорович"
          required
          autoFocus
        />
        {showDuplicateWarning && (
          <div className="text-warning small mt-1">
            <i className="fas fa-exclamation-triangle me-1"></i>
            Можливо, така особа вже є в списку. Все одно додати?
          </div>
        )}
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Посада / Примітка</label>
        <input
          className="form-control form-control-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необов'язково"
        />
      </div>
      <div className="mb-3">
        <label className="form-label small fw-medium">Дата народження</label>
        <input
          type="date"
          className="form-control form-control-sm"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
        />
        <div className="form-text small">Необов'язково. Використовується для блокування наряду в день народження.</div>
      </div>
      {showDuplicateWarning ? (
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-warning btn-sm flex-grow-1"
            onClick={() => void submitUser(true)}
          >
            <i className="fas fa-exclamation-circle me-1"></i>
            Все одно додати
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => setShowDuplicateWarning(false)}
          >
            Скасувати
          </button>
        </div>
      ) : (
        <button className="btn btn-success w-100" disabled={!name.trim()}>
          <i className="fas fa-user-plus me-1"></i>Додати
        </button>
      )}
    </form>
  );
};

export default AddUserForm;
