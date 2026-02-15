import React, { useState } from 'react';
import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { RANKS, STATUSES, DAY_NAMES_FULL } from '../utils/constants';
import { formatRank, toLocalISO } from '../utils/helpers';
import Modal from './Modal';

interface UsersViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  dayWeights: DayWeights;
  updateCascadeTrigger: (date: string) => Promise<void>;
}

const UsersView: React.FC<UsersViewProps> = ({
  users,
  schedule,
  refreshData,
  logAction,
  dayWeights,
  updateCascadeTrigger,
}) => {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [viewStatsUser, setViewStatsUser] = useState<User | null>(null);

  const [newName, setNewName] = useState('');
  const [newRank, setNewRank] = useState('Солдат');
  const [newNote, setNewNote] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await db.users.add({
      name: newName,
      rank: newRank,
      status: 'ACTIVE',
      isActive: true,
      note: newNote,
      debt: 0.0,
      statusFrom: '',
      statusTo: '',
      restAfterStatus: false,
      owedDays: {},
    });
    await logAction('ADD', `Додано: ${newName}`);
    setNewName('');
    setNewNote('');
    refreshData();
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editingUser.id) return;

    await db.users.update(editingUser.id, {
      rank: editingUser.rank,
      status: editingUser.status,
      statusFrom: editingUser.statusFrom,
      statusTo: editingUser.statusTo,
      isActive: editingUser.isActive,
      note: editingUser.note,
      restAfterStatus: editingUser.restAfterStatus,
    });

    // Trigger recalc if status changed affecting availability
    if (editingUser.status !== 'ACTIVE' && editingUser.statusFrom) {
      await updateCascadeTrigger(editingUser.statusFrom);
    } else if (!editingUser.isActive) {
      await updateCascadeTrigger(toLocalISO(new Date()));
    } else if (editingUser.status === 'ACTIVE') {
      await updateCascadeTrigger(toLocalISO(new Date()));
    }

    setEditingUser(null);
    refreshData();
    await logAction('EDIT', `Редаговано: ${editingUser.name}`);
  };

  const deleteUser = async (u: User) => {
    if (!u.id) return;
    if (confirm('Видалити?')) {
      await db.users.delete(u.id);
      refreshData();
      await logAction('DELETE', `Видалено: ${u.name}`);
    }
  };

  const resetDebt = async (u: User) => {
    if (!u.id) return;
    if (confirm('Скинути баланс (карму) в 0?')) {
      await db.users.update(u.id, { debt: 0 });
      refreshData();
    }
  };

  const getStats = (user: User) => {
    if (!user.id)
      return {
        totalAssignments: 0,
        daysCount: {} as Record<number, number>,
        firstDuty: '-',
        totalLoad: '0',
      };

    const userSchedule = Object.values(schedule).filter((s) => s.userId === user.id);
    const totalAssignments = userSchedule.length;

    const dates = userSchedule.map((s) => s.date).sort();
    const firstDuty = dates.length > 0 ? new Date(dates[0]).toLocaleDateString('uk-UA') : 'Немає';

    const daysCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let totalLoad = 0;

    userSchedule.forEach((s) => {
      const d = new Date(s.date).getDay();
      daysCount[d]++;
      totalLoad += dayWeights[d] || 1.0;
    });

    return { totalAssignments, daysCount, firstDuty, totalLoad: totalLoad.toFixed(1) };
  };

  return (
    <div className="row">
      <div className="col-lg-3 mb-4">
        <div className="card shadow-sm border-0 p-3 mb-3">
          <h6 className="fw-bold text-muted mb-3">НОВИЙ БОЄЦЬ</h6>
          <form onSubmit={handleAdd}>
            <div className="mb-2">
              <label className="small text-muted">Військове звання</label>
              <select
                className="form-select form-select-sm"
                value={newRank}
                onChange={(e) => setNewRank(e.target.value)}
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-2">
              <label className="small text-muted">Прізвище, ім'я, по-батькові</label>
              <input
                className="form-control form-control-sm"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
              />
            </div>
            <div className="mb-3">
              <label className="small text-muted">Посада / Примітка</label>
              <input
                className="form-control form-control-sm"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </div>
            <button className="btn btn-success btn-sm w-100">ДОДАТИ</button>
          </form>
        </div>
      </div>

      <div className="col-lg-9">
        <div className="card shadow-sm border-0">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light small">
              <tr>
                <th>Боєць</th>
                <th>Статус</th>
                <th>Баланс</th>
                <th className="text-end">Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={!u.isActive ? 'user-row-inactive' : ''}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setViewStatsUser(u)}>
                    <small
                      className="d-block text-muted text-uppercase"
                      style={{ fontSize: '0.7rem' }}
                    >
                      {formatRank(u.rank)}
                    </small>
                    <span className="fw-bold">{u.name}</span>
                    <div className="small text-muted">{u.note}</div>
                  </td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className={`badge ${u.isActive ? (u.status === 'ACTIVE' ? 'bg-success' : 'bg-warning text-dark') : 'bg-secondary'}`}
                      >
                        {u.isActive ? STATUSES[u.status] : 'НЕАКТИВНИЙ'}
                      </span>
                      {(u.statusFrom || u.statusTo) && u.isActive && u.status !== 'ACTIVE' && (
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {u.statusFrom
                            ? new Date(u.statusFrom).toLocaleDateString('uk-UA', {
                                day: 'numeric',
                                month: 'numeric',
                              })
                            : '...'}
                          {' - '}
                          {u.statusTo
                            ? new Date(u.statusTo).toLocaleDateString('uk-UA', {
                                day: 'numeric',
                                month: 'numeric',
                              })
                            : '...'}
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`fw-bold ${u.debt > 0 ? 'text-success' : u.debt < 0 ? 'text-danger' : ''}`}
                    >
                      {u.debt > 0 ? `+${u.debt}` : u.debt}
                    </span>
                    <div className="small text-muted" style={{ fontSize: '0.7rem' }}>
                      {u.debt > 0 ? 'Працював більше' : u.debt < 0 ? 'Винен' : 'Норма'}
                    </div>
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-secondary me-1"
                      onClick={() => resetDebt(u)}
                      title="Скинути баланс"
                    >
                      <i className="fas fa-undo"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => setEditingUser(u)}
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => deleteUser(u)}>
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal show={!!editingUser} onClose={() => setEditingUser(null)} title="Редагування">
        {editingUser && (
          <div>
            <div className="mb-3 bg-light p-3 rounded">
              <div className="d-flex align-items-center justify-content-between">
                <label className="fw-bold mb-0">В строю (Активний)</label>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    style={{ width: '3em', height: '1.5em' }}
                    checked={editingUser.isActive}
                    onChange={(e) => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                  />
                </div>
              </div>
            </div>

            <div className="row g-2 mb-2">
              <div className="col-6">
                <label className="small text-muted">Звання</label>
                <select
                  className="form-select form-select-sm"
                  value={editingUser.rank}
                  onChange={(e) => setEditingUser({ ...editingUser, rank: e.target.value })}
                >
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6">
                <label className="small text-muted">Примітка</label>
                <input
                  className="form-control form-control-sm"
                  value={editingUser.note || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, note: e.target.value })}
                />
              </div>
            </div>

            <div className="mb-2">
              <label className="small text-muted">Поточний статус</label>
              <select
                className="form-select form-select-sm"
                value={editingUser.status}
                onChange={(e) =>
                  setEditingUser({ ...editingUser, status: e.target.value as User['status'] })
                }
              >
                {Object.keys(STATUSES).map((k) => (
                  <option key={k} value={k}>
                    {STATUSES[k]}
                  </option>
                ))}
              </select>
            </div>

            {editingUser.status !== 'ACTIVE' && (
              <div className="row g-2 mb-3 bg-light p-2 rounded border">
                <div className="col-6">
                  <label className="small text-muted">З дати</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={editingUser.statusFrom || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, statusFrom: e.target.value })}
                  />
                </div>
                <div className="col-6">
                  <label className="small text-muted">По дату</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={editingUser.statusTo || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, statusTo: e.target.value })}
                  />
                </div>
                <div className="col-12 mt-2">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={editingUser.restAfterStatus || false}
                      onChange={(e) =>
                        setEditingUser({ ...editingUser, restAfterStatus: e.target.checked })
                      }
                    />
                    <label className="form-check-label small">
                      Не ставити в наряд на наступний день (відпочинок)
                    </label>
                  </div>
                </div>
              </div>
            )}
            <button className="btn btn-primary w-100" onClick={handleSaveEdit}>
              Зберегти зміни
            </button>
          </div>
        )}
      </Modal>

      <Modal show={!!viewStatsUser} onClose={() => setViewStatsUser(null)} title="Особова справа">
        {viewStatsUser && (
          <div>
            <h4 className="mb-0">{viewStatsUser.name}</h4>
            <p className="text-muted mb-3">
              {formatRank(viewStatsUser.rank)} | {viewStatsUser.note}
            </p>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <div className="p-3 border rounded text-center bg-light h-100">
                  <small className="text-muted d-block">Поточний Баланс</small>
                  <h2
                    className={`mb-0 ${viewStatsUser.debt > 0 ? 'text-success' : viewStatsUser.debt < 0 ? 'text-danger' : ''}`}
                  >
                    {viewStatsUser.debt > 0 ? `+${viewStatsUser.debt}` : viewStatsUser.debt}
                  </h2>
                </div>
              </div>
              <div className="col-6">
                <div className="p-3 border rounded text-center bg-light h-100">
                  <small className="text-muted d-block">Навантаження (Бал)</small>
                  <h2 className="mb-0 text-dark fw-bold">{getStats(viewStatsUser).totalLoad}</h2>
                </div>
              </div>
            </div>

            <div className="alert alert-info py-2 small mb-3">
              <i className="fas fa-calendar-alt me-2"></i>
              Перше чергування: <strong>{getStats(viewStatsUser).firstDuty}</strong>
            </div>

            <div className="mb-4">
              <h6 className="small text-muted text-uppercase fw-bold">Розподіл по днях тижня</h6>
              <div className="d-flex justify-content-between text-center small border rounded p-2 bg-light">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <div key={d}>
                    <div className="text-muted mb-1" style={{ fontSize: '0.7rem' }}>
                      {DAY_NAMES_FULL[d].substring(0, 2)}
                    </div>
                    <div className="fw-bold">{getStats(viewStatsUser).daysCount[d]}</div>
                    {viewStatsUser.owedDays && viewStatsUser.owedDays[d] > 0 && (
                      <div className="text-danger fw-bold" style={{ fontSize: '0.6rem' }}>
                        +{viewStatsUser.owedDays[d]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UsersView;
