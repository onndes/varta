// src/services/autoScheduler/scheduler.ts
// Constraint-optimization auto scheduler (fairness accounts + hard constraints).
// Decision logging, adaptive iterations, strengthened zero-guard.

import type {
  User,
  ScheduleEntry,
  DayWeights,
  AutoScheduleOptions,
  DecisionLog,
  CandidateSnapshot,
  FilterStepResult,
  SchedulerProgressCallback,
} from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { getLogicSchedule, isManualType, toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../../utils/constants';
import {
  countEligibleUsersForWeek,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  daysSinceLastAssignment,
  daysSinceLastSameDowAssignment,
  computeUserLoadRate,
  countUserAssignmentsInRange,
  getWeekWindow,
  computeGlobalObjective,
} from './helpers';
import { countUserDaysOfWeek } from '../scheduleService';
import {
  buildUserComparator,
  filterByIncompatiblePairs,
  filterByRestDays,
  filterBySameWeekdayLastWeek,
  filterByWeeklyCap,
  filterForceUseAllWhenFew,
  filterEvenWeeklyDistribution,
} from './comparator';
import {
  isAutoParticipant,
  isHardEligible,
  isLookAheadSafe,
  performSwapOptimization,
  performTabuSearch,
  performMultiRestartOptimization,
} from './swapOptimizer';
import { buildDecisionLog } from './decisionLog';
import { FILTER_PHRASES } from './decisionPhrases';

/** Track a filter step for the enhanced decision log pipeline. */
const trackFilterStep = (name: string, prePool: User[], postPool: User[]): FilterStepResult => {
  const postIds = new Set(postPool.map((u) => u.id!));
  const eliminated = prePool
    .filter((u) => !postIds.has(u.id!))
    .map((u) => ({ userId: u.id!, userName: u.name }));
  return {
    filterName: name,
    inputCount: prePool.length,
    outputCount: postPool.length,
    eliminated,
    reason: FILTER_PHRASES[name] || name,
    wasFallback: false, // Will be refined below in the pipeline
  };
};

/**
 * Lightweight forward simulation to score a candidate pick.
 * Clones tempSchedule, places the candidate on dateStr, then runs a
 * simplified greedy pass on the next `depth` unfilled dates.
 * Returns the global objective Z of the resulting simulated schedule.
 */
const simulateForwardScore = (
  candidate: User,
  dateStr: string,
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  depth: number,
  fairnessUsers: User[]
): number => {
  const sim = { ...tempSchedule };
  sim[dateStr] = { date: dateStr, userId: candidate.id!, type: 'auto' as const };
  const userIds = fairnessUsers.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  // Simulate the next `depth` unfilled future dates
  const futureDates = dates.filter((d) => d > dateStr).slice(0, depth);
  for (const futDate of futureDates) {
    const existing = sim[futDate];
    if (existing && toAssignedUserIds(existing.userId).length > 0) continue;

    // Hard-eligible pool for future date
    const hardPool = users.filter(
      (u) => u.id && isAutoParticipant(u) && isHardEligible(u, futDate)
    );
    if (hardPool.length === 0) continue;

    // Basic filters: rest days + same-DOW-last-week + weekly fairness
    let pool = hardPool;
    if (minRest > 0) {
      const filtered = filterByRestDays(pool, futDate, minRest, sim);
      if (filtered.length > 0) pool = filtered;
    }
    const filtered2 = filterBySameWeekdayLastWeek(
      pool,
      futDate,
      sim,
      !options.evenWeeklyDistribution
    );
    if (filtered2.length > 0) pool = filtered2;

    const totalEligible = countEligibleUsersForWeek(users, sim, futDate);

    // Weekly fairness filters (same as main pipeline)
    if (
      options.forceUseAllWhenFew &&
      totalEligible !== undefined &&
      totalEligible <= MIN_USERS_FOR_WEEKLY_LIMIT
    ) {
      const filtered = filterForceUseAllWhenFew(pool, futDate, sim);
      if (filtered.length > 0) pool = filtered;
    }
    if (
      options.evenWeeklyDistribution &&
      totalEligible !== undefined &&
      totalEligible <= MIN_USERS_FOR_WEEKLY_LIMIT
    ) {
      const filtered = filterEvenWeeklyDistribution(pool, futDate, sim);
      if (filtered.length > 0) pool = filtered;
    }

    const fairSim = getLogicSchedule(sim, false);
    const compare = buildUserComparator(
      futDate,
      sim,
      dayWeights,
      options,
      undefined,
      fairSim,
      totalEligible,
      pool,
      fairnessUsers
    );
    pool.sort(compare);
    if (pool.length > 0 && pool[0].id) {
      sim[futDate] = { date: futDate, userId: pool[0].id, type: 'auto' as const };
    }
  }

  return computeGlobalObjective(userIds, sim, dayWeights, users);
};

/**
 * Multi-pass automatic fill using constraint optimization:
 *
 * Pass 1 (Draft): Greedy assignment using the comparator with:
 *   - Cross-DOW zero guard (Priority -2)
 *   - forceUseAllWhenFew (Priority -1)
 *   - DOW count fairness (Priority 0)
 *   - Exponential same-DOW penalty (Priority 2)
 *   - +1 shift rotation preference (Priority 3)
 *
 * Pass 2+ (Refinement): Multi-phase swap optimization minimizing
 *   the combined global objective Z = W_sameDow * penalties
 *     + W_sse * systemSSE + W_withinUser * variance + W_load * loadRange
 *
 *   Phase 1: Pair-exchange swaps (weekly-balance-neutral)
 *   Phase 2: Single-replacement swaps (forceUseAll-guarded)
 *   Phase 3: Targeted same-DOW-consecutive resolution
 *
 * Iterates swaps until global objective stabilizes.
 */
export const autoFillSchedule = async (
  targetDates: string[],
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay = 1,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  ignoreHistoryInLogic = false,
  onProgress?: SchedulerProgressCallback,
  abortSignal?: AbortSignal
): Promise<ScheduleEntry[]> => {
  const updates: ScheduleEntry[] = [];
  const tempSchedule = { ...schedule };
  const todayStr = toLocalISO(new Date());
  const slotsPerDay = Math.max(1, dutiesPerDay);
  const fairnessUsers = users.filter(isAutoParticipant);
  const tempLoadOffset: Record<number, number> = {};
  // Track which dates were auto-filled by THIS run (needed for swap opt).
  const autoFilledDateSet = new Set<string>();

  // Deterministic order is important for reproducibility.
  const dates = [...targetDates].sort();
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  for (const dateStr of dates) {
    if (dateStr < todayStr) continue;

    const existingEntry = tempSchedule[dateStr];
    const existingIds = toAssignedUserIds(existingEntry?.userId);

    if (
      (existingEntry?.isLocked || isManualType(existingEntry)) &&
      existingIds.length >= slotsPerDay
    ) {
      continue;
    }

    const selectedIds: number[] = [...existingIds];
    const slotsToFill = Math.max(0, slotsPerDay - selectedIds.length);

    // Track pool sizes at each stage for decision log
    const logPoolSizes = {
      initial: 0,
      afterHardEligible: 0,
      afterRestDays: 0,
      afterIncompatiblePairs: 0,
      afterWeeklyCap: 0,
      afterForceUseAll: 0,
      final: 0,
    };
    const logAlternatives: CandidateSnapshot[] = [];
    let logFilterPipeline: FilterStepResult[] = [];
    let logAllAutoUsers: User[] = [];
    let lookaheadOverride: import('../../types').OptimizerHistoryEntry | undefined;

    for (let slot = 0; slot < slotsToFill; slot++) {
      const allAutoUsers = users.filter(
        (u) => u.id && isAutoParticipant(u) && !selectedIds.includes(u.id)
      );
      logAllAutoUsers = allAutoUsers;
      logPoolSizes.initial = allAutoUsers.length;

      const hardPool = allAutoUsers.filter((u) => isHardEligible(u, dateStr));
      logPoolSizes.afterHardEligible = hardPool.length;

      // Record hard-rejected users for decision log
      const hardRejected = allAutoUsers.filter((u) => !isHardEligible(u, dateStr));
      for (const u of hardRejected) {
        const status = getUserAvailabilityStatus(u, dateStr);
        let reason: string = 'hard_inactive';
        if (status === 'STATUS_BUSY') reason = 'hard_status_busy';
        else if (status === 'DAY_BLOCKED') reason = 'hard_day_blocked';
        else if (status === 'BIRTHDAY') reason = 'hard_birthday';
        else if (status === 'REST_DAY' || status === 'PRE_STATUS_DAY') reason = 'hard_rest_day';
        logAlternatives.push({
          userId: u.id!,
          userName: u.name,
          rejected: true,
          rejectPhase: 'hardConstraint',
          rejectReason: `${reason} (${status})`,
          metrics: null,
        });
      }

      let pool = [...hardPool];
      if (pool.length === 0) break;

      // Enhanced decision log: track filter pipeline steps
      const filterPipeline: FilterStepResult[] = [];

      // Track hard eligibility step
      filterPipeline.push(trackFilterStep('hardEligible', allAutoUsers, hardPool));

      // Optional constraints from settings.
      if (options.avoidConsecutiveDays) {
        const preRestPool = [...pool];
        pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
        const step = trackFilterStep('restDays', preRestPool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preRestPool.length === pool.length &&
          preRestPool.length > 0;
        filterPipeline.push(step);
      }
      logPoolSizes.afterRestDays = pool.length;

      {
        const preIncompatPool = [...pool];
        pool = filterByIncompatiblePairs(pool, users, dateStr, tempSchedule);
        const step = trackFilterStep('incompatiblePairs', preIncompatPool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preIncompatPool.length === pool.length &&
          preIncompatPool.length > 0;
        filterPipeline.push(step);
      }
      logPoolSizes.afterIncompatiblePairs = pool.length;

      {
        const preSameDowPool = [...pool];
        pool = filterBySameWeekdayLastWeek(
          pool,
          dateStr,
          tempSchedule,
          !options.evenWeeklyDistribution // starvation exception disabled when evenWeekly is ON
        );
        const step = trackFilterStep('sameWeekdayLastWeek', preSameDowPool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preSameDowPool.length === pool.length &&
          preSameDowPool.length > 0;
        filterPipeline.push(step);
      }

      // Use week-based eligibility count for both forceUseAllWhenFew and the
      // comparator's totalEligibleCount parameter — consistent with filterByWeeklyCap.
      const totalEligibleCount = countEligibleUsersForWeek(users, tempSchedule, dateStr);
      if (options.limitOneDutyPerWeekWhenSevenPlus) {
        const preCapPool = [...pool];
        pool = filterByWeeklyCap(pool, users, dateStr, tempSchedule, options);
        const step = trackFilterStep('weeklyCap', preCapPool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preCapPool.length === pool.length &&
          preCapPool.length > 0;
        filterPipeline.push(step);
      }
      logPoolSizes.afterWeeklyCap = pool.length;

      // forceUseAllWhenFew hard switch:
      // While any eligible user has 0 duties this week, only they may be assigned.
      if (
        options.forceUseAllWhenFew &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        const preForcePool = [...pool];
        pool = filterForceUseAllWhenFew(pool, dateStr, tempSchedule);
        const step = trackFilterStep('forceUseAll', preForcePool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preForcePool.length === pool.length &&
          preForcePool.length > 0;
        filterPipeline.push(step);
      }

      // evenWeeklyDistribution: multi-round round-robin.
      // Nobody gets an (N+1)-th duty while someone else still has N.
      // Extends forceUseAllWhenFew to all rounds, not just the first.
      if (
        options.evenWeeklyDistribution &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        const preEvenPool = [...pool];
        pool = filterEvenWeeklyDistribution(pool, dateStr, tempSchedule);
        const step = trackFilterStep('evenDistribution', preEvenPool, pool);
        step.wasFallback =
          step.eliminated.length === 0 &&
          preEvenPool.length === pool.length &&
          preEvenPool.length > 0;
        filterPipeline.push(step);
      }
      logPoolSizes.afterForceUseAll = pool.length;

      // Fairness recovery: if soft filters (especially sameWeekdayLastWeek) removed
      // all zero-duty users from the pool while zero-duty users exist in hardPool,
      // add them back. This prevents the scenario where a user's only remaining
      // available slot in the week coincides with the same DOW they served last week,
      // causing them to be filtered out and another user to get a 2nd duty.
      if (
        (options.forceUseAllWhenFew || options.evenWeeklyDistribution) &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT &&
        pool.length > 0
      ) {
        const week = getWeekWindow(dateStr);
        const poolHasZero = pool.some(
          (u) => countUserAssignmentsInRange(u.id!, tempSchedule, week.from, week.to) === 0
        );
        if (!poolHasZero) {
          const zeroDutyHard = hardPool.filter(
            (u) =>
              !selectedIds.includes(u.id!) &&
              countUserAssignmentsInRange(u.id!, tempSchedule, week.from, week.to) === 0
          );
          if (zeroDutyHard.length > 0) {
            pool = zeroDutyHard;
            filterPipeline.push(trackFilterStep('fairnessRecovery', [...hardPool], pool));
          }
        }
      }

      // Starvation fallback:
      // if soft filters emptied the pool, relax them and use any hard-eligible user.
      if (pool.length === 0) {
        pool = [...hardPool];
      }
      logPoolSizes.final = pool.length;
      logFilterPipeline = filterPipeline;

      if (pool.length === 0) break;

      const fairnessSchedule = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
      const compare = buildUserComparator(
        dateStr,
        tempSchedule,
        dayWeights,
        options,
        undefined,
        fairnessSchedule,
        totalEligibleCount,
        pool,
        fairnessUsers
      );
      pool.sort(compare);

      // Candidate selection: basic starvation guard + optional deep lookahead
      let selected = pool[0];
      const lookaheadDepth = options.lookaheadDepth || 0;

      if (lookaheadDepth > 0 && pool.length > 1) {
        // Deep lookahead: evaluate top-K candidates by simulating forward
        const K = Math.min(pool.length, options.lookaheadCandidates || 3);
        const topCandidates = pool
          .slice(0, K)
          .filter((c) =>
            isLookAheadSafe(c, dateStr, dates, users, tempSchedule, selectedIds, minRest)
          );
        // Fall back to full top-K if all fail starvation check
        const candidates = topCandidates.length > 0 ? topCandidates : pool.slice(0, K);

        let bestScore = Infinity;
        const greedyPick = pool[0];
        for (const candidate of candidates) {
          const score = simulateForwardScore(
            candidate,
            dateStr,
            dates,
            users,
            tempSchedule,
            dayWeights,
            options,
            lookaheadDepth,
            fairnessUsers
          );
          if (score < bestScore) {
            bestScore = score;
            selected = candidate;
          }
        }
        // Log when lookahead overrides the greedy pick
        if (selected.id !== greedyPick.id) {
          lookaheadOverride = {
            phase: 'lookahead',
            description:
              `Lookahead (глибина ${lookaheadDepth}) обрав ${selected.name} замість ${greedyPick.name} ` +
              `(Z: ${bestScore.toFixed(1)})`,
            previousUserId: greedyPick.id,
            previousUserName: greedyPick.name,
            newUserId: selected.id,
            newUserName: selected.name,
            zAfter: bestScore,
            rejectionReason: `Lookahead виявив, що ${greedyPick.name} створює «пастку» на наступних ${lookaheadDepth} днях — ${selected.name} дає кращий майбутній Z`,
          };
        }
      } else if (pool.length > 1) {
        // Basic starvation guard: prefer highest-ranked that does NOT starve a future date
        for (const candidate of pool) {
          if (
            isLookAheadSafe(candidate, dateStr, dates, users, tempSchedule, selectedIds, minRest)
          ) {
            selected = candidate;
            break;
          }
        }
      }
      if (!selected?.id) break;
      selectedIds.push(selected.id);

      // Build alternative snapshots for non-selected candidates
      const dayIdx = new Date(dateStr).getDay();
      const week = getWeekWindow(dateStr);
      for (let ci = 1; ci < Math.min(pool.length, 6); ci++) {
        const alt = pool[ci];
        if (!alt.id) continue;
        const altDowCount = countUserDaysOfWeek(alt.id, fairnessSchedule)[dayIdx] || 0;
        const selDowCount = countUserDaysOfWeek(selected.id, fairnessSchedule)[dayIdx] || 0;
        let criterion = 'outranked';
        if (altDowCount > selDowCount) criterion = 'dowCount';
        logAlternatives.push({
          userId: alt.id,
          userName: alt.name,
          rejected: false,
          rejectPhase: 'comparator',
          rejectReason: `outranked at ${criterion}`,
          metrics: {
            dowCount: altDowCount,
            sameDowPenalty:
              daysSinceLastSameDowAssignment(alt.id, fairnessSchedule, dateStr) <= 7 ? 100 : 0,
            loadRate: computeUserLoadRate(alt.id, fairnessSchedule, dateStr, fairnessUsers),
            waitDays: daysSinceLastAssignment(alt.id, fairnessSchedule, dateStr),
            weeklyCount: countUserAssignmentsInRange(alt.id, fairnessSchedule, week.from, week.to),
          },
        });
      }
    }

    if (selectedIds.length === 0) {
      const critical: ScheduleEntry = { date: dateStr, userId: null, type: 'critical' };
      updates.push(critical);
      tempSchedule[dateStr] = critical;
      continue;
    }

    // Build decision log for this entry
    const assignedId = selectedIds[selectedIds.length - 1]; // last assigned by this slot
    const fairnessSchedule = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
    const dayIdx = new Date(dateStr).getDay();
    const week = getWeekWindow(dateStr);
    const pop = fairnessUsers.map((u) => u.id!);

    const decisionLog: DecisionLog = buildDecisionLog(
      assignedId,
      dateStr,
      dayIdx,
      fairnessSchedule,
      fairnessUsers,
      pop,
      logPoolSizes,
      logAlternatives,
      week,
      dates,
      logFilterPipeline,
      logAllAutoUsers,
      options,
      dayWeights[dayIdx]
    );

    // Attach lookahead override if it happened during candidate selection
    if (lookaheadOverride) {
      decisionLog.optimizerHistory = [lookaheadOverride];
    }

    const nextEntry: ScheduleEntry = {
      date: dateStr,
      userId: selectedIds.length === 1 ? selectedIds[0] : selectedIds,
      type: isManualType(existingEntry) ? existingEntry!.type : 'auto',
      isLocked: existingEntry?.isLocked || false,
      decisionLog,
    };

    const prevIds = toAssignedUserIds(existingEntry?.userId);
    const changed =
      !existingEntry ||
      prevIds.length !== selectedIds.length ||
      prevIds.some((id) => !selectedIds.includes(id));

    if (changed) {
      updates.push(nextEntry);
      tempSchedule[dateStr] = nextEntry;
      autoFilledDateSet.add(dateStr);
    }
  }

  // ─── Post-optimization: minimize global objective via multi-phase swaps ────
  if (autoFilledDateSet.size > 0) {
    // Shared optimizer history log — populated by Phases 1-3 and Tabu Search,
    // then attached to each affected entry's decisionLog for the info modal.
    const optimizerLog = new Map<string, import('../../types').OptimizerHistoryEntry[]>();

    onProgress?.('Оптимізація (фази 1-3)', 0);
    await performSwapOptimization(
      dates,
      users,
      tempSchedule,
      autoFilledDateSet,
      tempLoadOffset,
      options,
      dayWeights,
      onProgress,
      optimizerLog
    );

    // Tabu Search: Phase 4 metaheuristic post-optimization
    if (options.useTabuSearch) {
      onProgress?.('Tabu Search', 0);
      await performTabuSearch(
        dates,
        users,
        tempSchedule,
        autoFilledDateSet,
        options,
        dayWeights,
        onProgress,
        optimizerLog
      );
    }

    // Multi-Restart (Phase 5): Iterated Local Search within time budget.
    // Runs after all other optimizers — uses their result as the starting point.
    if (options.useMultiRestart) {
      const timeoutMs = options.multiRestartTimeoutMs ?? 30_000;
      const strategyLabel = options.multiRestartStrategy === 'lns' ? 'LNS' : 'Multi-Restart';
      onProgress?.(strategyLabel, 0);
      await performMultiRestartOptimization(
        dates,
        users,
        tempSchedule,
        autoFilledDateSet,
        options,
        dayWeights,
        timeoutMs,
        onProgress,
        abortSignal,
        slotsPerDay
      );
    }

    // Reconcile: collect final state for any date touched by swap optimizer.
    // Rebuild decision logs for entries whose assignment changed during swaps,
    // so the info button shows metrics for the ACTUAL assigned user.
    const fairnessScheduleFinal = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
    const pop = fairnessUsers.map((u) => u.id!);

    for (const dateStr of autoFilledDateSet) {
      const finalEntry = tempSchedule[dateStr];
      if (!finalEntry) continue;
      const existingUpdate = updates.find((u) => u.date === dateStr);
      if (!existingUpdate) continue;

      const oldIds = toAssignedUserIds(existingUpdate.userId);
      const newIds = toAssignedUserIds(finalEntry.userId);
      existingUpdate.userId = finalEntry.userId;

      // Rebuild decision log if the assigned user changed.
      const changed =
        oldIds.length !== newIds.length || oldIds.some((id, idx) => id !== newIds[idx]);
      if (changed) {
        const assignedId = newIds[newIds.length - 1];
        const dayIdx = new Date(dateStr).getDay();
        const week = getWeekWindow(dateStr);

        // Exclude current date from schedule so dowCount reflects state-before-assignment
        // (matches greedy pass behaviour where buildDecisionLog is called before the entry
        // is written to tempSchedule).
        const scheduleWithoutDate = { ...fairnessScheduleFinal };
        delete scheduleWithoutDate[dateStr];

        existingUpdate.decisionLog = buildDecisionLog(
          assignedId,
          dateStr,
          dayIdx,
          scheduleWithoutDate,
          fairnessUsers,
          pop,
          existingUpdate.decisionLog?.debug?.poolSizes || {
            initial: 0,
            afterHardEligible: 0,
            afterRestDays: 0,
            afterIncompatiblePairs: 0,
            afterWeeklyCap: 0,
            afterForceUseAll: 0,
            final: 0,
          },
          [], // alternatives from greedy pass are stale after swap
          week,
          dates,
          undefined,
          undefined,
          undefined,
          dayWeights[dayIdx]
        );
        // Mark that this entry was changed by swap optimization
        existingUpdate.decisionLog.wasSwapOptimized = true;
        // Attach optimizer history if available
        const dateHistory = optimizerLog.get(dateStr);
        if (dateHistory && dateHistory.length > 0) {
          existingUpdate.decisionLog.optimizerHistory = dateHistory;
        }
      }
    }
  }

  return updates;
};
