// src/hooks/useScheduleDragDrop.ts
import { useState, useCallback, useRef } from 'react';
import type { ScheduleEntry, User, DayWeights, AutoScheduleOptions } from '../types';
import { getUserAvailabilityStatus } from '../services/userService';
import { applyKarmaForTransfer, saveScheduleEntry } from '../services/scheduleService';
import { getKarmaOnManualChanges } from '../services/settingsService';
import { useDialog } from '../components/useDialog';
import { toAssignedUserIds, isAssignedInEntry } from '../utils/assignment';
import { toLocalISO } from '../utils/dateUtils';

export interface DropValidation {
  valid: boolean;
  reason: string | null;
}

export interface DragState {
  userId: number;
  date: string;
  entry: ScheduleEntry;
  dropValidation?: DropValidation;
}

export interface DragDropHandlers {
  dragState: DragState | null;
  hoverCell: { userId: number; date: string } | null;
  handleDragStart: (userId: number, date: string, entry: ScheduleEntry) => void;
  handleDragEnter: (targetUserId: number, targetDate: string) => void;
  handleDragOver: (e: React.DragEvent, targetUserId: number, targetDate: string) => void;
  handleDrop: (
    e: React.DragEvent,
    targetUserId: number,
    targetDate: string,
    targetEntry: ScheduleEntry | null
  ) => void;
  handleDragEnd: () => void;
  isDropValid: (targetUserId: number, targetDate: string) => boolean;
}

interface UseScheduleDragDropArgs {
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  dayWeights: DayWeights;
  todayStr: string;
  historyMode: boolean;
  forceAssignMode: boolean;
  assignUser: (
    date: string,
    userId: number,
    isManual?: boolean,
    options?: {
      replaceUserId?: number;
      historyMode?: boolean;
      isForced?: boolean;
      maxPerDay?: number;
    }
  ) => Promise<void>;
  removeAssignment: (
    date: string,
    reason?: 'request' | 'work',
    targetUserId?: number
  ) => Promise<void>;
  pushHistory: (snapshot: Record<string, ScheduleEntry>, label: string) => void;
  logAction: (action: string, details: string) => Promise<void>;
  refreshData: () => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  autoScheduleOptions: AutoScheduleOptions;
  dutiesPerDay: number;
}

