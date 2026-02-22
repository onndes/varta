import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { useUsers } from '../hooks';
import AddUserForm from './users/AddUserForm';
import UserRow from './users/UserRow';
import EditUserModal from './users/EditUserModal';
import UserStatsModal from './users/UserStatsModal';
import { useDialog } from './useDialog';

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
  const editingUserRef = useRef<User | null>(null);

  const { showConfirm } = useDialog();

  // ─── Auto-save: зберігати зміни бійця автоматично (debounce 600ms) ───
  const saveUser = useCallback(
    async (user: User) => {
      if (!user.id) return;
      await updateUser(user.id, {
        name: user.name,
        rank: user.rank,
        status: user.status,
        statusFrom: user.statusFrom,
        statusTo: user.statusTo,
        isActive: user.isActive,
        excludeFromAuto: user.excludeFromAuto,
        note: user.note,
        restBeforeStatus: user.restBeforeStatus,
        restAfterStatus: user.restAfterStatus,
        blockedDays: user.blockedDays,
        blockedDaysFrom: user.blockedDaysFrom,
        blockedDaysTo: user.blockedDaysTo,
        blockedDaysComment: user.blockedDaysComment,
        statusComment: user.status === 'OTHER' ? user.statusComment : undefined,
      });

      if (user.status !== 'ACTIVE' && user.statusFrom) {
        await updateCascadeTrigger(user.statusFrom);
      } else {
        await updateCascadeTrigger(new Date().toISOString().split('T')[0]);
      }

      await refreshData();
    },
    [updateUser, updateCascadeTrigger, refreshData]
  );

  useEffect(() => {
    // Пропустити перший рендер (відкриття модалки)
    if (!editingUser?.id) {
      editingUserRef.current = editingUser;
      return;
    }
    if (!editingUserRef.current?.id) {
      editingUserRef.current = editingUser;
      return;
    }
    // Пропустити якщо нічого не змінилось
    if (JSON.stringify(editingUser) === JSON.stringify(editingUserRef.current)) return;
    editingUserRef.current = editingUser;

    const t = setTimeout(() => {
      saveUser(editingUser);
      logAction('EDIT', `Редаговано: ${editingUser.name}`);
    }, 600);
    return () => clearTimeout(t);
  }, [editingUser]);

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

  const handleDelete = async (u: User) => {
    if (!u.id) return;
    if (!(await showConfirm('Видалити?'))) return;
    await deleteUserHook(u.id);
    const todayStr = new Date().toISOString().split('T')[0];
    await updateCascadeTrigger(todayStr);
    await logAction('DELETE', `Видалено: ${u.name}`);
    await refreshData();
  };

  const handleResetDebt = async (u: User) => {
    if (!u.id) return;
    if (!(await showConfirm('Скинути карму в 0?'))) return;
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
          <table className="table table-hover align-middle mb-0 table-align-center">
            <thead className="table-light small">
              <tr>
                <th className="text-start">Особа</th>
                <th style={{ width: '32%' }}>Статус</th>
                <th style={{ width: '120px' }}>Блокування</th>
                <th style={{ width: '76px' }}>Карма</th>
                <th className="text-end" style={{ width: '116px' }}>
                  Дії
                </th>
              </tr>
            </thead>
            <tbody>
              {users.filter((u) => u.isActive).length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    <i className="fas fa-users me-2"></i>Список порожній — додайте особу за
                    допомогою форми зліва
                  </td>
                </tr>
              ) : (
                users
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
                  ))
              )}
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
            <table className="table table-hover align-middle mb-0 table-align-center">
              <thead className="table-light small">
                <tr>
                  <th className="text-start">Особа</th>
                  <th style={{ width: '32%' }}>Статус</th>
                  <th style={{ width: '120px' }}>Блокування</th>
                  <th style={{ width: '76px' }}>Карма</th>
                  <th className="text-end" style={{ width: '116px' }}>
                    Дії
                  </th>
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
          onClose={() => setEditingUser(null)}
        />
      )}

      {viewStatsUser && (
        <UserStatsModal
          user={viewStatsUser}
          users={users}
          schedule={schedule}
          dayWeights={dayWeights}
          onClose={() => setViewStatsUser(null)}
        />
      )}
    </div>
  );
};

export default UsersView;
