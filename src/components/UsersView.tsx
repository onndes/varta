import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { useUsers } from '../hooks';
import AddUserForm from './users/AddUserForm';
import UserRow from './users/UserRow';
import EditUserModal from './users/EditUserModal';
import UserStatsModal from './users/UserStatsModal';
import Modal from './Modal';
import { useDialog } from './useDialog';
import { sortUsersBy, type SortKey, type SortDir } from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getFirstDutyDate } from '../utils/assignment';

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
  const [showAddModal, setShowAddModal] = useState(false);
  const editingUserRef = useRef<User | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { showConfirm } = useDialog();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };

  const sortedActiveUsers = useMemo(() => {
    const active = users.filter((u) => u.isActive);
    return sortKey ? sortUsersBy(active, sortKey, sortDir) : active;
  }, [users, sortKey, sortDir]);

  const sortedInactiveUsers = useMemo(() => {
    const inactive = users.filter((u) => !u.isActive);
    return sortKey ? sortUsersBy(inactive, sortKey, sortDir) : inactive;
  }, [users, sortKey, sortDir]);

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
        dateAddedToAuto: user.dateAddedToAuto,
        incompatibleWith: user.incompatibleWith,
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
  }, [editingUser, saveUser, logAction]);

  const handleAdd = async (name: string, rank: string, note: string) => {
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
    setShowAddModal(false);
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

  const activeCount = sortedActiveUsers.length;
  const inactiveCount = sortedInactiveUsers.length;

  const renderSortBtn = (key: SortKey, label: string, icon?: string) => (
    <span
      className={`users-sort-btn ${sortKey === key ? 'users-sort-btn--active' : ''}`}
      onClick={() => toggleSort(key)}
      title={`Сортувати за ${label.toLowerCase()}`}
    >
      {icon && <i className={`fas ${icon} me-1`} style={{ fontSize: '0.6rem' }}></i>}
      {label}
      {sortKey === key && <span className="ms-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </span>
  );

  const renderTableHead = () => (
    <thead>
      <tr className="users-table__head">
        <th
          className="text-start ps-3"
          style={{
            userSelect: 'none',
            width: '96px',
            minWidth: '96px',
            maxWidth: '96px',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="d-flex align-items-center gap-1">
            {renderSortBtn('rank', 'Звання', 'fa-medal')}
          </div>
        </th>
        <th className="text-start" style={{ userSelect: 'none' }}>
          <div className="d-flex align-items-center gap-1">{renderSortBtn('name', 'ПІБ')}</div>
        </th>
        <th className="text-start" style={{ width: '22%' }}>
          Статус
        </th>
        <th className="text-center" style={{ width: '14%' }}>
          Блокування
        </th>
        <th className="text-center" style={{ width: '10%' }}>
          Карма
        </th>
        <th className="text-end pe-3" style={{ width: '14%' }}>
          Дії
        </th>
      </tr>
    </thead>
  );

  return (
    <div>
      {/* Header bar */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-users me-2 text-primary"></i>
            Особовий склад
          </h5>
          <span
            className="badge bg-primary bg-opacity-10 text-primary"
            style={{ fontSize: '0.75rem' }}
          >
            {activeCount} {activeCount === 1 ? 'особа' : activeCount < 5 ? 'особи' : 'осіб'}
          </span>
        </div>
        <button className="btn btn-success btn-sm" onClick={() => setShowAddModal(true)}>
          <i className="fas fa-user-plus me-1"></i>Додати особу
        </button>
      </div>

      {/* Active users */}
      <div className="card shadow-sm border-0 mb-3">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 users-table">
            {renderTableHead()}
            <tbody>
              {activeCount === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    <i
                      className="fas fa-user-plus me-2"
                      style={{ fontSize: '1.5rem', opacity: 0.4 }}
                    ></i>
                    <div className="mt-2">Список порожній</div>
                    <button
                      className="btn btn-outline-success btn-sm mt-2"
                      onClick={() => setShowAddModal(true)}
                    >
                      Додати першу особу
                    </button>
                  </td>
                </tr>
              ) : (
                sortedActiveUsers.map((u) => (
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
      </div>

      {/* Inactive users */}
      {inactiveCount > 0 && (
        <div className="card shadow-sm border-0">
          <div
            className="card-header py-2"
            style={{ background: 'var(--bs-tertiary-bg, #f8f9fa)' }}
          >
            <h6 className="mb-0 fw-bold text-muted small">
              <i className="fas fa-user-slash me-2"></i>
              Неактивні ({inactiveCount})
            </h6>
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 users-table">
              {renderTableHead()}
              <tbody>
                {sortedInactiveUsers.map((u) => (
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
      )}

      {/* Add user modal */}
      <Modal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Додати нову особу"
        size="modal-sm"
      >
        <AddUserForm onAdd={handleAdd} />
      </Modal>

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onChange={setEditingUser}
          onClose={() => setEditingUser(null)}
          computedFairnessDate={(() => {
            const dates = Object.keys(schedule).sort();
            return dates[0] || toLocalISO(new Date());
          })()}
          firstDutyDate={editingUser.id ? getFirstDutyDate(schedule, editingUser.id) : undefined}
          allUsers={users}
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
