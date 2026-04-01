// src/hooks/useUsersActions.ts — add/delete user actions for UsersView
import { useCallback } from 'react';
import type { User, ScheduleEntry } from '../types';
import { useUsers } from './index';
import { useDialog } from '../components/useDialog';
import { toLocalISO } from '../utils/dateUtils';

interface UseUsersActionsProps {
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  onAddDone: () => void;
}

/** Provides handleAdd and handleDelete actions for the users list. */
export const useUsersActions = ({
  schedule,
  refreshData,
  logAction,
  updateCascadeTrigger,
  onAddDone,
}: UseUsersActionsProps) => {
  const { createUser, deleteUser: deleteUserHook } = useUsers();
  const { showConfirm } = useDialog();

  const handleAdd = useCallback(
    async (name: string, rank: string, note: string) => {
      const scheduleDates = Object.keys(schedule).sort();
      const lastScheduleDate = scheduleDates[scheduleDates.length - 1];
      const todayStr = toLocalISO(new Date());

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
        isPersonnel: true,
        isDutyMember: true,
        isActive: true,
        excludeFromAuto: false,
        note,
        debt: 0.0,
        statusFrom: '',
        statusTo: '',
        statusPeriods: [],
        restAfterStatus: false,
        owedDays: {},
        dateAddedToAuto,
      });
      await logAction('ADD', `Додано: ${name}`);
      await refreshData();
      onAddDone();
    },
    [schedule, createUser, logAction, refreshData, onAddDone]
  );

  const handleDelete = useCallback(
    async (u: User) => {
      if (!u.id) return;
      if (!(await showConfirm('Видалити?'))) return;
      await deleteUserHook(u.id);
      const todayStr = toLocalISO(new Date());
      await updateCascadeTrigger(todayStr);
      await logAction('DELETE', `Видалено: ${u.name}`);
      await refreshData();
    },
    [deleteUserHook, showConfirm, updateCascadeTrigger, logAction, refreshData]
  );

  return { handleAdd, handleDelete };
};
