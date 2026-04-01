import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry } from '../types';
import * as userService from '../services/userService';
import { useDialog } from './useDialog';
import Modal from './Modal';
import AddUserForm from './users/AddUserForm';
import ImportPersonnelModal from './users/ImportPersonnelModal';
import { toLocalISO } from '../utils/dateUtils';
import { compareByRankAndName, formatRank } from '../utils/helpers';

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
  const [showImportModal, setShowImportModal] = useState(false);
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

    if (user.isDutyMember === true) {
      await userService.updateUser(user.id, {
        isDutyMember: false,
        isActive: false,
      });
      await logAction('EDIT', `${user.name}: прибрано зі складу чергових`);
    } else {
      const todayStr = toLocalISO(new Date());
      await userService.updateUser(user.id, {
        isDutyMember: true,
        isActive: false,
        dateAddedToAuto: user.dateAddedToAuto || todayStr,
      });
      await logAction('EDIT', `${user.name}: додано до складу чергових`);
    }

    await updateCascadeTrigger(toLocalISO(new Date()));
    await refreshData();
  };

  const handleAddPersonnel = async (
    name: string,
    rank: string,
    note: string,
    birthday?: string
  ) => {
    await userService.createUser({
      name,
      rank,
      note,
      birthday,
      status: 'ACTIVE',
      isDutyMember: false,
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

  const dutyMemberCount = users.filter((user) => user.isDutyMember).length;
  const activeDutyCount = users.filter((user) => user.isDutyMember && user.isActive).length;
  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-id-card me-2 text-primary"></i>
            Особовий склад
          </h5>
          <span
            className="badge bg-primary bg-opacity-10 text-primary"
            style={{ fontSize: '0.75rem' }}
          >
            {users.length}
          </span>
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
            className="btn btn-outline-success btn-sm"
            onClick={() => setShowImportModal(true)}
          >
            <i className="fas fa-file-excel me-1"></i>
            Імпорт з Excel
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
          <table className="table table-sm table-hover align-middle mb-0 users-table">
            <thead>
              <tr className="users-table__head">
                <th
                  className="text-center"
                  style={{
                    width: '44px',
                    minWidth: '44px',
                    maxWidth: '44px',
                    userSelect: 'none',
                    fontSize: '0.78rem',
                  }}
                >
                  №
                </th>
                <th
                  className="text-start ps-3"
                  style={{
                    width: '190px',
                    minWidth: '190px',
                    userSelect: 'none',
                    fontSize: '0.8rem',
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    onClick={() => toggleSort('rank')}
                  >
                    Звання {sortKey === 'rank' && (sortDir === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th style={{ minWidth: '260px', userSelect: 'none', fontSize: '0.8rem' }}>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                    onClick={() => toggleSort('name')}
                  >
                    ПІБ {sortKey === 'name' && (sortDir === 'asc' ? '▲' : '▼')}
                  </button>
                </th>
                <th
                  style={{ width: '170px', minWidth: '170px', fontSize: '0.8rem', userSelect: 'none' }}
                >
                  Дата народження
                </th>
                <th
                  className="text-center"
                  style={{ width: '110px', minWidth: '110px', fontSize: '0.8rem', userSelect: 'none' }}
                >
                  В черзі
                </th>
                <th
                  className="text-end pe-3"
                  style={{ width: '90px', minWidth: '90px', fontSize: '0.8rem', userSelect: 'none' }}
                >
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
                  const isInDutyRoster = user.isDutyMember === true;
                  const isInactiveDutyMember = user.isDutyMember === true && !user.isActive;

                  return (
                    <tr
                      key={user.id ?? `${user.name}-${index}`}
                      className={isSelected ? 'table-active' : undefined}
                      onClick={() => setSelectedUserId(user.id ?? null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td
                        className="text-center text-muted ps-2"
                        style={{
                          width: '44px',
                          minWidth: '44px',
                          maxWidth: '44px',
                          fontSize: '0.75rem',
                        }}
                      >
                        {index + 1}
                      </td>
                      <td
                        className="text-start ps-3 align-top"
                        style={{
                          width: '190px',
                          minWidth: '190px',
                        }}
                      >
                        <small
                          className="text-muted text-uppercase"
                          style={{
                            fontSize: '0.7rem',
                            lineHeight: 1.15,
                            whiteSpace: 'normal',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            display: 'block',
                          }}
                        >
                          {formatRank(user.rank)}
                        </small>
                      </td>
                      <td className="align-top">
                        <div
                          className="fw-bold text-uppercase"
                          style={{ fontSize: '0.85rem', letterSpacing: '0.02em' }}
                        >
                          {surname}
                        </div>
                        {rest && (
                          <div className="text-muted" style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                            {rest}
                          </div>
                        )}
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.78rem' }}>
                        {formatBirthday(user.birthday)}
                      </td>
                      <td className="text-center">
                        <div
                          className="d-inline-flex flex-column align-items-center justify-content-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="form-check form-switch m-0">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              role="switch"
                              checked={isInDutyRoster}
                              onChange={() => void handleToggleInDuty(user)}
                              title={
                                isInDutyRoster
                                  ? 'Прибрати зі складу чергових'
                                  : 'Додати до складу чергових'
                              }
                            />
                          </div>
                          {isInactiveDutyMember && (
                            <span
                              className="text-muted"
                              style={{ fontSize: '0.7rem', opacity: 0.6 }}
                              title="Черговий тимчасово неактивний"
                            >
                              <i className="fas fa-pause-circle me-1"></i>неактивний
                            </span>
                          )}
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
          Всього: {users.length} | Чергових: {dutyMemberCount} | Активних: {activeDutyCount}
        </div>
      </div>

      <Modal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Додати особу"
        size="modal-sm"
      >
        <AddUserForm onAdd={handleAddPersonnel} existingUsers={users} />
      </Modal>

      <ImportPersonnelModal
        show={showImportModal}
        existingUsers={users}
        onClose={() => setShowImportModal(false)}
        onImported={async (count) => {
          setShowImportModal(false);
          await refreshData();
          await logAction('IMPORT_EXCEL', `Імпортовано з Excel: ${count} осіб`);
        }}
      />
    </div>
  );
};

export default PersonnelView;
