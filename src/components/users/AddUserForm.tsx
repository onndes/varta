import React, { useState } from 'react';
import { RANKS } from '../../utils/constants';

interface AddUserFormProps {
  onAdd: (name: string, rank: string, note: string) => Promise<void>;
}

const AddUserForm: React.FC<AddUserFormProps> = ({ onAdd }) => {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('Солдат');
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name, rank, note);
    setName('');
    setNote('');
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
          onChange={(e) => setName(e.target.value)}
          placeholder="ШЕВЧЕНКО Тарас Григорович"
          required
          autoFocus
        />
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
      <button className="btn btn-success w-100" disabled={!name.trim()}>
        <i className="fas fa-user-plus me-1"></i>Додати
      </button>
    </form>
  );
};

export default AddUserForm;
