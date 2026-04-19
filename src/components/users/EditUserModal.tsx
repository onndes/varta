// src/components/users/EditUserModal.tsx
import React, { useState, useMemo } from 'react';
import type { User, UserStatusPeriod } from '../../types';
import { formatRank } from '../../utils/helpers';
import { getUserStatusPeriods, normalizeStatusPeriods } from '../../utils/userStatus';
import { getUserChangeSummary } from '../../utils/userEditDiff';
import { toLocalISO } from '../../utils/dateUtils';
import Modal from '../Modal';
import {
  BlockedDaysSection,
  IncompatiblePairsSection,
  AdvancedSettingsSection,
} from './EditUserModalSections';
import { StatusPeriodsSection } from './UserStatusPeriodsSection';

interface EditUserModalProps {
  user: User;
  baseUser?: User | null;
  onChange: (user: User) => void;
  onClose: () => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
  /** Computed fallback date (earliest schedule date or today) when dateAddedToAuto is not set */
  computedFairnessDate?: string;
  /** First duty date for this user (from schedule) */
  firstDutyDate?: string;
  /** All users (needed for incompatible pairs picker) */
  allUsers?: User[];
}

/**
 * Modal for editing a user's profile: status periods, availability flags,
 * blocked days, incompatible pairs, and advanced identity fields.
 */
const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  baseUser = null,
  onChange,
  onClose,
  onSave,
  isSaving = false,
  computedFairnessDate,
  firstDutyDate,
  allUsers = [],
}) => {
  const [incompatibleSearch, setIncompatibleSearch] = useState('');
  const todayStr = toLocalISO(new Date());
  // All status periods — including past ones (history shown in a collapsible section).
  const statusPeriods = useMemo(
    () => getUserStatusPeriods(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  /** IDs of users that list this user in their incompatibleWith (reverse links). */
  const reverseIncompatibleIds = useMemo(() => {
    if (!user.id) return [];
    return allUsers
      .filter(
        (u) =>
          u.id !== undefined && u.id !== user.id && (u.incompatibleWith || []).includes(user.id!)
      )
      .map((u) => u.id!);
  }, [allUsers, user.id]);

  /** Merged set of all incompatible user IDs (direct + reverse). */
  const incompatibleIds = useMemo(
    () =>
      Array.from(
        new Set(
          [...(user.incompatibleWith || []), ...reverseIncompatibleIds].filter(
            (id) => id !== user.id
          )
        )
      ).sort((a, b) => a - b),
    [user.incompatibleWith, reverseIncompatibleIds, user.id]
  );

  const otherUsers = useMemo(
    () => allUsers.filter((u) => u.id !== user.id && u.isActive),
    [allUsers, user.id]
  );

  const filteredOtherUsers = useMemo(() => {
    if (!incompatibleSearch.trim()) return [];
    const q = incompatibleSearch.toLowerCase();
    return otherUsers
      .filter(
        (u) =>
          !incompatibleIds.includes(u.id!) &&
          (u.name.toLowerCase().includes(q) || formatRank(u.rank).toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [otherUsers, incompatibleSearch, incompatibleIds]);

  const hasUnsavedChanges = useMemo(() => {
    if (!baseUser) return false;
    return getUserChangeSummary(baseUser, user, allUsers).length > 0;
  }, [allUsers, baseUser, user]);

  // ── Status period helpers ─────────────────────────────────────────────────
  const applyStatusPeriods = (nextPeriods: UserStatusPeriod[]) => {
    const normalized = normalizeStatusPeriods(nextPeriods);
    const first = normalized[0];
    onChange({
      ...user,
      statusPeriods: normalized,
      // Legacy fields kept for backward compatibility with older backups.
      status: first ? first.status : 'ACTIVE',
      statusFrom: first?.from,
      statusTo: first?.to,
      statusComment: first?.status === 'ABSENT' ? first.comment : undefined,
      restBeforeStatus: first?.restBefore || false,
      restAfterStatus: first?.restAfter || false,
    });
  };

  const addStatusPeriod = (initialFrom?: string) => {
    const from = initialFrom || todayStr;
    applyStatusPeriods([...statusPeriods, { status: 'TRIP', from, to: from }]);
  };

  const updateStatusPeriod = (index: number, patch: Partial<UserStatusPeriod>) => {
    applyStatusPeriods(statusPeriods.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const removeStatusPeriod = (index: number) => {
    applyStatusPeriods(statusPeriods.filter((_, i) => i !== index));
  };

  const footer = onSave ? (
    <button
      type="button"
      className={`btn ${hasUnsavedChanges ? 'btn-warning settings-save-button-dirty' : 'btn-primary'}`}
      onClick={() => void onSave()}
      disabled={isSaving}
    >
      <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'} me-2`}></i>
      {isSaving ? 'Збереження...' : 'Зберегти'}
    </button>
  ) : undefined;

  return (
    <Modal
      show={true}
      onClose={onClose}
      title={`Редагування: ${user.name}`}
      size="modal-lg"
      footer={footer}
    >
      <StatusPeriodsSection
        statusPeriods={statusPeriods}
        onUpdate={updateStatusPeriod}
        onRemove={removeStatusPeriod}
        onAdd={addStatusPeriod}
      />

      {/* Active / exclude toggles */}
      <div className="card border-primary mb-3">
        <div className="card-body">
          <div className="form-check form-switch mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="isActive"
              checked={user.isActive}
              onChange={(e) => onChange({ ...user, isActive: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <label
              className="form-check-label fw-bold"
              htmlFor="isActive"
              style={{ cursor: 'pointer' }}
            >
              <i className="fas fa-user-check me-2 text-primary"></i>Присутній в підрозділі
            </label>
            <div className="small text-muted mt-1">
              Якщо вимкнено — особа відсутня (показується сірим, тільки в окремій вкладці).
            </div>
          </div>

          <div className="form-check form-switch">
            <input
              type="checkbox"
              className="form-check-input"
              id="excludeFromAuto"
              checked={user.excludeFromAuto || false}
              onChange={(e) => onChange({ ...user, excludeFromAuto: e.target.checked })}
              style={{ cursor: 'pointer' }}
              disabled={!user.isActive}
            />
            <label
              className="form-check-label"
              htmlFor="excludeFromAuto"
              style={{ cursor: 'pointer' }}
            >
              <i className="fas fa-user-times me-2 text-warning"></i>Виключити з автоматичного
              розподілення
            </label>
            <div className="small text-muted mt-1">
              Якщо відмічено — НЕ бере участь в <strong>автоматичному</strong> розподіленні. Ручне
              призначення можливе завжди.
            </div>
          </div>
        </div>
      </div>

      <BlockedDaysSection user={user} onChange={onChange} />

      <IncompatiblePairsSection
        user={user}
        incompatibleIds={incompatibleIds}
        otherUsers={allUsers}
        incompatibleSearch={incompatibleSearch}
        filteredOtherUsers={filteredOtherUsers}
        onSearchChange={setIncompatibleSearch}
        onChange={onChange}
      />

      <AdvancedSettingsSection
        user={user}
        onChange={onChange}
        computedFairnessDate={computedFairnessDate}
        firstDutyDate={firstDutyDate}
      />
    </Modal>
  );
};

export default EditUserModal;
