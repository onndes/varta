// src/hooks/useSchedulePreview.ts
// Preview Mode: runs autoFillSchedule without saving — shows what auto-generation
// would produce for the current week without committing anything to the DB.
//
// Next-week prefetch:
//   After the current week's preview is rendered the hook starts computing the
//   following week in the background via startPrefetchJob(). The result goes
//   into completedCacheRef.
//
//   On navigation:
//    ┌─ Render phase (before paint) ────────────────────────────────────────┐
//    │  completedCacheRef.monday === N?                                      │
//    │  YES → setState during render (React restarts render before paint).   │
//    │        User NEVER sees a blank frame. Zero flicker.                   │
//    │  NO  → clear old preview; effect handles the rest after paint.        │
//    └──────────────────────────────────────────────────────────────────────┘
//    ┌─ Effect phase (after paint) ─────────────────────────────────────────┐
//    │  syncAppliedRef?  → just prefetch N+1                                │
//    │  prefetchJobRef for N (in-flight)?  → await it (Case B)              │
//    │  nothing?  → compute from scratch (Case C)                           │
//    └──────────────────────────────────────────────────────────────────────┘
//
// Cancellation: monotonic genRef ensures stale async work never mutates state.

import { useState, useEffect, useRef, useCallback } from 'react';
import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../types';
import { autoFillSchedule } from '../services/autoScheduler';
import { toLocalISO } from '../utils/dateUtils';
import { toAssignedUserIds } from '../utils/assignment';

const STORAGE_KEY = 'varta-preview-mode';
const CURRENT_DEBOUNCE_MS = 150;
const PREFETCH_DEBOUNCE_MS = 200;

interface WeekPreviewResult {
  monday: string;
  data: Record<string, ScheduleEntry>;
}

interface PrefetchJob {
  monday: string;
  settle: Promise<WeekPreviewResult>;
}

export interface UseSchedulePreviewResult {
  previewMode: boolean;
  previewSchedule: Record<string, ScheduleEntry>;
  isComputing: boolean;
  isPrefetching: boolean;
  togglePreviewMode: () => void;
}

