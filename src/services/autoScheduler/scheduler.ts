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
} from './swapOptimizer';
import { buildDecisionLog } from './decisionLog';

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
  ignoreHistoryInLogic = false
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

    for (let slot = 0; slot < slotsToFill; slot++) {
      const allAutoUsers = users.filter(
        (u) => u.id && isAutoParticipant(u) && !selectedIds.includes(u.id)
      );
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

      // Optional constraints from settings.
      if (options.avoidConsecutiveDays) {
        pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
      }
      logPoolSizes.afterRestDays = pool.length;

      pool = filterByIncompatiblePairs(pool, users, dateStr, tempSchedule);
      logPoolSizes.afterIncompatiblePairs = pool.length;

      pool = filterBySameWeekdayLastWeek(
        pool,
        dateStr,
        tempSchedule,
        !options.evenWeeklyDistribution // starvation exception disabled when evenWeekly is ON
      );

      // Use week-based eligibility count for both forceUseAllWhenFew and the
      // comparator's totalEligibleCount parameter — consistent with filterByWeeklyCap.
      const totalEligibleCount = countEligibleUsersForWeek(users, tempSchedule, dateStr);
      if (options.limitOneDutyPerWeekWhenSevenPlus) {
        pool = filterByWeeklyCap(pool, users, dateStr, tempSchedule, options);
      }
      logPoolSizes.afterWeeklyCap = pool.length;

      // forceUseAllWhenFew hard switch:
      // While any eligible user has 0 duties this week, only they may be assigned.
      if (
        options.forceUseAllWhenFew &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        pool = filterForceUseAllWhenFew(pool, dateStr, tempSchedule);
      }

      // evenWeeklyDistribution: multi-round round-robin.
      // Nobody gets an (N+1)-th duty while someone else still has N.
      // Extends forceUseAllWhenFew to all rounds, not just the first.
      if (
        options.evenWeeklyDistribution &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        pool = filterEvenWeeklyDistribution(pool, dateStr, tempSchedule);
      }
      logPoolSizes.afterForceUseAll = pool.length;

      // Starvation fallback:
      // if soft filters emptied the pool, relax them and use any hard-eligible user.
      if (pool.length === 0) {
        pool = [...hardPool];
      }
      logPoolSizes.final = pool.length;

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

      // Look-ahead: prefer the highest-ranked candidate that does NOT
      // starve a future date. Falls back to pool[0] if all would starve.
      let selected = pool[0];
      if (pool.length > 1) {
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
      dates
    );

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
    performSwapOptimization(
      dates,
      users,
      tempSchedule,
      autoFilledDateSet,
      tempLoadOffset,
      options,
      dayWeights
    );

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
          dates
        );
      }
    }
  }

  return updates;
};