export const useScheduleDragDrop = ({
  schedule,
  users,
  dayWeights,
  todayStr,
  historyMode,
  forceAssignMode,
  assignUser,
  removeAssignment,
  pushHistory,
  logAction,
  refreshData,
  updateCascadeTrigger,
  autoScheduleOptions,
  dutiesPerDay,
}: UseScheduleDragDropArgs): DragDropHandlers => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverCell, setHoverCell] = useState<{ userId: number; date: string } | null>(null);
  // Ref for callbacks to avoid stale closures during the drag gesture
  const dragStateRef = useRef<DragState | null>(null);
  const { showConfirm, showAlert } = useDialog();

  // ── Business-rule validation (minRestDays, dutiesPerDay, відсипний) ──────
  const validateDrop = useCallback(
    (
      dragUserId: number,
      dragDate: string,
      targetUserId: number,
      targetDate: string
    ): DropValidation => {
      const targetEntry = schedule[targetDate] ?? null;
      const isSwap = isAssignedInEntry(targetEntry, targetUserId);

      // Check 1: consecutive days (minRestDays) for the dragged user landing on targetDate
      const minRest = autoScheduleOptions.avoidConsecutiveDays
        ? (autoScheduleOptions.minRestDays ?? 1)
        : 0;
      if (minRest > 0) {
        for (let offset = -minRest; offset <= minRest; offset++) {
          if (offset === 0) continue;
          const d = new Date(targetDate);
          d.setDate(d.getDate() + offset);
          const dStr = toLocalISO(d);
          if (dStr === dragDate) continue; // source date is being vacated
          if (isAssignedInEntry(schedule[dStr], dragUserId)) {
            return { valid: false, reason: `Порушення: мінімум ${minRest} дн. між нарядами` };
          }
        }
        // For swap: also check targetUserId landing on dragDate
        if (isSwap) {
          for (let offset = -minRest; offset <= minRest; offset++) {
            if (offset === 0) continue;
            const d = new Date(dragDate);
            d.setDate(d.getDate() + offset);
            const dStr = toLocalISO(d);
            if (dStr === targetDate) continue; // target date is being vacated
            if (isAssignedInEntry(schedule[dStr], targetUserId)) {
              return { valid: false, reason: `Порушення: мінімум ${minRest} дн. між нарядами` };
            }
          }
        }
      }

      // Check 2: dutiesPerDay overflow (only for moves, not swaps or same-date replaces)
      if (!isSwap && dragDate !== targetDate) {
        const currentCount = toAssignedUserIds(targetEntry?.userId).length;
        if (currentCount >= dutiesPerDay) {
          return {
            valid: false,
            reason: `День уже заповнений (${currentCount}/${dutiesPerDay} чергових)`,
          };
        }
      }

      // Check 3: відсипний — dragged user has a duty the day before targetDate
      if (new Date(targetDate).getDay() !== 0) {
        const prevD = new Date(targetDate);
        prevD.setDate(prevD.getDate() - 1);
        const prevStr = toLocalISO(prevD);
        if (prevStr !== dragDate && isAssignedInEntry(schedule[prevStr], dragUserId)) {
          return { valid: false, reason: 'Відсипний день — наряд неможливий' };
        }
      }

      return { valid: true, reason: null };
    },
    [schedule, autoScheduleOptions, dutiesPerDay]
  );

  const isDropValid = useCallback(
    (targetUserId: number, targetDate: string): boolean => {
      const drag = dragStateRef.current;
      if (!drag) return false;
      // No-op: same cell
      if (drag.userId === targetUserId && drag.date === targetDate) return false;
      // Past restriction
      const isPastTarget = new Date(targetDate) < new Date(todayStr);
      if (isPastTarget && !historyMode) return false;
      // Target user must exist
      const targetUser = users.find((u) => u.id === targetUserId);
      if (!targetUser) return false;
      // Availability check (only for empty target cells; assigned cells are always valid for swap)
      const targetEntry = schedule[targetDate] ?? null;
      const targetIsAssigned = isAssignedInEntry(targetEntry, targetUserId);
      if (!targetIsAssigned) {
        const status = getUserAvailabilityStatus(targetUser, targetDate);
        if (status !== 'AVAILABLE' && !forceAssignMode) return false;
      }
      return true;
    },
    [schedule, users, todayStr, historyMode, forceAssignMode]
  );

  const handleDragStart = useCallback((userId: number, date: string, entry: ScheduleEntry) => {
    const state: DragState = { userId, date, entry };
    dragStateRef.current = state;
    setDragState(state);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
    setHoverCell(null);
  }, []);

  const handleDragEnter = useCallback((targetUserId: number, targetDate: string) => {
    setHoverCell((prev) =>
      prev?.userId === targetUserId && prev?.date === targetDate
        ? prev
        : { userId: targetUserId, date: targetDate }
    );
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetUserId: number, targetDate: string) => {
      // Always preventDefault so the browser/WebView2 allows the drop gesture
      // and doesn't show the "prohibited" cursor unconditionally.
      e.preventDefault();
      const valid = isDropValid(targetUserId, targetDate);
      e.dataTransfer.dropEffect = valid ? 'move' : 'none';
      // Compute rule validation and store in dragState for CSS feedback
      const drag = dragStateRef.current;
      if (!drag) return;
      const result = validateDrop(drag.userId, drag.date, targetUserId, targetDate);
      setDragState((prev) => {
        if (!prev) return prev;
        if (
          prev.dropValidation?.valid === result.valid &&
          prev.dropValidation?.reason === result.reason
        ) {
          return prev; // no change — skip re-render
        }
        return { ...prev, dropValidation: result };
      });
    },
    [isDropValid, validateDrop]
  );

  const handleDrop = useCallback(
    (
      e: React.DragEvent,
      targetUserId: number,
      targetDate: string,
      targetEntry: ScheduleEntry | null
    ) => {
      e.preventDefault();
      const drag = dragStateRef.current;
      if (!drag) return;
      if (!isDropValid(targetUserId, targetDate)) return;

      // Clear immediately to prevent double-triggers
      dragStateRef.current = null;
      setDragState(null);
      setHoverCell(null);

      const { userId: sourceUserId, date: sourceDate, entry: sourceEntry } = drag;

      void (async () => {
        // Business-rule validation
        const ruleCheck = validateDrop(sourceUserId, sourceDate, targetUserId, targetDate);
        if (!ruleCheck.valid) {
          await showAlert(ruleCheck.reason ?? 'Перенесення неможливе');
          return;
        }

        if (sourceEntry.isLocked) {
          const ok = await showConfirm('Цей запис заблоковано. Перемістити все одно?');
          if (!ok) return;
        }
        if (targetEntry?.isLocked) {
          const ok = await showConfirm('Цільовий запис заблоковано. Виконати операцію все одно?');
          if (!ok) return;
        }

        pushHistory(schedule, 'Drag & Drop');

        const sourceUser = users.find((u) => u.id === sourceUserId);
        const targetUser = users.find((u) => u.id === targetUserId);
        const srcName = sourceUser?.name ?? String(sourceUserId);
        const tgtName = targetUser?.name ?? String(targetUserId);

        const targetIsAssigned = isAssignedInEntry(targetEntry, targetUserId);

        try {
          if (sourceDate === targetDate) {
            // ── Same-date replace (dutiesPerDay > 1 scenario) ──────────────
            await assignUser(sourceDate, targetUserId, true, {
              replaceUserId: sourceUserId,
              historyMode,
              isForced: forceAssignMode,
            });
            await logAction('DRAG_MOVE', `${tgtName} замінив ${srcName} за ${sourceDate}`);
            await updateCascadeTrigger(sourceDate);
          } else if (targetIsAssigned) {
            // ── Swap: source user ↔ target user between dates ───────────────
            const sourceIds = toAssignedUserIds(sourceEntry.userId);
            const targetIds = toAssignedUserIds(targetEntry!.userId);
            const newSourceIds = sourceIds.filter((id) => id !== sourceUserId).concat(targetUserId);
            const newTargetIds = targetIds.filter((id) => id !== targetUserId).concat(sourceUserId);
            await saveScheduleEntry({
              ...sourceEntry,
              userId: newSourceIds.length === 1 ? newSourceIds[0] : newSourceIds,
              type: 'swap',
              isLocked: false,
            });
            await saveScheduleEntry({
              ...targetEntry!,
              userId: newTargetIds.length === 1 ? newTargetIds[0] : newTargetIds,
              type: 'swap',
              isLocked: false,
            });
            if (await getKarmaOnManualChanges()) {
              await applyKarmaForTransfer(sourceUserId, sourceDate, targetDate, dayWeights);
              await applyKarmaForTransfer(targetUserId, targetDate, sourceDate, dayWeights);
            }
            await logAction('DRAG_SWAP', `${srcName} ↔ ${tgtName}: ${sourceDate} ↔ ${targetDate}`);
            await updateCascadeTrigger(sourceDate);
            await updateCascadeTrigger(targetDate);
          } else {
            // ── Move: source duty transfers to target cell ──────────────────
            await removeAssignment(sourceDate, 'work', sourceUserId);
            await assignUser(targetDate, targetUserId, true, {
              historyMode,
              isForced: forceAssignMode,
            });
            await logAction('DRAG_MOVE', `${tgtName}: ${sourceDate} → ${targetDate}`);
            await updateCascadeTrigger(sourceDate);
            await updateCascadeTrigger(targetDate);
          }
          await refreshData();
        } catch (err) {
          console.error('[DragDrop] operation failed:', err);
        }
      })();
    },
    [
      isDropValid,
      validateDrop,
      schedule,
      users,
      dayWeights,
      historyMode,
      forceAssignMode,
      assignUser,
      removeAssignment,
      pushHistory,
      logAction,
      refreshData,
      updateCascadeTrigger,
      showConfirm,
      showAlert,
    ]
  );

  return {
    dragState,
    hoverCell,
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    isDropValid,
  };
};