export const useSchedulePreview = (
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>,
  users: User[],
  dayWeights: DayWeights,
  dutiesPerDay: number,
  autoScheduleOptions: AutoScheduleOptions,
  ignoreHistoryInLogic: boolean
): UseSchedulePreviewResult => {
  const [previewMode, setPreviewMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [previewSchedule, setPreviewSchedule] = useState<Record<string, ScheduleEntry>>({});
  const [isComputing, setIsComputing] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);

  const genRef = useRef(0);
  const completedCacheRef = useRef<WeekPreviewResult | null>(null);
  const prefetchJobRef = useRef<PrefetchJob | null>(null);
  const prevDataRef = useRef({
    schedule,
    users,
    dayWeights,
    dutiesPerDay,
    autoScheduleOptions,
    ignoreHistoryInLogic,
  });

  /** Set to true when cache is applied during render; tells the effect to skip
   *  computation and only start the next-week prefetch. */
  const syncAppliedRef = useRef(false);

  const clearAll = useCallback(() => {
    setPreviewSchedule({});
    setIsComputing(false);
    setIsPrefetching(false);
    completedCacheRef.current = null;
    prefetchJobRef.current = null;
    syncAppliedRef.current = false;
  }, []);

  const togglePreviewMode = useCallback(() => {
    setPreviewMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      if (!next) clearAll();
      return next;
    });
  }, [clearAll]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER-PHASE cache application (React 18 "adjust state during render").
  //
  // When weekDates[0] changes (navigation), we check completedCacheRef.
  // If there's a hit we call setState during render, which makes React
  // DISCARD the current (blank) render and restart with the cached preview.
  // The browser never paints the blank frame → zero flicker.
  // ═══════════════════════════════════════════════════════════════════════════
  const [prevMonday, setPrevMonday] = useState(weekDates[0]);

  if (weekDates[0] !== prevMonday) {
    setPrevMonday(weekDates[0]);

    // Guard: don't apply stale cache if data deps also changed.
    const prev = prevDataRef.current;
    const dataStale =
      prev.schedule !== schedule ||
      prev.users !== users ||
      prev.dayWeights !== dayWeights ||
      prev.dutiesPerDay !== dutiesPerDay ||
      prev.autoScheduleOptions !== autoScheduleOptions ||
      prev.ignoreHistoryInLogic !== ignoreHistoryInLogic;

    if (previewMode && !dataStale) {
      const cache = completedCacheRef.current;
      if (cache && cache.monday === weekDates[0]) {
        // ✅ Cache hit — apply instantly before paint.
        completedCacheRef.current = null;
        setPreviewSchedule(cache.data);
        setIsComputing(false);
        setIsPrefetching(false);
        syncAppliedRef.current = true;
      } else {
        // No cache — clear stale old-week data so we don't show wrong days.
        setPreviewSchedule({});
        syncAppliedRef.current = false;
      }
    } else {
      setPreviewSchedule({});
      syncAppliedRef.current = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EFFECT: computation + prefetching (runs after paint).
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!previewMode) {
      clearAll();
      return;
    }

    const gen = ++genRef.current;
    const todayStr = toLocalISO(new Date());

    // ── Data-change detection ────────────────────────────────────────────
    const prev = prevDataRef.current;
    const dataChanged =
      prev.schedule !== schedule ||
      prev.users !== users ||
      prev.dayWeights !== dayWeights ||
      prev.dutiesPerDay !== dutiesPerDay ||
      prev.autoScheduleOptions !== autoScheduleOptions ||
      prev.ignoreHistoryInLogic !== ignoreHistoryInLogic;

    prevDataRef.current = {
      schedule,
      users,
      dayWeights,
      dutiesPerDay,
      autoScheduleOptions,
      ignoreHistoryInLogic,
    };

    if (dataChanged) {
      completedCacheRef.current = null;
      prefetchJobRef.current = null;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    const buildWeek = (monday: string): string[] => {
      const base = new Date(monday);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        return toLocalISO(d);
      });
    };

    const runFill = async (targets: string[]): Promise<Record<string, ScheduleEntry>> => {
      const entries = await autoFillSchedule(
        targets,
        users,
        schedule,
        dayWeights,
        dutiesPerDay,
        autoScheduleOptions,
        ignoreHistoryInLogic
      );
      const data: Record<string, ScheduleEntry> = {};
      for (const e of entries) {
        if (e.date) data[e.date] = e;
      }
      return data;
    };

    const startPrefetchJob = (currentMonday: string): PrefetchJob => {
      const nextBase = new Date(currentMonday);
      nextBase.setDate(nextBase.getDate() + 7);
      const nextMonday = toLocalISO(nextBase);
      const nextDates = buildWeek(nextMonday);
      const targets = nextDates.filter(
        (d) => d >= todayStr && toAssignedUserIds(schedule[d]?.userId).length === 0
      );

      const settle: Promise<WeekPreviewResult> =
        targets.length === 0
          ? Promise.resolve({ monday: nextMonday, data: {} })
          : runFill(targets)
              .then((data) => ({ monday: nextMonday, data }))
              .catch(() => ({ monday: nextMonday, data: {} }));

      const job: PrefetchJob = { monday: nextMonday, settle };
      prefetchJobRef.current = job;

      void settle.then((result) => {
        if (prefetchJobRef.current === job) {
          completedCacheRef.current = result;
          prefetchJobRef.current = null;
        }
      });

      return job;
    };

    // ── Case D: cache was applied synchronously during render ────────────
    // Just start prefetching the next-next week.
    if (syncAppliedRef.current) {
      syncAppliedRef.current = false;
      setIsPrefetching(true);

      const timerId = window.setTimeout(async () => {
        const job = startPrefetchJob(weekDates[0]);
        await job.settle;
        if (genRef.current === gen) setIsPrefetching(false);
      }, PREFETCH_DEBOUNCE_MS);

      return () => {
        clearTimeout(timerId);
      };
    }

    // ── Case B: in-flight prefetch for THIS week → subscribe to it ───────
    if (!dataChanged && prefetchJobRef.current?.monday === weekDates[0]) {
      const job = prefetchJobRef.current;
      setIsComputing(true);
      setIsPrefetching(false);

      const timerId = window.setTimeout(async () => {
        const result = await job.settle;
        if (genRef.current !== gen) return;

        setPreviewSchedule(result.data);
        setIsComputing(false);
        setIsPrefetching(true);

        const nextJob = startPrefetchJob(weekDates[0]);
        await nextJob.settle;
        if (genRef.current === gen) setIsPrefetching(false);
      }, 0);

      return () => {
        clearTimeout(timerId);
      };
    }

    // ── Case A (effect-side fallback, rarely hit): completed cache ────────
    const cache = completedCacheRef.current;
    if (!dataChanged && cache !== null && cache.monday === weekDates[0]) {
      completedCacheRef.current = null;
      setIsComputing(false);
      setPreviewSchedule(cache.data);
      setIsPrefetching(true);

      const timerId = window.setTimeout(async () => {
        const job = startPrefetchJob(weekDates[0]);
        await job.settle;
        if (genRef.current === gen) setIsPrefetching(false);
      }, PREFETCH_DEBOUNCE_MS);

      return () => {
        clearTimeout(timerId);
      };
    }

    // ── Case C: no cache, no job — compute from scratch ──────────────────
    const targets = weekDates.filter(
      (d) => d >= todayStr && toAssignedUserIds(schedule[d]?.userId).length === 0
    );

    if (targets.length === 0) {
      // Nothing to preview on THIS week (all past or assigned), but we MUST
      // still prefetch the next week so navigation is instant.
      setPreviewSchedule({});
      setIsComputing(false);
      setIsPrefetching(true);

      const timerId = window.setTimeout(async () => {
        const job = startPrefetchJob(weekDates[0]);
        await job.settle;
        if (genRef.current === gen) setIsPrefetching(false);
      }, PREFETCH_DEBOUNCE_MS);

      return () => {
        clearTimeout(timerId);
      };
    }

    setIsComputing(true);
    setIsPrefetching(false);

    const timerId = window.setTimeout(async () => {
      try {
        const result = await runFill(targets);
        if (genRef.current !== gen) return;

        setPreviewSchedule(result);
        setIsComputing(false);
        setIsPrefetching(true);

        const nextJob = startPrefetchJob(weekDates[0]);
        await nextJob.settle;
      } catch {
        if (genRef.current === gen) setPreviewSchedule({});
      } finally {
        if (genRef.current === gen) {
          setIsComputing(false);
          setIsPrefetching(false);
        }
      }
    }, CURRENT_DEBOUNCE_MS);

    return () => {
      clearTimeout(timerId);
    };
  }, [
    previewMode,
    weekDates,
    schedule,
    users,
    dayWeights,
    dutiesPerDay,
    autoScheduleOptions,
    ignoreHistoryInLogic,
    clearAll,
  ]);

  return { previewMode, previewSchedule, isComputing, isPrefetching, togglePreviewMode };
};
