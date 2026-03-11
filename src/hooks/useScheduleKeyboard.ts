// src/hooks/useScheduleKeyboard.ts

import { useCallback, useEffect, useRef } from 'react';
import type { ScheduleEntry } from '../types';

interface UseScheduleKeyboardProps {
  schedule: Record<string, ScheduleEntry>;
  selectedCell: unknown;
  pendingAssignConfirm: unknown;
  showImportModal: boolean;
  undoHistory: (snapshot: Record<string, ScheduleEntry>) => Promise<void>;
  redoHistory: (snapshot: Record<string, ScheduleEntry>) => Promise<void>;
  refreshData: () => Promise<void>;
  runClearWeek: () => Promise<void>;
  runFillGaps: () => Promise<void>;
  runFullAutoSchedule: () => Promise<void>;
}

/** Returns true when the keyboard event target is a text-input element. */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

/**
 * Attaches keyboard shortcuts to the schedule view:
 * Ctrl+Z / Ctrl+Y for undo/redo, C/F/G for quick toolbar actions.
 */
export const useScheduleKeyboard = ({
  schedule,
  selectedCell,
  pendingAssignConfirm,
  showImportModal,
  undoHistory,
  redoHistory,
  refreshData,
  runClearWeek,
  runFillGaps,
  runFullAutoSchedule,
}: UseScheduleKeyboardProps): void => {
  // Keep a stable ref so the keydown handler always sees latest schedule
  const scheduleRef = useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Ctrl+Z / Ctrl+Y undo-redo
  const handleUndoRedo = useCallback(
    (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undoHistory(scheduleRef.current).then(() => refreshData());
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void redoHistory(scheduleRef.current).then(() => refreshData());
      }
    },
    [undoHistory, redoHistory, refreshData]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [handleUndoRedo]);

  // C / F / G quick-action shortcuts
  const handleQuickActions = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (selectedCell || pendingAssignConfirm || showImportModal) return;
      const key = e.key.toLowerCase();
      const matchesKey = (code: string, latin: string, cyrillic: string) =>
        e.code === code || key === latin || key === cyrillic;
      if (matchesKey('KeyC', 'c', 'с')) {
        e.preventDefault();
        void runClearWeek();
      } else if (matchesKey('KeyF', 'f', 'а')) {
        e.preventDefault();
        void runFillGaps();
      } else if (matchesKey('KeyG', 'g', 'п')) {
        e.preventDefault();
        void runFullAutoSchedule();
      }
    },
    [
      selectedCell,
      pendingAssignConfirm,
      showImportModal,
      runClearWeek,
      runFillGaps,
      runFullAutoSchedule,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleQuickActions);
    return () => window.removeEventListener('keydown', handleQuickActions);
  }, [handleQuickActions]);
};
