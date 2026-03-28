// src/hooks/useAssignmentModal.ts

import { useState, useCallback } from 'react';
import { useDialog } from '../components/useDialog';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { getAllSchedule, saveScheduleEntry } from '../services/scheduleService';
import { isAssignedInEntry, toAssignedUserIds } from '../utils/assignment';
import type { SwapMode } from '../components/schedule/AssignmentModal';

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
  isForced?: boolean;
}

interface UseAssignmentModalArgs {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  dutiesPerDay: number;
  historyMode: boolean;
  forceAssignMode: boolean;
  pushHistory: (snapshot: Record<string, ScheduleEntry>, label: string) => void;
  assignUser: (
    date: string,
    userId: number,
    isManual?: boolean,
    options?: {
      maxPerDay?: number;
      replaceUserId?: number;
      penalizeReplaced?: boolean;
      historyMode?: boolean;
      isForced?: boolean;
    }
  ) => Promise<void>;
  removeAssignment: (
    date: string,
    reason: 'request' | 'work',
    targetUserId?: number
  ) => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

export const useAssignmentModal = ({
  users,
  schedule,
  dayWeights,
  dutiesPerDay,
  historyMode,
  forceAssignMode,
  pushHistory,
  assignUser,
  removeAssignment,
  updateCascadeTrigger,
  logAction,
  refreshData,
}: UseAssignmentModalArgs) => {
  const { showAlert, showConfirm } = useDialog();

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [swapMode, setSwapMode] = useState<SwapMode>('replace');
  const [pendingAssignConfirm, setPendingAssignConfirm] = useState<PendingAssignConfirm | null>(
    null
  );

  const isOnRestDay = useCallback(
    (userId: number, dateStr: string): boolean => {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevEntry = schedule[toLocalISO(prevDate)];
      return isAssignedInEntry(prevEntry, userId);
    },
    [schedule]
  );

  const getLastDutyDateBeforeTarget = useCallback(
    (userId: number, targetDate: string): string | undefined => {
      const assignedDates = Object.keys(schedule)
        .filter((d) => d < targetDate && isAssignedInEntry(schedule[d], userId))
        .sort();
      if (assignedDates.length === 0) return undefined;
      return assignedDates[assignedDates.length - 1];
    },
    [schedule]
  );

  const executeAssign = useCallback(
    async (
      userId: number,
      penalizeReplaced = false,
      targetCell: SelectedCell | null = selectedCell,
      isForced = false
    ) => {
      if (!targetCell) return;

      try {
        pushHistory(schedule, 'Призначення');

        await assignUser(targetCell.date, userId, true, {
          maxPerDay: dutiesPerDay,
          replaceUserId: targetCell.assignedUserId,
          penalizeReplaced,
          historyMode,
          isForced,
        });
        await updateCascadeTrigger(targetCell.date);

        const u = users.find((user) => user.id === userId);
        const dayIdx = new Date(targetCell.date).getDay();
        const weight = dayWeights[dayIdx] || 1.0;
        if (u) await logAction('MANUAL', `${u.name} (Карма +${weight})`);

        setPendingAssignConfirm(null);
        setSelectedCell(null);
        await refreshData();
      } catch (err) {
        await showAlert(err instanceof Error ? err.message : 'Помилка призначення');
      }
    },
    [
      selectedCell,
      schedule,
      pushHistory,
      dayWeights,
      assignUser,
      dutiesPerDay,
      historyMode,
      updateCascadeTrigger,
      users,
      logAction,
      refreshData,
      showAlert,
    ]
  );

  const handleAssign = useCallback(
    async (
      userId: number | undefined,
      penalizeReplaced = false,
      targetCell: SelectedCell | null = selectedCell
    ) => {
      if (!userId || !targetCell) return;

      // In history mode — assign directly, no confirmations
      if (historyMode) {
        await executeAssign(userId, false, targetCell);
        return;
      }

      const isReplaceMode = Boolean(targetCell.assignedUserId);
      const isRestDay = isOnRestDay(userId, targetCell.date);

      if (isReplaceMode) {
        if (isRestDay) {
          const userName = users.find((u) => u.id === userId)?.name || '';
          const ok = await showConfirm(
            `${userName} — відсипний (чергував вчора).\nВсе одно призначити?`
          );
          if (!ok) return;
        }
        await executeAssign(userId, penalizeReplaced, targetCell, forceAssignMode);
        return;
      }

      // Fresh assignment mode: always ask for confirmation with last duty info
      const lastDutyDate = getLastDutyDateBeforeTarget(userId, targetCell.date);
      const daysSinceLastDuty = lastDutyDate
        ? Math.floor(
            (new Date(targetCell.date).getTime() - new Date(lastDutyDate).getTime()) / 86400000
          )
        : undefined;
      setSelectedCell(targetCell);
      setPendingAssignConfirm({
        userId,
        lastDutyDate,
        daysSinceLastDuty,
        isRestDay,
        penalizeReplaced,
        isForced: forceAssignMode,
      });
    },
    [
      selectedCell,
      historyMode,
      forceAssignMode,
      executeAssign,
      isOnRestDay,
      users,
      showConfirm,
      getLastDutyDateBeforeTarget,
      setSelectedCell,
    ]
  );

  const handleSwap = useCallback(
    async (swapUserId: number, swapDate: string) => {
      if (!selectedCell?.assignedUserId) return;
      const { date: targetDate, assignedUserId: currentUserId } = selectedCell;
      if (!swapDate) return;

      pushHistory(schedule, 'Обмін');

      await removeAssignment(targetDate, 'work', currentUserId);
      await removeAssignment(swapDate, 'work', swapUserId);

      const freshSchedule = await getAllSchedule();

      const targetEntry = freshSchedule[targetDate];
      const targetIds = toAssignedUserIds(targetEntry?.userId);
      targetIds.push(swapUserId);
      await saveScheduleEntry({
        date: targetDate,
        userId: targetIds.length === 1 ? targetIds[0] : targetIds,
        type: 'swap',
        isLocked: false,
      });

      const swapEntry = freshSchedule[swapDate];
      const swapIds = toAssignedUserIds(swapEntry?.userId);
      swapIds.push(currentUserId);
      await saveScheduleEntry({
        date: swapDate,
        userId: swapIds.length === 1 ? swapIds[0] : swapIds,
        type: 'swap',
        isLocked: false,
      });

      const currentUser = users.find((u) => u.id === currentUserId);
      const swapUser = users.find((u) => u.id === swapUserId);
      await logAction(
        'SWAP',
        `Обмін: ${currentUser?.name} (${targetDate}) ↔ ${swapUser?.name} (${swapDate})`
      );

      setSelectedCell(null);
      await refreshData();
    },
    [selectedCell, schedule, pushHistory, removeAssignment, users, logAction, refreshData]
  );

  const handleRemove = useCallback(
    async (reason: 'request' | 'work') => {
      if (!selectedCell?.entry || !selectedCell.entry.userId || !selectedCell.assignedUserId)
        return;
      const { date } = selectedCell;
      const dayIdx = new Date(date).getDay();
      const weight = dayWeights[dayIdx] || 1.0;

      pushHistory(schedule, 'Зняття');
      await removeAssignment(date, reason, selectedCell.assignedUserId);
      await updateCascadeTrigger(date);

      const u = users.find((user) => user.id === selectedCell.assignedUserId);
      if (u) {
        if (reason === 'request') {
          await logAction('REMOVE', `${u.name} рапорт (Карма -${weight})`);
        } else {
          await logAction('REMOVE', `Службова`);
        }
      }

      setSelectedCell(null);
      await refreshData();
    },
    [
      selectedCell,
      schedule,
      dayWeights,
      pushHistory,
      removeAssignment,
      updateCascadeTrigger,
      users,
      logAction,
      refreshData,
    ]
  );

  return {
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
  };
};
