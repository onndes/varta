import React, { useState } from 'react';
import { RANKS } from '../../utils/constants';

interface AddUserFormProps {
  onAdd: (name: string, rank: string, note: string) => Promise<void>;
}

/**
 * Add User Form Component
 * Form for creating new users
 */
const AddUserForm: React.FC<AddUserFormProps> = ({ onAdd }) => {
  const [name, setName] = useState('');
  const [rank, setRank] = useState('Солдат');
  const [note, setNote] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await onAdd(name, rank, note);

    // Reset form
    setName('');
    setRank('Солдат');
    setNote('');
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <h5 className="card-title mb-3">
          <i className="fas fa-user-plus me-2"></i>
          Додати нового бійця
        </h5>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-md-4">
              <label className="form-label">ПІБ *</label>
              <input
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Прізвище Ім'я По батькові"
                required
              />
            </div>
            <div className="col-md-3">
              <label className="form-label">Звання *</label>
              <select
                className="form-select"
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
            <div className="col-md-4">
              <label className="form-label">Примітка</label>
              <input
                type="text"
                className="form-control"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Додаткова інформація"
              />
            </div>
            <div className="col-md-1 d-flex align-items-end">
              <button type="submit" className="btn btn-primary w-100">
                <i className="fas fa-plus"></i>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUserForm;
