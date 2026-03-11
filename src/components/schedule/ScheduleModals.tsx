// src/components/schedule/ScheduleModals.tsx

import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import type { SwapMode } from './assignmentModalUtils';
import type { UserChangeItem } from '../../utils/userEditDiff';
import { toLocalISO } from '../../utils/dateUtils';
import { toAssignedUserIds, getFirstDutyDate } from '../../utils/assignment';
import AssignmentModal from './AssignmentModal';
import ConfirmAssignModal from './ConfirmAssignModal';
import ImportScheduleModal from './ImportScheduleModal';
import EditUserModal from '../users/EditUserModal';
import UserChangesReviewModal from '../users/UserChangesReviewModal';

// ─── Local types mirroring useAssignmentModal internals ──────────────────────

interface SelectedCell {
  date: string;
  entry: ScheduleEntry | null;
  assignedUserId?: number;
}

interface PendingAssignConfirm {
  userId: number;
  lastDutyDate?: string;
  daysSinceLastDuty?: number;
  isRestDay: boolean;
  penalizeReplaced?: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ScheduleModalsProps {
  // Assignment modal state
  selectedCell: SelectedCell | null;
  setSelectedCell: (cell: SelectedCell | null) => void;
  swapMode: SwapMode;
  setSwapMode: (mode: SwapMode) => void;
  pendingAssignConfirm: PendingAssignConfirm | null;
  setPendingAssignConfirm: (val: PendingAssignConfirm | null) => void;
  executeAssign: (userId: number, penalize?: boolean) => void;
  handleAssign: (userId: number, penalize: boolean) => Promise<void>;
  handleSwap: (swapUserId: number, swapDate: string) => Promise<void>;
  handleRemove: (reason: 'request' | 'work') => Promise<void>;
  // Schedule data
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  weekDates: string[];
  historyMode: boolean;
  // Query functions
  getFreeUsers: (dateStr: string, includeRestDay?: boolean) => User[];
  getWeekAssignedUsers: (dateStr: string) => User[];
  daysSinceLastDuty: (userId: number, refDate: string) => number;
  calculateEffectiveLoad: (user: User) => number;
  // Import modal
  showImportModal: boolean;
  setShowImportModal: (v: boolean) => void;
  logAction: (action: string, details: string) => Promise<void>;
  refreshData: () => Promise<void>;
  // User edit flow
  editingUser: User | null;
  pendingEditReview: { draft: User; changes: UserChangeItem[] } | null;
  isApplyingEdit: boolean;
  setEditingUser: (user: User | null) => void;
  handleCloseEditModal: (currentUsers: User[]) => void;
  handleApplyEditChanges: () => Promise<void>;
  handleDiscardEditChanges: () => void;
  handleCancelEditReview: () => void;
}

/**
 * Renders all overlay modals for the schedule view.
 * Extracted from ScheduleView to keep that component under 300 lines.
 */
const ScheduleModals: React.FC<ScheduleModalsProps> = ({
  selectedCell,
  setSelectedCell,
  swapMode,
  setSwapMode,
  pendingAssignConfirm,
  setPendingAssignConfirm,
  executeAssign,
  handleAssign,
  handleSwap,
  handleRemove,
  users,
  schedule,
  weekDates,
  historyMode,
  getFreeUsers,
  getWeekAssignedUsers,
  daysSinceLastDuty,
  calculateEffectiveLoad,
  showImportModal,
  setShowImportModal,
  logAction,
  refreshData,
  editingUser,
  setEditingUser,
  pendingEditReview,
  isApplyingEdit,
  handleCloseEditModal,
  handleApplyEditChanges,
  handleDiscardEditChanges,
  handleCancelEditReview,
}) => (
  <>
    {selectedCell && (
      <AssignmentModal
        show={true}
        date={selectedCell.date}
        assignedUserId={selectedCell.assignedUserId}
        users={users}
        freeUsers={getFreeUsers(selectedCell.date, true)}
        swapUsers={getWeekAssignedUsers(selectedCell.date)}
        schedule={schedule}
        weekDates={weekDates}
        swapMode={swapMode}
        onSetSwapMode={setSwapMode}
        onAssign={(userId, penalize) => handleAssign(userId, penalize)}
        onSwap={handleSwap}
        onRemove={handleRemove}
        onClose={() => {
          setPendingAssignConfirm(null);
          setSelectedCell(null);
        }}
        isOnRestDay={(userId: number, dateStr: string) => {
          const prevDate = new Date(dateStr);
          prevDate.setDate(prevDate.getDate() - 1);
          const prevEntry = schedule[toLocalISO(prevDate)];
          return prevEntry ? toAssignedUserIds(prevEntry.userId).includes(userId) : false;
        }}
        calculateEffectiveLoad={calculateEffectiveLoad}
        daysSinceLastDuty={daysSinceLastDuty}
        hasEntry={!!selectedCell.entry}
        historyMode={historyMode}
      />
    )}

    <ImportScheduleModal
      show={showImportModal}
      users={users}
      onClose={() => setShowImportModal(false)}
      onImported={async (result) => {
        await logAction('IMPORT_SCHEDULE', `Імпортовано ${result.imported} днів старого графіка`);
        await refreshData();
      }}
    />

    <ConfirmAssignModal
      show={!!pendingAssignConfirm && !!selectedCell}
      pending={pendingAssignConfirm}
      targetDate={selectedCell?.date || ''}
      users={users}
      onConfirm={(userId) => executeAssign(userId, pendingAssignConfirm?.penalizeReplaced)}
      onClose={() => setPendingAssignConfirm(null)}
    />

    {editingUser && !pendingEditReview && (
      <EditUserModal
        user={editingUser}
        onChange={(u) => u && (setEditingUser as (u: User | null) => void)(u)}
        onClose={() => handleCloseEditModal(users)}
        computedFairnessDate={(() => {
          const dates = Object.keys(schedule).sort();
          return dates[0] || toLocalISO(new Date());
        })()}
        firstDutyDate={editingUser.id ? getFirstDutyDate(schedule, editingUser.id) : undefined}
        allUsers={users}
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
  </>
);

export default ScheduleModals;
