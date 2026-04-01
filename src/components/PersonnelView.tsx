import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry } from '../types';
import * as userService from '../services/userService';
import { useDialog } from './useDialog';
import Modal from './Modal';
import AddUserForm from './users/AddUserForm';
import { toLocalISO } from '../utils/dateUtils';
import { compareByRankAndName } from '../utils/helpers';

interface PersonnelViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
}

const PersonnelView: React.FC<PersonnelViewProps> = (props) => {
  const { users, refreshData, logAction, updateCascadeTrigger } = props;
  const { showConfirm } = useDialog();
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'rank' | 'name'>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const searchValue = searchQuery.trim().toLocaleLowerCase('uk-UA');

  const filteredUsers = useMemo(() => {
    const baseUsers = searchValue
      ? users.filter((user) => {
          const name = user.name.toLocaleLowerCase('uk-UA');
          const rank = user.rank.toLocaleLowerCase('uk-UA');
          return name.includes(searchValue) || rank.includes(searchValue);
        })
      : users;

    return [...baseUsers].sort((a, b) => {
      let result =
        sortKey === 'rank'
          ? compareByRankAndName(a, b)
          : a.name.localeCompare(b.name, 'uk');
      if (sortDir === 'desc') {
        result *= -1;
      }
      return result;
    });
  }, [searchValue, sortDir, sortKey, users]);

  const selectedUser =
    filteredUsers.find((user) => user.id !== undefined && user.id === selectedUserId) ?? null;

  const toggleSort = (nextKey: 'rank' | 'name') => {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDir('asc');
  };

  const formatBirthday = (birthday?: string) => {
    if (!birthday) return '—';
    return new Date(`${birthday}T00:00:00`).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const splitName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return {
      surname: (parts[0] || '').toUpperCase(),
      rest: parts.slice(1).join(' '),
    };
  };

  const handleToggleInDuty = async (user: User) => {
    if (!user.id) return;

    if (user.isPersonnel !== false && user.isActive) {
      await userService.updateUser(user.id, { isPersonnel: false, isActive: false });
      await logAction('EDIT', `${user.name}: прибрано з черги`);
    } else {
      const todayStr = toLocalISO(new Date());
      const dateAddedToAuto = user.dateAddedToAuto || todayStr;
      await userService.updateUser(user.id, {
        isPersonnel: true,
        isActive: true,
        dateAddedToAuto,
      });
      await logAction('EDIT', `${user.name}: додано до черги`);
    }

    await updateCascadeTrigger(toLocalISO(new Date()));
    await refreshData();
  };

  const handleAddPersonnel = async (name: string, rank: string, note: string) => {
    await userService.createUser({
      name,
      rank,
      note,
      status: 'ACTIVE',
      isActive: false,
      isPersonnel: true,
      excludeFromAuto: false,
      debt: 0,
      owedDays: {},
      statusPeriods: [],
      restAfterStatus: false,
      dateAddedToAuto: undefined,
    });
    await logAction('ADD', `Додано до особового складу: ${name}`);
    await refreshData();
    setShowAddModal(false);
  };

  const handleDeleteUser = async (user: User) => {
    if (!user.id) return;
    if (!(await showConfirm('Видалити особу з особового складу?'))) return;

    await userService.deleteUser(user.id);
    await updateCascadeTrigger(toLocalISO(new Date()));
    await logAction('DELETE', `Видалено з особового складу: ${user.name}`);
    await refreshData();
    setSelectedUserId((current) => (current === user.id ? null : current));
  };

  const inDutyCount = users.filter((user) => user.isPersonnel !== false && user.isActive).length;
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-id-card me-2 text-primary"></i>
            Особовий склад
          </h5>
          <span className="badge bg-primary bg-opacity-10 text-primary">{users.length}</span>
        </div>

        <div className="flex-grow-1" style={{ maxWidth: '360px' }}>
          <input
            type="text"
            className="form-control form-control-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за ПІБ або званням..."
          />
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => setShowAddModal(true)}
          >
            <i className="fas fa-plus me-1"></i>
            Додати
          </button>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm"
            disabled={!selectedUser}
            onClick={() => {
              if (selectedUser) {
                void handleDeleteUser(selectedUser);
              }
            }}
          >
            <i className="fas fa-trash me-1"></i>
            Видалити
          </button>
        </div>
      </div>

      <div className="card shadow-sm border-0">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th
                  className="text-center"
                  style={{ width: '56px', minWidth: '56px', maxWidth: '56px' }}
                >
                  #
                </th>
                <th style={{ width: '120px', minWidth: '120px' }}>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    onClick={() => toggleSort('rank')}
                  >
                    Звання {sortKey === 'rank' && (sortDir === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    onClick={() => toggleSort('name')}
                  >
                    ПІБ {sortKey === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th style={{ width: '180px', minWidth: '180px' }}>Дата народження</th>
                <th className="text-center" style={{ width: '110px', minWidth: '110px' }}>
                  В черзі
                </th>
                <th className="text-end" style={{ width: '90px', minWidth: '90px' }}>
                  Дії
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-5">
                    {hasQuery
                      ? `Нічого не знайдено за запитом «${searchQuery.trim()}»`
                      : 'Особовий склад порожній. Додайте першу особу або імпортуйте з Excel.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user, index) => {
                  const { surname, rest } = splitName(user.name);
                  const isSelected = selectedUser?.id === user.id;
                  const isInDutyQueue = user.isActive && user.isPersonnel !== false;

                  return (
                    <tr
                      key={user.id ?? `${user.name}-${index}`}
                      className={isSelected ? 'table-active' : undefined}
                      onClick={() => setSelectedUserId(user.id ?? null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="text-center text-muted">{index + 1}</td>
                      <td>
                        <small
                          className="text-muted text-uppercase"
                          style={{ fontSize: '0.75rem' }}
                        >
                          {user.rank}
                        </small>
                      </td>
                      <td>
                        <div className="fw-bold" style={{ letterSpacing: '0.02em' }}>
                          {surname}
                        </div>
                        {rest && (
                          <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                            {rest}
                          </div>
                        )}
                      </td>
                      <td>{formatBirthday(user.birthday)}</td>
                      <td className="text-center">
                        <div
                          className="form-check form-switch d-inline-flex justify-content-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={isInDutyQueue}
                            onChange={() => void handleToggleInDuty(user)}
                            title={isInDutyQueue ? 'Прибрати з черги' : 'Додати до черги'}
                          />
                        </div>
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          title="Видалити"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteUser(user);
                          }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="card-footer bg-white text-muted small">
          Всього: {users.length} | В черзі: {inDutyCount}
        </div>
      </div>

      <Modal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Додати особу"
        size="modal-sm"
      >
        <AddUserForm onAdd={handleAddPersonnel} />
      </Modal>
    </div>
  );
};

export default PersonnelView;
