import React, { useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { RANKS, STATUSES, DAY_NAMES_FULL } from '../utils/constants';
import { formatRank } from '../utils/helpers';
import { useUsers } from '../hooks';
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
  const { createUser, updateUser, deleteUser: deleteUserHook, resetUserDebt } = useUsers();

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [viewStatsUser, setViewStatsUser] = useState<User | null>(null);

  const [newName, setNewName] = useState('');
  const [newRank, setNewRank] = useState('Солдат');
  const [newNote, setNewNote] = useState('');

  // Add new user
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    await createUser({
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
    await refreshData();
  };

  // Save edited user
  const handleSaveEdit = async () => {
    if (!editingUser || !editingUser.id) return;

    await updateUser(editingUser.id, {
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
    } else if (!editingUser.isActive || editingUser.status === 'ACTIVE') {
      const today = new Date().toISOString().split('T')[0];
      await updateCascadeTrigger(today);
    }

    await logAction('EDIT', `Редаговано: ${editingUser.name}`);
    setEditingUser(null);
    await refreshData();
  };

  // Delete user
  const handleDeleteUser = async (u: User) => {
    if (!u.id) return;
    if (confirm('Видалити?')) {
      await deleteUserHook(u.id);
      await logAction('DELETE', `Видалено: ${u.name}`);
      await refreshData();
    }
  };

  // Reset debt
  const handleResetDebt = async (u: User) => {
    if (!u.id) return;
    if (confirm('Скинути баланс (карму) в 0?')) {
      await resetUserDebt(u.id);
      await refreshData();
    }
  };

  // Calculate user stats
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
      {/* ADD USER FORM */}
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

      {/* USERS TABLE */}
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
                                day: '2-digit',
                                month: '2-digit',
                              })
                            : ''}
                          {u.statusFrom && u.statusTo && ' - '}
                          {u.statusTo
                            ? new Date(u.statusTo).toLocaleDateString('uk-UA', {
                                day: '2-digit',
                                month: '2-digit',
                              })
                            : ''}
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={u.debt > 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}>
                      {u.debt > 0 ? '+' : ''}
                      {u.debt.toFixed(1)}
                    </span>
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-sm btn-outline-secondary me-1"
                      onClick={() => setEditingUser({ ...u })}
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    {u.debt !== 0 && (
                      <button
                        className="btn btn-sm btn-outline-warning me-1"
                        onClick={() => handleResetDebt(u)}
                      >
                        <i className="fas fa-undo"></i>
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDeleteUser(u)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT USER MODAL */}
      {editingUser && (
        <Modal
          show={!!editingUser}
          onClose={() => setEditingUser(null)}
          title="Редагування"
          size="modal-lg"
        >
          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="small text-muted">Військове звання</label>
              <select
                className="form-select"
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
            <div className="col-md-6 mb-3">
              <label className="small text-muted">Статус</label>
              <select
                className="form-select"
                value={editingUser.status}
                onChange={(e) =>
                  setEditingUser({
                    ...editingUser,
                    status: e.target.value as User['status'],
                  })
                }
              >
                {Object.keys(STATUSES).map((st) => (
                  <option key={st} value={st}>
                    {STATUSES[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {editingUser.status !== 'ACTIVE' && (
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="small text-muted">Дата початку</label>
                <input
                  type="date"
                  className="form-control"
                  value={editingUser.statusFrom}
                  onChange={(e) => setEditingUser({ ...editingUser, statusFrom: e.target.value })}
                />
              </div>
              <div className="col-md-6 mb-3">
                <label className="small text-muted">Дата завершення</label>
                <input
                  type="date"
                  className="form-control"
                  value={editingUser.statusTo}
                  onChange={(e) => setEditingUser({ ...editingUser, statusTo: e.target.value })}
                />
              </div>
              <div className="col-12 mb-3">
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={editingUser.restAfterStatus}
                    onChange={(e) =>
                      setEditingUser({
                        ...editingUser,
                        restAfterStatus: e.target.checked,
                      })
                    }
                  />
                  <label className="form-check-label small">
                    Відпочинок після завершення статусу
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="mb-3">
            <label className="small text-muted">Посада / Примітка</label>
            <input
              className="form-control"
              value={editingUser.note}
              onChange={(e) => setEditingUser({ ...editingUser, note: e.target.value })}
            />
          </div>

          <div className="mb-3">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                checked={editingUser.isActive}
                onChange={(e) => setEditingUser({ ...editingUser, isActive: e.target.checked })}
              />
              <label className="form-check-label">Активний (бере участь у варті)</label>
            </div>
          </div>

          <button className="btn btn-primary w-100" onClick={handleSaveEdit}>
            ЗБЕРЕГТИ
          </button>
        </Modal>
      )}

      {/* STATS MODAL */}
      {viewStatsUser && (
        <Modal
          show={!!viewStatsUser}
          onClose={() => setViewStatsUser(null)}
          title={`${formatRank(viewStatsUser.rank)} ${viewStatsUser.name}`}
          size="modal-lg"
        >
          {(() => {
            const stats = getStats(viewStatsUser);
            return (
              <div>
                <div className="alert alert-secondary mb-3">
                  <strong>Перше чергування:</strong> {stats.firstDuty}
                </div>
                <div className="row mb-3">
                  <div className="col-6">
                    <div className="card bg-light">
                      <div className="card-body text-center">
                        <h3 className="fw-bold mb-0">{stats.totalAssignments}</h3>
                        <small className="text-muted">Всього днів</small>
                      </div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="card bg-light">
                      <div className="card-body text-center">
                        <h3 className="fw-bold mb-0">{stats.totalLoad}</h3>
                        <small className="text-muted">Навантаження (з вагою)</small>
                      </div>
                    </div>
                  </div>
                </div>
                <table className="table table-sm table-bordered">
                  <thead className="table-light">
                    <tr>
                      <th>День тижня</th>
                      <th className="text-end">Кількість</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
                      const dayNum = parseInt(dayKey, 10);
                      return (
                        <tr key={dayNum}>
                          <td>{DAY_NAMES_FULL[dayNum]}</td>
                          <td className="text-end">{stats.daysCount[dayNum] || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};

export default UsersView;
