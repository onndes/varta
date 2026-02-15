import React, { useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { useUsers } from '../hooks';
import AddUserForm from './users/AddUserForm';
import UserRow from './users/UserRow';
import EditUserModal from './users/EditUserModal';
import UserStatsModal from './users/UserStatsModal';

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
    await createUser({
      name,
      rank,
      status: 'ACTIVE',
      isActive: true,
      note,
      debt: 0.0,
      statusFrom: '',
      statusTo: '',
      restAfterStatus: false,
      owedDays: {},
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
      note: editingUser.note,
      restAfterStatus: editingUser.restAfterStatus,
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
    await logAction('DELETE', `Видалено: ${u.name}`);
    await refreshData();
  };

  const handleResetDebt = async (u: User) => {
    if (!u.id || !confirm('Скинути баланс (карму) в 0?')) return;
    await resetUserDebt(u.id);
    await refreshData();
  };

  return (
    <div className="row">
      <div className="col-lg-3 mb-4">
        <AddUserForm onAdd={handleAdd} />
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
