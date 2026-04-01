// src/hooks/useUserEditFlow.ts
import { useState, useCallback } from 'react';
import type { User, ScheduleEntry } from '../types';
import * as userService from '../services/userService';
import { toLocalISO } from '../utils/dateUtils';
import {
  getUserStatusPeriods,
  getStatusPeriodAtDate,
  getFutureStatusPeriods,
} from '../utils/userStatus';
import { cloneUserDraft, getUserChangeSummary } from '../utils/userEditDiff';

interface UseUserEditFlowProps {
  schedule: Record<string, ScheduleEntry>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

/**
 * Manages the full "edit user" flow: open modal → confirm changes review → apply.
 * Extracted from ScheduleView to keep that component under 300 lines.
 */
export const useUserEditFlow = ({
  updateCascadeTrigger,
  refreshData,
  logAction,
}: UseUserEditFlowProps) => {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editBaseUser, setEditBaseUser] = useState<User | null>(null);
  const [pendingEditReview, setPendingEditReview] = useState<{
    draft: User;
    changes: ReturnType<typeof getUserChangeSummary>;
  } | null>(null);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);

  /** Persist all user fields and trigger cascade recalculation. */
  const saveEditedUser = useCallback(
    async (user: User) => {
      if (!user.id) return;
      const userId = user.id;
      const originalUser = await userService.getUserById(userId);
      const safeUser = {
        ...user,
        isDutyMember: user.isDutyMember ?? originalUser?.isDutyMember ?? originalUser?.isActive ?? false,
      };
      const todayStr = toLocalISO(new Date());
      const normalizedPeriods = getUserStatusPeriods(safeUser);
      const currentPeriod = getStatusPeriodAtDate(safeUser, todayStr);
      const nextPeriod = getFutureStatusPeriods(safeUser, todayStr)[0];
      const legacyPeriod = currentPeriod || null;
      const legacyRestBefore = legacyPeriod?.restBefore || false;
      const legacyRestAfter = legacyPeriod?.restAfter || false;

      await userService.updateUser(userId, {
        name: safeUser.name,
        rank: safeUser.rank,
        status: legacyPeriod ? legacyPeriod.status : 'ACTIVE',
        statusFrom: legacyPeriod ? legacyPeriod.from : undefined,
        statusTo: legacyPeriod ? legacyPeriod.to : undefined,
        isDutyMember: safeUser.isDutyMember,
        isActive: safeUser.isActive,
        excludeFromAuto: safeUser.excludeFromAuto,
        note: safeUser.note,
        restBeforeStatus: legacyRestBefore,
        restAfterStatus: legacyRestAfter,
        blockedDays: safeUser.blockedDays,
        blockedDaysFrom: safeUser.blockedDaysFrom,
        blockedDaysTo: safeUser.blockedDaysTo,
        blockedDaysComment: safeUser.blockedDaysComment,
        statusComment: legacyPeriod?.status === 'ABSENT' ? legacyPeriod.comment : undefined,
        statusPeriods: normalizedPeriods,
        dateAddedToAuto: safeUser.dateAddedToAuto,
        birthday: safeUser.birthday,
      });
      await userService.syncUserIncompatibility(userId, safeUser.incompatibleWith);

      if (legacyPeriod?.from) {
        await updateCascadeTrigger(legacyPeriod.from);
      } else if (nextPeriod?.from) {
        await updateCascadeTrigger(nextPeriod.from);
      } else {
        await updateCascadeTrigger(todayStr);
      }

      await refreshData();
    },
    [updateCascadeTrigger, refreshData]
  );

  const resetEditState = useCallback(() => {
    setEditingUser(null);
    setEditBaseUser(null);
    setPendingEditReview(null);
    setIsApplyingEdit(false);
  }, []);

  /** Save the current draft directly and close the modal (no review step). */
  const handleSaveDirectly = useCallback(async () => {
    if (!editingUser?.id) return;
    setIsApplyingEdit(true);
    try {
      await saveEditedUser(editingUser);
      await logAction('EDIT', `Редаговано: ${editingUser.name}`);
      resetEditState();
    } finally {
      setIsApplyingEdit(false);
    }
  }, [editingUser, logAction, resetEditState, saveEditedUser]);

  /** Open edit modal for a user. */
  const handleStartEdit = useCallback((user: User) => {
    setEditBaseUser(cloneUserDraft(user));
    setEditingUser(cloneUserDraft(user));
  }, []);

  /**
   * Close the edit modal: if there are changes, show the review dialog instead
   * of silently discarding them.
   */
  const handleCloseEditModal = useCallback(
    (currentUsers: User[]) => {
      if (!editingUser || !editBaseUser) {
        resetEditState();
        return;
      }
      const changes = getUserChangeSummary(editBaseUser, editingUser, currentUsers);
      if (changes.length === 0) {
        resetEditState();
        return;
      }
      setPendingEditReview({ draft: cloneUserDraft(editingUser), changes });
    },
    [editBaseUser, editingUser, resetEditState]
  );

  const handleCancelEditReview = useCallback(() => {
    setPendingEditReview(null);
  }, []);

  const handleDiscardEditChanges = useCallback(() => {
    resetEditState();
  }, [resetEditState]);

  const handleApplyEditChanges = useCallback(async () => {
    const draft = pendingEditReview?.draft;
    if (!draft?.id) {
      resetEditState();
      return;
    }
    setIsApplyingEdit(true);
    try {
      await saveEditedUser(draft);
      await logAction('EDIT', `Редаговано: ${draft.name}`);
      resetEditState();
    } finally {
      setIsApplyingEdit(false);
    }
  }, [logAction, pendingEditReview, resetEditState, saveEditedUser]);

  return {
    editingUser,
    setEditingUser,
    editBaseUser,
    pendingEditReview,
    isApplyingEdit,
    handleStartEdit,
    handleCloseEditModal,
    handleCancelEditReview,
    handleDiscardEditChanges,
    handleApplyEditChanges,
    handleSaveDirectly,
  };
};
