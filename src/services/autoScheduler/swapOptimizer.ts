// src/services/autoScheduler/swapOptimizer.ts
// Swap optimizer, eligibility guards, and look-ahead starvation guard.

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import {
  FLOAT_EPSILON,
  MS_PER_DAY,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  computeGlobalObjective,
} from './helpers';

export const isAutoParticipant = (u: User): boolean =>
  Boolean(u.id && u.isActive && !u.isExtra && !u.excludeFromAuto);

/**
 * Hard availability on date:
 * - active non-extra non-excluded users only
 * - blocked days / status periods are respected via availability status
 * NOTE: same-weekday-last-week is intentionally NOT a hard block here;
 *       it is handled as a heavy soft penalty in the comparator so the
 *       scheduler can still assign someone who would otherwise starve.
 */
export const isHardEligible = (user: User, dateStr: string): boolean => {
  if (!user.isActive) return false;
  if (getUserAvailabilityStatus(user, dateStr) !== 'AVAILABLE') return false;
  return true;
};

// ─── Look-Ahead Starvation Guard ─────────────────────────────────────────────

/**
 * Check if assigning `candidate` to `dateStr` would leave any future unfilled
 * date with 0 hard-eligible auto-participants remaining.
 *
 * This prevents greedy "first come, first served" from consuming the last
 * available user for a future date. Lightweight: only counts hard eligibility
 * (status + blocked days), rest-day constraints are not checked here.
 *
 * Returns true when assigning `candidate` is safe (future dates still covered).
 */
export const isLookAheadSafe = (
  candidate: User,
  dateStr: string,
  futureDates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  selectedIds: number[],
  minRest: number
): boolean => {
  for (const futureDate of futureDates) {
    if (futureDate <= dateStr) continue;
    // Skip dates already filled.
    const existing = tempSchedule[futureDate];
    if (existing && toAssignedUserIds(existing.userId).length > 0) continue;

    // Count hard-eligible auto-participants for futureDate,
    // excluding the candidate AND users already selected for dateStr.
    // Also respects rest-day constraints from the current (pre-assignment) schedule.
    let count = 0;
    for (const u of users) {
      if (!u.id || !isAutoParticipant(u)) continue;
      if (u.id === candidate.id) continue;
      if (selectedIds.includes(u.id)) continue;
      if (!isHardEligible(u, futureDate)) continue;
      if (minRest > 0 && wouldViolateRestDays(u.id, futureDate, minRest, tempSchedule)) continue;
      count++;
      if (count >= 1) return true; // ≥1 is enough, no need to count all
    }
    // If we reach here, count === 0 → this futureDate would be starved.
    if (count === 0) return false;
  }
  return true;
};

// ─── Swap Optimizer ──────────────────────────────────────────────────────────

export const BASE_SWAP_ITERATIONS = 1500;

/**
 * Adaptive iteration cap: scales with pool size and date count for stability.
 * Small pools (3 users) → fewer iterations needed for convergence.
 * Large pools (33 users) → more iterations to explore swap space.
 */
export const getAdaptiveMaxIterations = (userCount: number, dateCount: number): number => {
  const base = Math.min(BASE_SWAP_ITERATIONS, Math.max(200, userCount * dateCount * 2));
  return Math.min(3000, base);
};

/**
 * Check if placing userId on dateStr would violate incompatible-pair constraints.
 * Looks at neighbors (day before / day after) and checks bidirectional incompatibility.
 */
export const wouldViolateIncompatiblePairs = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  allUsers: User[]
): boolean => {
  const user = allUsers.find((u) => u.id === userId);
  if (!user) return false;

  const target = new Date(dateStr);
  for (const offset of [-1, 1]) {
    const neighbor = new Date(target);
    neighbor.setDate(target.getDate() + offset);
    const nStr = toLocalISO(neighbor);
    const nEntry = schedule[nStr];
    if (!nEntry) continue;
    const nIds = toAssignedUserIds(nEntry.userId);
    for (const nId of nIds) {
      // Check bidirectional: user→neighbor and neighbor→user
      if (user.incompatibleWith?.includes(nId)) return true;
      const nUser = allUsers.find((u) => u.id === nId);
      if (nUser?.incompatibleWith?.includes(userId)) return true;
    }
  }
  return false;
};

/** True if assigning `userId` on `dateStr` would violate the rest-day constraint. */
export const wouldViolateRestDays = (
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
 * True if placing userId on dateStr would create a same-DOW assignment
 * on consecutive weeks (exactly 7 days apart, same day-of-week).
 * Checks both 7 days back and 7 days forward.
 */
export const wouldCreateSameDowRepeat = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const target = new Date(dateStr);
  for (const offset of [-7, 7]) {
    const neighbor = new Date(target);
    neighbor.setDate(target.getDate() + offset);
    const nStr = toLocalISO(neighbor);
    const nEntry = schedule[nStr];
    if (nEntry && toAssignedUserIds(nEntry.userId).includes(userId)) return true;
  }
  return false;
};

/**
 * Post-optimization via multi-phase swap refinement.
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
export const performSwapOptimization = (
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
  const maxIter = getAdaptiveMaxIterations(participants.length, autoFilledDates.length);

  for (let iter = 0; iter < maxIter; iter++) {
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

        // Hard constraint: incompatible pairs on neighboring days
        if (
          wouldViolateIncompatiblePairs(user1, date2, tempSchedule, users) ||
          wouldViolateIncompatiblePairs(user2, date1, tempSchedule, users)
        )
          continue;

        // Prevent introducing same-DOW-consecutive-week violations
        if (
          wouldCreateSameDowRepeat(user1, date2, tempSchedule) ||
          wouldCreateSameDowRepeat(user2, date1, tempSchedule)
        )
          continue;

        const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

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

        const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

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
            (minRest === 0 || !wouldViolateRestDays(u.id, dateStr, minRest, tempSchedule)) &&
            !wouldViolateIncompatiblePairs(u.id, dateStr, tempSchedule, users) &&
            !wouldCreateSameDowRepeat(u.id, dateStr, tempSchedule)
        );
        if (candidates.length === 0) continue;

        const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

        for (const candidate of candidates) {
          const newIds = [...assignedIds];
          newIds[slotIdx] = candidate.id!;

          const swappedEntry: ScheduleEntry = {
            ...entry,
            userId: newIds.length === 1 ? newIds[0] : newIds,
          };

          tempSchedule[dateStr] = swappedEntry;

          const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

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
          const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
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

            // Hard constraint: incompatible pairs
            if (
              wouldViolateIncompatiblePairs(uid, otherDate, tempSchedule, users) ||
              wouldViolateIncompatiblePairs(otherId, d2, tempSchedule, users)
            )
              continue;

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

            const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
            // For small groups, allow slightly worse objective if it resolves a same-DOW repeat
            const sameDowTolerance = participants.length <= MIN_USERS_FOR_WEEKLY_LIMIT ? 25.0 : 0;
            if (newObj < baseObj - FLOAT_EPSILON + sameDowTolerance) {
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
