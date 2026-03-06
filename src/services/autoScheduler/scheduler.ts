// src/services/autoScheduler/scheduler.ts
// Constraint-optimization auto scheduler (fairness accounts + hard constraints).

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { getLogicSchedule, isManualType, toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../../utils/constants';
import {
  countEligibleUsersForDate,
  FLOAT_EPSILON,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  computeGlobalObjective,
  MS_PER_DAY,
} from './helpers';
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

const MAX_SWAP_ITERATIONS = 1500;

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
 * Post-optimisation via multi-phase swap refinement.
 *
 * ─── Phase 1: Pair-exchange swaps ──────────────────────────────────────────
 * Atomically exchange users on two dates: U1 (D1) ↔ U2 (D2).
 * Weekly-balance-neutral (each user moves from one date to another).
 *
 * ─── Phase 2: Single-replacement swaps ─────────────────────────────────────
 * Replace the assigned user on a date with a different hard-eligible user.
 *
 * ─── Phase 3: Targeted same-DOW-consecutive resolution ─────────────────────
 * Specifically looks for users with back-to-back same DOW (7 days apart)
 * and tries pair-swapping the repeat occurrence with another auto-filled date.
 *
 * Acceptance for ALL phases uses the combined global objective
 * (DOW SSE + same-DOW penalty + within-user variance + load range).
 *
 * Iterates until no improvement found or MAX_SWAP_ITERATIONS.
 */
const performSwapOptimization = (
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  autoFilledDateSet: Set<string>,
  tempLoadOffset: Record<number, number>,
  options: AutoScheduleOptions,
  dayWeights: DayWeights
): void => {
  const participants = users.filter(isAutoParticipant);
  const userIds = participants.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  // Work with a stable, sorted list of auto-filled dates.
  const autoFilledDates = dates.filter((d) => autoFilledDateSet.has(d));

  for (let iter = 0; iter < MAX_SWAP_ITERATIONS; iter++) {
    let improved = false;

    // ── Phase 1: Pair-exchange swaps ──────────────────────────────────────
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

        const u1obj = participants.find((u) => u.id === user1);
        const u2obj = participants.find((u) => u.id === user2);
        if (!u1obj || !u2obj) continue;
        if (!isHardEligible(u1obj, date2) || !isHardEligible(u2obj, date1)) continue;

        const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);

        // Apply exchange tentatively.
        tempSchedule[date1] = { ...entry1, userId: user2 };
        tempSchedule[date2] = { ...entry2, userId: user1 };

        const u2ViolatesDate1 =
          minRest > 0 && wouldViolateRestDays(user2, date1, minRest, tempSchedule);
        const u1ViolatesDate2 =
          minRest > 0 && wouldViolateRestDays(user1, date2, minRest, tempSchedule);

        if (u2ViolatesDate1 || u1ViolatesDate2) {
          tempSchedule[date1] = entry1;
          tempSchedule[date2] = entry2;
          continue;
        }

        const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);

        if (newObj < baseObj - FLOAT_EPSILON) {
          improved = true;
          break outerPair;
        } else {
          tempSchedule[date1] = entry1;
          tempSchedule[date2] = entry2;
        }
      }
    }

    if (improved) continue;

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

        const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);

        for (const candidate of candidates) {
          const newIds = [...assignedIds];
          newIds[slotIdx] = candidate.id!;

          const swappedEntry: ScheduleEntry = {
            ...entry,
            userId: newIds.length === 1 ? newIds[0] : newIds,
          };

          tempSchedule[dateStr] = swappedEntry;

          const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);

          if (newObj < baseObj - FLOAT_EPSILON) {
            // forceUseAllWhenFew guard: single swaps change weekly counts.
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

    if (improved) continue;

    // ── Phase 3: Targeted same-DOW-consecutive resolution ────────────────
    // Find users with back-to-back same DOW (7d apart) and try to swap them
    // out of the repeat via pair exchange with another date's user.
    let resolvedSameDow = false;
    for (const uid of userIds) {
      const userDates = autoFilledDates.filter((d) =>
        toAssignedUserIds(tempSchedule[d]?.userId).includes(uid)
      );
      for (let k = 0; k < userDates.length; k++) {
        const d1 = userDates[k];
        for (let m = k + 1; m < userDates.length; m++) {
          const d2 = userDates[m];
          const gap = (new Date(d2).getTime() - new Date(d1).getTime()) / MS_PER_DAY;
          if (gap > 7) break;
          if (gap !== 7 || new Date(d1).getDay() !== new Date(d2).getDay()) continue;

          // d2 is the repeat — try pair exchange
          const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);
          const entry2 = tempSchedule[d2];
          if (!entry2) continue;

          for (const otherDate of autoFilledDates) {
            if (otherDate === d2) continue;
            const otherEntry = tempSchedule[otherDate];
            if (!otherEntry) continue;
            const otherIds = toAssignedUserIds(otherEntry.userId);
            if (otherIds.length !== 1) continue;
            const otherId = otherIds[0];
            if (otherId === uid) continue;

            const uObj = participants.find((u) => u.id === uid);
            const oObj = participants.find((u) => u.id === otherId);
            if (!uObj || !oObj) continue;
            if (!isHardEligible(uObj, otherDate) || !isHardEligible(oObj, d2)) continue;

            // Tentative swap
            tempSchedule[d2] = { ...entry2, userId: otherId };
            tempSchedule[otherDate] = { ...otherEntry, userId: uid };

            const v1 = minRest > 0 && wouldViolateRestDays(otherId, d2, minRest, tempSchedule);
            const v2 = minRest > 0 && wouldViolateRestDays(uid, otherDate, minRest, tempSchedule);

            if (v1 || v2) {
              tempSchedule[d2] = entry2;
              tempSchedule[otherDate] = otherEntry;
              continue;
            }

            const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights);
            if (newObj < baseObj - FLOAT_EPSILON) {
              resolvedSameDow = true;
              break;
            } else {
              tempSchedule[d2] = entry2;
              tempSchedule[otherDate] = otherEntry;
            }
          }
          if (resolvedSameDow) break;
        }
        if (resolvedSameDow) break;
      }
      if (resolvedSameDow) break;
    }

    if (resolvedSameDow) continue;

    // No improvement found in any phase → stable.
    break;
  }
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
 * Pass 2+ (Refinement): Multi-phase swap optimization minimising
 *   the combined global objective Z = W_sameDow * penalties
 *     + W_sse * systemSSE + W_withinUser * variance + W_load * loadRange
 *
 *   Phase 1: Pair-exchange swaps (weekly-balance-neutral)
 *   Phase 2: Single-replacement swaps (forceUseAll-guarded)
 *   Phase 3: Targeted same-DOW-consecutive resolution
 *
 * Iterates swaps until global objective stabilises.
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

  // ─── Post-optimisation: minimise global objective via multi-phase swaps ────
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
