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
    <div className="card shadow-sm border-0 p-3 mb-3">
      <h6 className="fw-bold text-muted mb-3">НОВИЙ БОЄЦЬ</h6>
      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="small text-muted">Військове звання</label>
          <select className="form-select form-select-sm" value={rank} onChange={(e) => setRank(e.target.value)}>
            {RANKS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </div>
        <div className="mb-2">
          <label className="small text-muted">Прізвище, ім'я, по-батькові</label>
          <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="mb-3">
          <label className="small text-muted">Посада / Примітка</label>
          <input className="form-control form-control-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn btn-success btn-sm w-100">ДОДАТИ</button>
      </form>
    </div>
  );
};

export default AddUserForm;
