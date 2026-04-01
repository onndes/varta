import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import AddUserForm from './users/AddUserForm';
import UserRow from './users/UserRow';
import EditUserModal from './users/EditUserModal';
import UserChangesReviewModal from './users/UserChangesReviewModal';
import UserStatsModal from './users/UserStatsModal';
import Modal from './Modal';
import { sortUsersBy, type SortKey, type SortDir } from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getFirstDutyDate } from '../utils/assignment';
import { useUserEditFlow } from '../hooks/useUserEditFlow';
import { useUsersActions } from '../hooks/useUsersActions';
import { UsersTableHead } from './users/UsersTableHead';

interface UsersViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  dayWeights: DayWeights;
  updateCascadeTrigger: (date: string) => Promise<void>;
}

/** Manages the full users list with add/edit/delete/stats modals. */
const UsersView: React.FC<UsersViewProps> = ({
  users,
  schedule,
  refreshData,
  logAction,
  dayWeights,
  updateCascadeTrigger,
}) => {
  const [viewStatsUser, setViewStatsUser] = useState<User | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };

  const {
    editingUser,
    setEditingUser,
    pendingEditReview,
    isApplyingEdit,
    handleStartEdit,
    handleCloseEditModal,
    handleCancelEditReview,
    handleDiscardEditChanges,
    handleApplyEditChanges,
    handleSaveDirectly,
  } = useUserEditFlow({ schedule, updateCascadeTrigger, refreshData, logAction });

  const { handleAdd, handleDelete } = useUsersActions({
    schedule,
    refreshData,
    logAction,
    updateCascadeTrigger,
    onAddDone: () => setShowAddModal(false),
  });

  const dutyUsers = useMemo(
    () =>
      users.filter(
        (u) =>
          u.isDutyMember === true ||
          (u.isDutyMember === undefined && u.isPersonnel !== false)
      ),
    [users]
  );

  const sortedActiveUsers = useMemo(() => {
    const active = dutyUsers.filter((u) => u.isActive);
    return sortKey ? sortUsersBy(active, sortKey, sortDir) : active;
  }, [dutyUsers, sortKey, sortDir]);

  const sortedInactiveUsers = useMemo(() => {
    const inactive = dutyUsers.filter((u) => !u.isActive);
    return sortKey ? sortUsersBy(inactive, sortKey, sortDir) : inactive;
  }, [dutyUsers, sortKey, sortDir]);

  const activeCount = sortedActiveUsers.length;
  const inactiveCount = sortedInactiveUsers.length;

  return (
    <div>
      {/* Header bar */}
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-users me-2 text-primary"></i>
            Чергові
          </h5>
          <span
            className="badge bg-primary bg-opacity-10 text-primary"
            style={{ fontSize: '0.75rem' }}
          >
            {activeCount} {activeCount === 1 ? 'черговий' : activeCount < 5 ? 'чергових' : 'чергових'}
          </span>
        </div>
        <button className="btn btn-success btn-sm" onClick={() => setShowAddModal(true)}>
          <i className="fas fa-user-plus me-1"></i>Додати чергового
        </button>
      </div>

      {/* Active users */}
      <div className="card shadow-sm border-0 mb-3">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 users-table">
            <UsersTableHead sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <tbody>
              {activeCount === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-5">
                    <i
                      className="fas fa-user-plus me-2"
                      style={{ fontSize: '1.5rem', opacity: 0.4 }}
                    ></i>
                    <div className="mt-2">Список порожній</div>
                    <button
                      className="btn btn-outline-success btn-sm mt-2"
                      onClick={() => setShowAddModal(true)}
                    >
                      Додати першого чергового
                    </button>
                  </td>
                </tr>
              ) : (
                sortedActiveUsers.map((u, idx) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    allUsers={dutyUsers}
                    rowNumber={idx + 1}
                    onEdit={handleStartEdit}
                    onDelete={handleDelete}
                    onViewStats={setViewStatsUser}
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
              <UsersTableHead sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <tbody>
                {sortedInactiveUsers.map((u, idx) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    allUsers={dutyUsers}
                    rowNumber={idx + 1}
                    onEdit={handleStartEdit}
                    onDelete={handleDelete}
                    onViewStats={setViewStatsUser}
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
        title="Додати нового чергового"
        size="modal-sm"
      >
        <AddUserForm onAdd={handleAdd} existingUsers={dutyUsers} />
      </Modal>

      {editingUser && !pendingEditReview && (
        <EditUserModal
          user={editingUser}
          onChange={setEditingUser}
          onClose={() => handleCloseEditModal(dutyUsers)}
          onSave={() => handleSaveDirectly()}
          isSaving={isApplyingEdit}
          computedFairnessDate={(() => {
            const dates = Object.keys(schedule).sort();
            return dates[0] || toLocalISO(new Date());
          })()}
          firstDutyDate={editingUser.id ? getFirstDutyDate(schedule, editingUser.id) : undefined}
          allUsers={dutyUsers}
        />
      )}

      {pendingEditReview && (
        <UserChangesReviewModal
          show={true}
          userName={pendingEditReview.draft.name}
          changes={pendingEditReview.changes}
          isApplying={isApplyingEdit}
          onApply={() => void handleApplyEditChanges()}
          onDiscard={handleDiscardEditChanges}
          onCancel={handleCancelEditReview}
        />
      )}

      {viewStatsUser && (
        <UserStatsModal
          user={viewStatsUser}
          users={dutyUsers}
          schedule={schedule}
          dayWeights={dayWeights}
          onClose={() => setViewStatsUser(null)}
        />
      )}
    </div>
  );
};

export default UsersView;
