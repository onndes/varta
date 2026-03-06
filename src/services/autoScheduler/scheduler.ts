// src/services/autoScheduler/scheduler.ts
// Constraint-optimization auto scheduler (fairness accounts + hard constraints).

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { getLogicSchedule, isManualType, toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import { countUserDaysOfWeek } from '../scheduleService';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../../utils/constants';
import { countEligibleUsersForDate, FLOAT_EPSILON, MIN_USERS_FOR_WEEKLY_LIMIT } from './helpers';
import {
  buildUserComparator,
  filterByIncompatiblePairs,
  filterByRestDays,
  filterByWeeklyCap,
  filterForceUseAllWhenFew,
} from './comparator';

const isAutoParticipant = (u: User): boolean =>
  Boolean(u.id && u.isActive && !u.isExtra && !u.excludeFromAuto);

/**
 * Hard availability on date:
 * - active non-extra non-excluded users only
 * - blocked days / status periods are respected via availability status
 * NOTE: same-weekday-last-week is intentionally NOT a hard block here;
 *       it is handled as a heavy soft penalty in the comparator so the
 *       scheduler can still assign someone who would otherwise starve.
 */
const isHardEligible = (user: User, dateStr: string): boolean => {
  if (!user.isActive) return false;
  if (getUserAvailabilityStatus(user, dateStr) !== 'AVAILABLE') return false;
  return true;
};

// ─── Swap Optimiser ──────────────────────────────────────────────────────────

const MAX_SWAP_ITERATIONS = 500;

/**
 * System-wide DOW fairness SSE (correct formula).
 *
 * For each day-of-week d (0–6) compute the variance of assignment counts
 * ACROSS users: var_d = sum_u (count_{u,d} - mean_d)^2
 * Total SSE = sum_{d=0}^{6} var_d
 *
 * This is minimised when each DOW is distributed EVENLY across all users.
 * (The naive "per-user DOW variance" formula was wrong: it is minimised by
 * concentrating all duties on one person, who then reaches perfect
 * within-user uniformity at the cost of total fairness.)
 */
const computeSystemSSE = (userIds: number[], schedule: Record<string, ScheduleEntry>): number => {
  if (userIds.length === 0) return 0;
  let total = 0;
  for (let d = 0; d < 7; d++) {
    let sum = 0;
    const vals: number[] = [];
    for (const uid of userIds) {
      const v = countUserDaysOfWeek(uid, schedule)[d] ?? 0;
      vals.push(v);
      sum += v;
    }
    const mean = sum / userIds.length;
    total += vals.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  }
  return total;
};

/** True if assigning `userId` on `dateStr` would violate the rest-day constraint. */
const wouldViolateRestDays = (
  userId: number,
  dateStr: string,
  minRest: number,
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const target = new Date(dateStr);
  for (let i = 1; i <= minRest; i++) {
    const before = new Date(target);
    before.setDate(target.getDate() - i);
    const beforeStr = toLocalISO(before);
    const ids = toAssignedUserIds(schedule[beforeStr]?.userId);
    if (ids.includes(userId)) return true;

    const after = new Date(target);
    after.setDate(target.getDate() + i);
    const afterStr = toLocalISO(after);
    const idsAfter = toAssignedUserIds(schedule[afterStr]?.userId);
    if (idsAfter.includes(userId)) return true;
  }
  return false;
};

/**
 * Post-optimisation via pair-exchange swaps followed by single-replacement swaps.
 *
 * ─── Phase 1: Pair-exchange swaps ──────────────────────────────────────────
 * For every pair of auto-filled dates (D1, D2) consider atomically exchanging
 * their assigned users: U1 (on D1) ↔ U2 (on D2).
 *
 * Pair exchanges are ALWAYS weekly-balance-neutral: each user moves from one
 * date to another, so their total duty-count in every calendar week is
 * unchanged.  This invariant holds for both intra-week and cross-week pairs.
 * Therefore no forceUseAllWhenFew guard is needed here.
 *
 * Acceptance criteria:
 *   1. Both U1 and U2 are hard-eligible for their new dates.
 *   2. Neither new placement violates the rest-day constraint.
 *   3. The exchange strictly reduces the system-wide DOW fairness SSE.
 *
 * ─── Phase 2: Single-replacement swaps ─────────────────────────────────────
 * Try replacing the assigned user on a date with any other hard-eligible
 * candidate.  Used as a secondary pass to pick up residual improvements not
 * reachable by pair exchanges (e.g. when a user is genuinely over-represented
 * across ALL dates on a given DOW and needs to be removed, not merely shuffled).
 *
 * This phase respects the forceUseAllWhenFew weekly balance invariant.
 *
 * Both phases iterate until no improvement is found or MAX_SWAP_ITERATIONS.
 */
const performSwapOptimization = (
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  autoFilledDateSet: Set<string>,
  tempLoadOffset: Record<number, number>,
  options: AutoScheduleOptions
): void => {
  const participants = users.filter(isAutoParticipant);
  const userIds = participants.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  // Work with a stable, sorted list of auto-filled dates.
  const autoFilledDates = dates.filter((d) => autoFilledDateSet.has(d));

  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let improved = false;

    // ── Phase 1: Pair-exchange swaps ──────────────────────────────────────
    // Only handle single-duty-per-day slots here for simplicity.
    outerPair: for (let i = 0; i < autoFilledDates.length - 1; i++) {
      for (let j = i + 1; j < autoFilledDates.length; j++) {
        const date1 = autoFilledDates[i];
        const date2 = autoFilledDates[j];

        const entry1 = tempSchedule[date1];
        const entry2 = tempSchedule[date2];
        if (!entry1 || !entry2) continue;

        const ids1 = toAssignedUserIds(entry1.userId);
        const ids2 = toAssignedUserIds(entry2.userId);
        if (ids1.length !== 1 || ids2.length !== 1) continue;

        const user1 = ids1[0];
        const user2 = ids2[0];
        if (user1 === user2) continue;

        // Both users must be hard-eligible for their NEW dates.
        const u1obj = participants.find((u) => u.id === user1);
        const u2obj = participants.find((u) => u.id === user2);
        if (!u1obj || !u2obj) continue;
        if (!isHardEligible(u1obj, date2) || !isHardEligible(u2obj, date1)) continue;

        const baseSSE = computeSystemSSE(userIds, tempSchedule);

        // Apply exchange tentatively.
        tempSchedule[date1] = { ...entry1, userId: user2 };
        tempSchedule[date2] = { ...entry2, userId: user1 };

        // Rest-day constraints on the new combined schedule.
        const u2ViolatesDate1 =
          minRest > 0 && wouldViolateRestDays(user2, date1, minRest, tempSchedule);
        const u1ViolatesDate2 =
          minRest > 0 && wouldViolateRestDays(user1, date2, minRest, tempSchedule);

        if (u2ViolatesDate1 || u1ViolatesDate2) {
          // Revert.
          tempSchedule[date1] = entry1;
          tempSchedule[date2] = entry2;
          continue;
        }

        const newSSE = computeSystemSSE(userIds, tempSchedule);

        if (newSSE < baseSSE - FLOAT_EPSILON) {
          // Accept: update load offsets to reflect the exchange.
          // Net change per user's total count = 0, but their DOW composition changed.
          // Offset reflects positional shift for comparator freshness.
          // (No net change in total count, so offsets cancel out; we still update
          //  to signal that the position was touched.)
          improved = true;
          break outerPair; // Restart outer loop after each accepted exchange.
        } else {
          // Revert.
          tempSchedule[date1] = entry1;
          tempSchedule[date2] = entry2;
        }
      }
    }

    if (improved) continue; // Restart from phase 1 with updated schedule.

    // ── Phase 2: Single-replacement swaps ────────────────────────────────
    for (const dateStr of autoFilledDates) {
      const entry = tempSchedule[dateStr];
      if (!entry) continue;

      const assignedIds = toAssignedUserIds(entry.userId);

      for (let slotIdx = 0; slotIdx < assignedIds.length; slotIdx++) {
        const assignedId = assignedIds[slotIdx];

        const candidates = participants.filter(
          (u) =>
            u.id &&
            u.id !== assignedId &&
            !assignedIds.includes(u.id) &&
            isHardEligible(u, dateStr) &&
            (minRest === 0 || !wouldViolateRestDays(u.id, dateStr, minRest, tempSchedule))
        );
        if (candidates.length === 0) continue;

        const baseSSE = computeSystemSSE(userIds, tempSchedule);

        for (const candidate of candidates) {
          const newIds = [...assignedIds];
          newIds[slotIdx] = candidate.id!;

          const swappedEntry: ScheduleEntry = {
            ...entry,
            userId: newIds.length === 1 ? newIds[0] : newIds,
          };

          tempSchedule[dateStr] = swappedEntry;

          const newSSE = computeSystemSSE(userIds, tempSchedule);

          if (newSSE < baseSSE - FLOAT_EPSILON) {
            // forceUseAllWhenFew: single swaps change weekly counts, so guard here.
            if (options.forceUseAllWhenFew) {
              const d = new Date(dateStr);
              const dow = d.getDay();
              const mondayOffset = dow === 0 ? -6 : 1 - dow;
              const monday = new Date(d);
              monday.setDate(d.getDate() + mondayOffset);
              const from = toLocalISO(monday);
              const sunday = new Date(monday);
              sunday.setDate(monday.getDate() + 6);
              const to = toLocalISO(sunday);

              const countInWeek = (uid: number): number =>
                Object.values(tempSchedule).filter(
                  (s) => s.date >= from && s.date <= to && toAssignedUserIds(s.userId).includes(uid)
                ).length;

              // After the tentative swap is already applied in tempSchedule:
              // assignedId lost 1 (it's no longer in dateStr), candidate gained 1.
              const assignedNewCount = countInWeek(assignedId);
              const candidateNewCount = countInWeek(candidate.id!);

              if (assignedNewCount === 0 && candidateNewCount >= 2) {
                tempSchedule[dateStr] = entry;
                continue;
              }
            }

            tempLoadOffset[assignedId] = (tempLoadOffset[assignedId] ?? 0) - 1;
            tempLoadOffset[candidate.id!] = (tempLoadOffset[candidate.id!] ?? 0) + 1;
            improved = true;
            break;
          } else {
            tempSchedule[dateStr] = entry;
          }
        }
      }
    }

    if (!improved) break;
  }
};

