import React, { useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { useUsers } from '../hooks';
import AddUserForm from './users/AddUserForm';
import UserRow from './users/UserRow';
import EditUserModal from './users/EditUserModal';
import UserStatsModal from './users/UserStatsModal';

import { toLocalISO } from '../utils/dateUtils';

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

  const handleAdd = async (name: string, rank: string, note: string) => {
    // Set dateAddedToAuto to the day AFTER the last existing schedule entry.
    // This ensures the new user isn't compared against assignments that were
    // generated before they joined the pool.
    const scheduleDates = Object.keys(schedule).sort();
    const lastScheduleDate = scheduleDates[scheduleDates.length - 1];

    const today = new Date();
    const todayStr = toLocalISO(today);

    let dateAddedToAuto = todayStr;
    if (lastScheduleDate && lastScheduleDate >= todayStr) {
      const nextDay = new Date(lastScheduleDate);
      nextDay.setDate(nextDay.getDate() + 1);
      dateAddedToAuto = toLocalISO(nextDay);
    }
    await createUser({
      name,
      rank,
      status: 'ACTIVE',
      isActive: true,
      excludeFromAuto: false,
      note,
      debt: 0.0,
      statusFrom: '',
      statusTo: '',
      restAfterStatus: false,
      owedDays: {},
      dateAddedToAuto,
    });
    await logAction('ADD', `Додано: ${name}`);
    await refreshData();
  };

  const handleSaveEdit = async () => {
    if (!editingUser?.id) return;

    await updateUser(editingUser.id, {
      rank: editingUser.rank,
      status: editingUser.status,
      statusFrom: editingUser.statusFrom,
      statusTo: editingUser.statusTo,
      isActive: editingUser.isActive,
      excludeFromAuto: editingUser.excludeFromAuto,
      note: editingUser.note,
      restBeforeStatus: editingUser.restBeforeStatus,
      restAfterStatus: editingUser.restAfterStatus,
      blockedDays: editingUser.blockedDays,
    });

    if (editingUser.status !== 'ACTIVE' && editingUser.statusFrom) {
      await updateCascadeTrigger(editingUser.statusFrom);
    } else {
      await updateCascadeTrigger(new Date().toISOString().split('T')[0]);
    }

    await logAction('EDIT', `Редаговано: ${editingUser.name}`);
    setEditingUser(null);
    await refreshData();
  };

  const handleDelete = async (u: User) => {
    if (!u.id || !confirm('Видалити?')) return;
    await deleteUserHook(u.id);
    const todayStr = new Date().toISOString().split('T')[0];
    await updateCascadeTrigger(todayStr);
    await logAction('DELETE', `Видалено: ${u.name}`);
    await refreshData();
  };

  const handleResetDebt = async (u: User) => {
    if (!u.id || !confirm('Скинути карму в 0?')) return;
    await resetUserDebt(u.id);
    await refreshData();
  };

  return (
    <div className="row">
      <div className="col-lg-3 mb-4">
        <AddUserForm onAdd={handleAdd} />
      </div>

      <div className="col-lg-9">
        {/* Active users */}
        <div className="card shadow-sm border-0 mb-3">
          <div className="card-header bg-white">
            <h6 className="mb-0 fw-bold">
              <i className="fas fa-users me-2 text-primary"></i>
              Основний склад
            </h6>
          </div>
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light small">
              <tr>
                <th>Боєць</th>
                <th>Статус</th>
                <th>Карма</th>
                <th className="text-end">Дії</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => u.isActive)
                .map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onEdit={setEditingUser}
                    onDelete={handleDelete}
                    onViewStats={setViewStatsUser}
                    onResetDebt={handleResetDebt}
                  />
                ))}
            </tbody>
          </table>
        </div>

        {/* Inactive users (separate section) */}
        {users.filter((u) => !u.isActive).length > 0 && (
          <div className="card shadow-sm border-0">
            <div className="card-header bg-light">
              <h6 className="mb-0 fw-bold text-muted">
                <i className="fas fa-user-slash me-2"></i>
                Особовий склад (відсутні)
              </h6>
            </div>
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light small">
                <tr>
                  <th>Боєць</th>
                  <th>Статус</th>
                  <th>Карма</th>
                  <th className="text-end">Дії</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => !u.isActive)
                  .map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onEdit={setEditingUser}
                      onDelete={handleDelete}
                      onViewStats={setViewStatsUser}
                      onResetDebt={handleResetDebt}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onChange={setEditingUser}
          onSave={handleSaveEdit}
          onClose={() => setEditingUser(null)}
        />
      )}

      {viewStatsUser && (
        <UserStatsModal
          user={viewStatsUser}
          schedule={schedule}
          dayWeights={dayWeights}
          onClose={() => setViewStatsUser(null)}
        />
      )}
    </div>
  );
};

export default UsersView;
