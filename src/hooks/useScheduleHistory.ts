// src/hooks/useScheduleHistory.ts

import { useRef, useState, useCallback } from 'react';
import type { ScheduleEntry } from '../types';
import {
  saveScheduleEntry,
  deleteScheduleEntry,
  getAllSchedule,
} from '../services/scheduleService';

const MAX_HISTORY = 25;

interface HistoryEntry {
  snapshot: Record<string, ScheduleEntry>;
  label: string;
}

/**
 * Hook for undo/redo schedule actions.
 * Call pushHistory(currentSchedule, label) BEFORE any mutation.
 * Call undo/redo with the current schedule snapshot to restore.
 */
export const useScheduleHistory = () => {
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoLabel, setUndoLabel] = useState('');
  const [redoLabel, setRedoLabel] = useState('');

  const sync = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
    setUndoLabel(pastRef.current.at(-1)?.label ?? '');
    setRedoLabel(futureRef.current.at(-1)?.label ?? '');
  }, []);

  /** Save current state before a mutation. Clears the redo stack. */
  const pushHistory = useCallback(
    (snapshot: Record<string, ScheduleEntry>, label: string) => {
      pastRef.current = [...pastRef.current, { snapshot: { ...snapshot }, label }];
      if (pastRef.current.length > MAX_HISTORY) {
        pastRef.current.shift();
      }
      futureRef.current = [];
      sync();
    },
    [sync]
  );

  const applySnapshot = useCallback(async (snapshot: Record<string, ScheduleEntry>) => {
    const current = await getAllSchedule();

    // Delete entries that exist now but were absent in the saved state
    const toDelete = Object.keys(current).filter((d) => !snapshot[d]);
    for (const date of toDelete) {
      await deleteScheduleEntry(date);
    }

    // Restore all entries from the snapshot
    for (const entry of Object.values(snapshot)) {
      await saveScheduleEntry(entry);
    }
  }, []);

  /** Undo last action. Pass the current schedule so it can be saved as redo state. */
  const undo = useCallback(
    async (currentSnapshot: Record<string, ScheduleEntry>) => {
      if (pastRef.current.length === 0) return;
      const entry = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [
        ...futureRef.current,
        { snapshot: { ...currentSnapshot }, label: entry.label },
      ];
      await applySnapshot(entry.snapshot);
      sync();
    },
    [applySnapshot, sync]
  );

  /** Redo previously undone action. Pass the current schedule so it can be saved as undo state. */
  const redo = useCallback(
    async (currentSnapshot: Record<string, ScheduleEntry>) => {
      if (futureRef.current.length === 0) return;
      const entry = futureRef.current[futureRef.current.length - 1];
      futureRef.current = futureRef.current.slice(0, -1);
      pastRef.current = [
        ...pastRef.current,
        { snapshot: { ...currentSnapshot }, label: entry.label },
      ];
      await applySnapshot(entry.snapshot);
      sync();
    },
    [applySnapshot, sync]
  );

  /** Clear both stacks (e.g. on workspace switch or data import). */
  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    sync();
  }, [sync]);

  return { pushHistory, undo, redo, clearHistory, canUndo, canRedo, undoLabel, redoLabel };
};