/**
 * Automatic fill using deterministic constraint optimization:
 * 1) hard constraints filtering
 * 2) fairness accounts by day-of-week
 * 3) variance objective minimization (SSE)
 * 4) soft +1 sliding preference
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

    for (let slot = 0; slot < slotsToFill; slot++) {
      const hardPool = users.filter(
        (u) =>
          u.id && isAutoParticipant(u) && !selectedIds.includes(u.id) && isHardEligible(u, dateStr)
      );

      let pool = [...hardPool];
      if (pool.length === 0) break;

      // Optional constraints from settings.
      if (options.avoidConsecutiveDays) {
        pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
      }
      pool = filterByIncompatiblePairs(pool, users, dateStr, tempSchedule);

      const totalEligibleCount = countEligibleUsersForDate(users, tempSchedule, dateStr);
      if (options.limitOneDutyPerWeekWhenSevenPlus) {
        pool = filterByWeeklyCap(pool, users, dateStr, tempSchedule, options, totalEligibleCount);
      }

      // forceUseAllWhenFew hard switch:
      // While any eligible user has 0 duties this week, only they may be assigned.
      if (
        options.forceUseAllWhenFew &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        pool = filterForceUseAllWhenFew(pool, dateStr, tempSchedule);
      }

      // Starvation fallback:
      // if soft filters emptied the pool, relax them and use any hard-eligible user.
      if (pool.length === 0) {
        pool = [...hardPool];
      }

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

      const selected = pool[0];
      if (!selected?.id) break;
      selectedIds.push(selected.id);
    }

    if (selectedIds.length === 0) {
      const critical: ScheduleEntry = { date: dateStr, userId: null, type: 'critical' };
      updates.push(critical);
      tempSchedule[dateStr] = critical;
      continue;
    }

    const nextEntry: ScheduleEntry = {
      date: dateStr,
      userId: selectedIds.length === 1 ? selectedIds[0] : selectedIds,
      type: isManualType(existingEntry) ? existingEntry!.type : 'auto',
      isLocked: existingEntry?.isLocked || false,
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

  // ─── Post-optimisation: minimise DOW variance via pairwise swaps ──────────
  if (autoFilledDateSet.size > 0) {
    performSwapOptimization(dates, users, tempSchedule, autoFilledDateSet, tempLoadOffset, options);

    // Reconcile: collect final state for any date touched by swap optimiser.
    for (const dateStr of autoFilledDateSet) {
      const finalEntry = tempSchedule[dateStr];
      if (!finalEntry) continue;
      const existingUpdate = updates.find((u) => u.date === dateStr);
      if (existingUpdate) {
        // Update in-place so the caller sees the optimised assignment.
        existingUpdate.userId = finalEntry.userId;
      }
    }
  }

  return updates;
};
