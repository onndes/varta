// src/hooks/useSchedulePreview.ts
// Preview Mode: runs autoFillSchedule without saving — shows what auto-generation
// would produce for each future week without committing anything to the DB.
//
// Multi-week chaining:
//   Each week's preview is computed using DB schedule MERGED with all prior
//   cached preview results, so week N+2's preview "sees" the preview from N+1.
//   This produces a realistic multi-week lookahead.
//
// Multi-week cache (cacheMapRef):
//   Stores computed previews for every visited week in a Map<monday, data>.
//   After the current week is rendered, the hook prefetches N+1 and stores
//   the result in the same map.
//
//   On navigation (forward OR backward):
//    ┌─ Render phase (before paint) ────────────────────────────────────────┐
//    │  cacheMapRef.has(N)?                                                  │
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
//   Eviction: cached weeks more than 28 days behind the current monday are
//   evicted. Future weeks are kept so the chain stays intact.
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

/** Delete cache entries whose monday is more than 28 days behind `currentMonday`. */
const evictOldWeeks = (map: Map<string, Record<string, ScheduleEntry>>, currentMonday: string) => {
  const limit = new Date(currentMonday);
  limit.setDate(limit.getDate() - 28);
  const limitStr = toLocalISO(limit);
  for (const key of [...map.keys()]) {
    if (key < limitStr) map.delete(key);
  }
};

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
  const cacheMapRef = useRef(new Map<string, Record<string, ScheduleEntry>>());
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
    cacheMapRef.current.clear();
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
  // When weekDates[0] changes (navigation), we check cacheMapRef.
  // If there's a hit we call setState during render, which makes React
  // DISCARD the current (blank) render and restart with the cached preview.
  // The browser never paints the blank frame → zero flicker.
  // ═══════════════════════════════════════════════════════════════════════════
  const [prevMonday, setPrevMonday] = useState(weekDates[0]);

  if (weekDates[0] !== prevMonday) {
    setPrevMonday(weekDates[0]);

    // Evict old cached weeks to bound memory usage.
    evictOldWeeks(cacheMapRef.current, weekDates[0]);

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
      const cached = cacheMapRef.current.get(weekDates[0]);
      if (cached) {
        // ✅ Cache hit — apply instantly before paint.
        setPreviewSchedule(cached);
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
      cacheMapRef.current.clear();
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

    /** Build a merged schedule: DB data + all cached preview entries. */
    const getMergedSchedule = (): Record<string, ScheduleEntry> => {
      const merged = { ...schedule };
      for (const data of cacheMapRef.current.values()) {
        for (const [date, entry] of Object.entries(data)) {
          if (!merged[date] || toAssignedUserIds(merged[date].userId).length === 0) {
            merged[date] = entry;
          }
        }
      }
      return merged;
    };

    const runFill = async (targets: string[]): Promise<Record<string, ScheduleEntry>> => {
      const mergedSchedule = getMergedSchedule();
      const entries = await autoFillSchedule(
        targets,
        users,
        mergedSchedule,
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

      // Already cached — return instantly resolved job.
      const existing = cacheMapRef.current.get(nextMonday);
      if (existing !== undefined) {
        return {
          monday: nextMonday,
          settle: Promise.resolve({ monday: nextMonday, data: existing }),
        };
      }

      // Already in flight — reuse.
      if (prefetchJobRef.current?.monday === nextMonday) {
        return prefetchJobRef.current;
      }

      const nextDates = buildWeek(nextMonday);
      const mergedSchedule = getMergedSchedule();
      const targets = nextDates.filter(
        (d) => d >= todayStr && toAssignedUserIds(mergedSchedule[d]?.userId).length === 0
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
          cacheMapRef.current.set(result.monday, result.data);
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

        cacheMapRef.current.set(weekDates[0], result.data);
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
    const cachedData = cacheMapRef.current.get(weekDates[0]);
    if (!dataChanged && cachedData) {
      setIsComputing(false);
      setPreviewSchedule(cachedData);
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
    const mergedScheduleForTargets = getMergedSchedule();
    const targets = weekDates.filter(
      (d) => d >= todayStr && toAssignedUserIds(mergedScheduleForTargets[d]?.userId).length === 0
    );

    if (targets.length === 0) {
      // Nothing to preview on THIS week (all past or assigned), but we MUST
      // still prefetch the next week so navigation is instant.
      setPreviewSchedule({});
      cacheMapRef.current.set(weekDates[0], {});
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

        cacheMapRef.current.set(weekDates[0], result);
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
