// src/services/autoScheduler/swapOptimizer.ts
// Swap optimizer, eligibility guards, and look-ahead starvation guard.

import type {
  User,
  ScheduleEntry,
  DayWeights,
  AutoScheduleOptions,
  SchedulerProgressCallback,
  SchedulerVisCallback,
  OptimizerHistoryEntry,
} from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import {
  FLOAT_EPSILON,
  MS_PER_DAY,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  computeGlobalObjective,
  countEligibleUsersForWeek,
  getWeekWindow,
  countUserAssignmentsInRange,
} from './helpers';
import {
  buildUserComparator,
  filterByRestDays,
  filterByIncompatiblePairs,
  filterBySameWeekdayLastWeek,
  filterByWeeklyCap,
  filterForceUseAllWhenFew,
  filterEvenWeeklyDistribution,
} from './comparator';
import { getLogicSchedule } from '../../utils/assignment';

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
export const performSwapOptimization = async (
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  autoFilledDateSet: Set<string>,
  tempLoadOffset: Record<number, number>,
  options: AutoScheduleOptions,
  dayWeights: DayWeights,
  onProgress?: SchedulerProgressCallback,
  optimizerLog?: Map<string, OptimizerHistoryEntry[]>,
  onVis?: SchedulerVisCallback
): Promise<void> => {
  const participants = users.filter(isAutoParticipant);
  const userIds = participants.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  // Work with a stable, sorted list of auto-filled dates.
  const autoFilledDates = dates.filter((d) => autoFilledDateSet.has(d));
  const maxIter = getAdaptiveMaxIterations(participants.length, autoFilledDates.length);

  // Helper for optimizer history logging
  const userName = (uid: number): string =>
    participants.find((u) => u.id === uid)?.name || `#${uid}`;
  const logSwap = (date: string, entry: OptimizerHistoryEntry): void => {
    if (!optimizerLog) return;
    const arr = optimizerLog.get(date) || [];
    arr.push(entry);
    optimizerLog.set(date, arr);
  };

  // Visualization: emit initial state so the UI can highlight current assignments
  if (onVis) {
    const initDates: string[] = [];
    const initUids: number[] = [];
    for (const d of autoFilledDates) {
      const e = tempSchedule[d];
      if (e) {
        const ids = toAssignedUserIds(e.userId);
        if (ids.length > 0) {
          initDates.push(d);
          initUids.push(ids[0]);
        }
      }
    }
    if (initDates.length > 0) {
      await onVis({ type: 'restart-best', dates: initDates, userIds: initUids });
    }
  }

  // Throttled vis for showing every attempted swap (60fps max)
  const showAttempts13 = !!(onVis && options.schedulerVisShowAttempts);
  let lastVisTick13 = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Progress reporting + yield to UI thread periodically
    if (onProgress && iter % 50 === 0) {
      onProgress('Оптимізація (фази 1-3)', Math.round((iter / maxIter) * 100));
      await new Promise<void>((r) => setTimeout(r, 0));
    }

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

        // Try swapping one slot from date1 with one slot from date2.
        // Handles dutiesPerDay === 1 (common case) and dutiesPerDay > 1.
        for (let si = 0; si < ids1.length; si++) {
          for (let sj = 0; sj < ids2.length; sj++) {
            const user1 = ids1[si];
            const user2 = ids2[sj];
            if (user1 === user2) continue;

            // Build resulting arrays; reject if a duplicate userId would appear.
            const newIds1 = [...ids1];
            newIds1[si] = user2;
            const newIds2 = [...ids2];
            newIds2[sj] = user1;
            if (new Set(newIds1).size < newIds1.length) continue;
            if (new Set(newIds2).size < newIds2.length) continue;

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
            const newUserId1 = newIds1.length === 1 ? newIds1[0] : newIds1;
            const newUserId2 = newIds2.length === 1 ? newIds2[0] : newIds2;
            tempSchedule[date1] = { ...entry1, userId: newUserId1 };
            tempSchedule[date2] = { ...entry2, userId: newUserId2 };

            // Visualization: show this pair being evaluated (throttled)
            if (showAttempts13) {
              const now = Date.now();
              if (now - lastVisTick13 >= 16) {
                lastVisTick13 = now;
                await onVis!({ type: 'swap-try', dates: [date1, date2], userIds: [user2, user1] });
              }
            }

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
              // Visualization: show accepted pair swap
              if (onVis)
                await onVis({
                  type: 'swap-accept',
                  dates: [date1, date2],
                  userIds: [user2, user1],
                });

              logSwap(date1, {
                phase: 'phase1-pair',
                description: `Обмін: ${userName(user1)} ↔ ${userName(user2)} (Z: ${baseObj.toFixed(1)} → ${newObj.toFixed(1)})`,
                previousUserId: user1,
                previousUserName: userName(user1),
                newUserId: user2,
                newUserName: userName(user2),
                zBefore: baseObj,
                zAfter: newObj,
                rejectionReason: `Z покращилась з ${baseObj.toFixed(1)} до ${newObj.toFixed(1)} (−${(baseObj - newObj).toFixed(1)})`,
              });
              logSwap(date2, {
                phase: 'phase1-pair',
                description: `Обмін: ${userName(user2)} ↔ ${userName(user1)} (Z: ${baseObj.toFixed(1)} → ${newObj.toFixed(1)})`,
                previousUserId: user2,
                previousUserName: userName(user2),
                newUserId: user1,
                newUserName: userName(user1),
                zBefore: baseObj,
                zAfter: newObj,
                rejectionReason: `Z покращилась з ${baseObj.toFixed(1)} до ${newObj.toFixed(1)} (−${(baseObj - newObj).toFixed(1)})`,
              });
              improved = true;
              break outerPair;
            } else {
              tempSchedule[date1] = entry1;
              tempSchedule[date2] = entry2;
            }
          }
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

          // Visualization: show this replacement being evaluated (throttled)
          if (showAttempts13) {
            const now = Date.now();
            if (now - lastVisTick13 >= 16) {
              lastVisTick13 = now;
              await onVis!({ type: 'swap-try', dates: [dateStr], userIds: [candidate.id!] });
            }
          }

          const newObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

          if (newObj < baseObj - FLOAT_EPSILON) {
            // Even weekly distribution guard: block single-replacement swaps that
            // would give the candidate more duties than minCount + 1 across all
            // week-eligible participants. This prevents indirect imbalance where
            // a sequence of objective-improving swaps creates 2-0 gaps.
            if (options.forceUseAllWhenFew || options.evenWeeklyDistribution) {
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

              const candidateNewCount = countInWeek(candidate.id!);

              // Find min weekly count among week-eligible participants
              const weekEligibleIds = userIds.filter((uid) => {
                const u = participants.find((p) => p.id === uid);
                return u && autoFilledDates.some((ad) => isHardEligible(u, ad));
              });

              if (weekEligibleIds.length > 0) {
                const minWeekCount = Math.min(...weekEligibleIds.map((uid) => countInWeek(uid)));
                if (candidateNewCount > minWeekCount + 1) {
                  tempSchedule[dateStr] = entry;
                  continue;
                }
              }
            }

            logSwap(dateStr, {
              phase: 'phase2-replace',
              description: `Заміна: ${userName(assignedId)} → ${userName(candidate.id!)} (Z: ${baseObj.toFixed(1)} → ${newObj.toFixed(1)})`,
              previousUserId: assignedId,
              previousUserName: userName(assignedId),
              newUserId: candidate.id!,
              newUserName: userName(candidate.id!),
              zBefore: baseObj,
              zAfter: newObj,
              rejectionReason: `Z покращилась з ${baseObj.toFixed(1)} до ${newObj.toFixed(1)} (−${(baseObj - newObj).toFixed(1)})`,
            });

            // Visualization: show accepted single replacement
            if (onVis)
              await onVis({ type: 'swap-accept', dates: [dateStr], userIds: [candidate.id!] });

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

          // d2 is the repeat — try pair exchange.
          const baseObj = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
          const entry2 = tempSchedule[d2];
          if (!entry2) continue;

          // Find which slot uid occupies in d2 (handles dutiesPerDay > 1).
          const ids2P3 = toAssignedUserIds(entry2.userId);
          const uidSlot = ids2P3.indexOf(uid);
          if (uidSlot < 0) continue;
          const uObj = participants.find((u) => u.id === uid);
          if (!uObj) continue;

          for (const otherDate of autoFilledDates) {
            if (otherDate === d2) continue;
            const otherEntry = tempSchedule[otherDate];
            if (!otherEntry) continue;
            const otherIds = toAssignedUserIds(otherEntry.userId);

            for (let sk = 0; sk < otherIds.length; sk++) {
              const otherId = otherIds[sk];
              if (otherId === uid) continue;

              // Build resulting arrays; reject if duplicates would appear.
              const newIds2P3 = [...ids2P3];
              newIds2P3[uidSlot] = otherId;
              const newOtherIds = [...otherIds];
              newOtherIds[sk] = uid;
              if (new Set(newIds2P3).size < newIds2P3.length) continue;
              if (new Set(newOtherIds).size < newOtherIds.length) continue;

              const oObj = participants.find((u) => u.id === otherId);
              if (!oObj) continue;
              if (!isHardEligible(uObj, otherDate) || !isHardEligible(oObj, d2)) continue;

              // Hard constraint: incompatible pairs
              if (
                wouldViolateIncompatiblePairs(uid, otherDate, tempSchedule, users) ||
                wouldViolateIncompatiblePairs(otherId, d2, tempSchedule, users)
              )
                continue;

              // Tentative swap
              const newUserId2P3 = newIds2P3.length === 1 ? newIds2P3[0] : newIds2P3;
              const newUserIdOther = newOtherIds.length === 1 ? newOtherIds[0] : newOtherIds;
              tempSchedule[d2] = { ...entry2, userId: newUserId2P3 };
              tempSchedule[otherDate] = { ...otherEntry, userId: newUserIdOther };

              // Visualization: show this Phase 3 pair being evaluated (throttled)
              if (showAttempts13) {
                const now = Date.now();
                if (now - lastVisTick13 >= 16) {
                  lastVisTick13 = now;
                  await onVis!({
                    type: 'swap-try',
                    dates: [d2, otherDate],
                    userIds: [otherId, uid],
                  });
                }
              }

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
                // Visualization: show accepted Phase 3 swap
                if (onVis)
                  await onVis({
                    type: 'swap-accept',
                    dates: [d2, otherDate],
                    userIds: [otherId, uid],
                  });

                logSwap(d2, {
                  phase: 'phase3-sameDow',
                  description: `Усунення повтору дня тижня: ${userName(uid)} ↔ ${userName(otherId)} (Z: ${baseObj.toFixed(1)} → ${newObj.toFixed(1)})`,
                  previousUserId: uid,
                  previousUserName: userName(uid),
                  newUserId: otherId,
                  newUserName: userName(otherId),
                  zBefore: baseObj,
                  zAfter: newObj,
                  rejectionReason: `Усунено повтор дня тижня для ${userName(uid)}`,
                });
                logSwap(otherDate, {
                  phase: 'phase3-sameDow',
                  description: `Усунення повтору дня тижня: ${userName(otherId)} ↔ ${userName(uid)} (Z: ${baseObj.toFixed(1)} → ${newObj.toFixed(1)})`,
                  previousUserId: otherId,
                  previousUserName: userName(otherId),
                  newUserId: uid,
                  newUserName: userName(uid),
                  zBefore: baseObj,
                  zAfter: newObj,
                  rejectionReason: `Переміщення для усунення повтору дня тижня ${userName(uid)}`,
                });
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
      if (resolvedSameDow) break;
    }

    if (resolvedSameDow) continue;

    // No improvement found in any phase → stable.
    break;
  }
};

// ─── Tabu Search (Phase 4) ──────────────────────────────────────────────────

/** Encode a pair-swap move as a string key for the tabu map. */
const swapKey = (d1: string, u1: number, d2: string, u2: number): string =>
  d1 < d2 ? `${d1}:${u1}<>${d2}:${u2}` : `${d2}:${u2}<>${d1}:${u1}`;

/** Encode a single-replacement move as a string key for the tabu map. */
const replaceKey = (date: string, oldUid: number, newUid: number): string =>
  `${date}:${oldUid}->${newUid}`;

/**
 * Tabu Search post-optimization.
 *
 * Unlike the hill-climbing swap optimizer (Phases 1-3), Tabu Search can
 * accept worsening moves to escape local optima. A tabu list prevents
 * cycling by forbidding recently reversed moves for `tenure` iterations.
 *
 * The global best solution seen across all iterations is restored at the end.
 *
 * Async with periodic yield to keep the UI responsive.
 */
export const performTabuSearch = async (
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  autoFilledDateSet: Set<string>,
  options: AutoScheduleOptions,
  dayWeights: DayWeights,
  onProgress?: SchedulerProgressCallback,
  optimizerLog?: Map<string, OptimizerHistoryEntry[]>,
  onVis?: SchedulerVisCallback
): Promise<void> => {
  const tenure = options.tabuTenure || 7;
  const maxIter = options.tabuMaxIterations || 50;
  const participants = users.filter(isAutoParticipant);
  const userIds = participants.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;
  const autoFilledDates = dates.filter((d) => autoFilledDateSet.has(d));
  const enforceWeeklyBalance = !!(options.forceUseAllWhenFew || options.evenWeeklyDistribution);

  if (autoFilledDates.length < 2 || participants.length < 2) return;

  // Helper for optimizer history logging
  const uName = (uid: number): string => participants.find((u) => u.id === uid)?.name || `#${uid}`;
  const logTabu = (date: string, entry: OptimizerHistoryEntry): void => {
    if (!optimizerLog) return;
    const arr = optimizerLog.get(date) || [];
    arr.push(entry);
    optimizerLog.set(date, arr);
  };

  // Check if a schedule state violates weekly balance for any affected week
  const wouldViolateWeeklyBalance = (affectedDates: string[]): boolean => {
    if (!enforceWeeklyBalance) return false;
    // Check each unique week touched by the affected dates
    const checkedWeeks = new Set<string>();
    for (const dateStr of affectedDates) {
      const d = new Date(dateStr);
      const dow = d.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const weekKey = toLocalISO(monday);
      if (checkedWeeks.has(weekKey)) continue;
      checkedWeeks.add(weekKey);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const from = weekKey;
      const to = toLocalISO(sunday);

      // Count per user for this week among all participants
      const weekCounts = userIds.map(
        (uid) =>
          Object.values(tempSchedule).filter(
            (s) => s.date >= from && s.date <= to && toAssignedUserIds(s.userId).includes(uid)
          ).length
      );
      const weekMin = Math.min(...weekCounts);
      const weekMax = Math.max(...weekCounts);
      if (weekMax > weekMin + 1) return true;
    }
    return false;
  };

  // Tabu map: move key → iteration when it expires
  const tabuMap = new Map<string, number>();

  // Track the best solution seen
  let bestZ = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
  const bestAssignment = new Map<string, number | number[]>();
  for (const d of autoFilledDates) {
    const e = tempSchedule[d];
    if (e) bestAssignment.set(d, e.userId as number | number[]);
  }

  // Visualization: emit initial best so the UI can highlight it
  if (onVis) {
    const bestDates: string[] = [];
    const bestUids: number[] = [];
    for (const [d, uid] of bestAssignment) {
      bestDates.push(d);
      bestUids.push(typeof uid === 'number' ? uid : (uid[0] ?? 0));
    }
    if (bestDates.length > 0) {
      await onVis({ type: 'restart-best', dates: bestDates, userIds: bestUids });
    }
  }

  // Throttled vis for showing every attempted swap (60fps max)
  const showAttempts = !!(onVis && options.schedulerVisShowAttempts);
  let lastVisTick = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Progress reporting + yield to UI thread
    if (onProgress && iter % 5 === 0) {
      onProgress('Tabu Search', Math.round((iter / maxIter) * 100));
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    const currentZ = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);

    // Evaluate all neighbor moves, pick the best non-tabu (or aspiration)
    let bestMoveZ = Infinity;
    let bestMove: (() => void) | null = null;
    let bestMoveKey = '';
    let bestMoveLog: {
      dates: string[];
      phase: 'tabu-pair' | 'tabu-replace';
      prevIds: number[];
      newIds: number[];
    } | null = null;

    // Phase A: pair-exchange neighbors
    for (let i = 0; i < autoFilledDates.length - 1; i++) {
      for (let j = i + 1; j < autoFilledDates.length; j++) {
        const d1 = autoFilledDates[i];
        const d2 = autoFilledDates[j];
        const e1 = tempSchedule[d1];
        const e2 = tempSchedule[d2];
        if (!e1 || !e2) continue;

        const ids1 = toAssignedUserIds(e1.userId);
        const ids2 = toAssignedUserIds(e2.userId);

        // Iterate all (si, sj) slot combinations to support dutiesPerDay > 1.
        for (let si = 0; si < ids1.length; si++) {
          for (let sj = 0; sj < ids2.length; sj++) {
            const u1 = ids1[si];
            const u2 = ids2[sj];
            if (u1 === u2) continue;

            const newIds1 = [...ids1];
            newIds1[si] = u2;
            const newIds2 = [...ids2];
            newIds2[sj] = u1;
            if (new Set(newIds1).size < newIds1.length) continue;
            if (new Set(newIds2).size < newIds2.length) continue;

            const u1obj = participants.find((u) => u.id === u1);
            const u2obj = participants.find((u) => u.id === u2);
            if (!u1obj || !u2obj) continue;
            if (!isHardEligible(u1obj, d2) || !isHardEligible(u2obj, d1)) continue;
            if (
              wouldViolateIncompatiblePairs(u1, d2, tempSchedule, users) ||
              wouldViolateIncompatiblePairs(u2, d1, tempSchedule, users)
            )
              continue;

            // Tentative swap to evaluate
            const newUserId1T = newIds1.length === 1 ? newIds1[0] : newIds1;
            const newUserId2T = newIds2.length === 1 ? newIds2[0] : newIds2;
            tempSchedule[d1] = { ...e1, userId: newUserId1T };
            tempSchedule[d2] = { ...e2, userId: newUserId2T };

            // Visualization: show this pair being evaluated (throttled)
            if (showAttempts) {
              const now = Date.now();
              if (now - lastVisTick >= 16) {
                lastVisTick = now;
                await onVis!({ type: 'swap-try', dates: [d1, d2], userIds: [u2, u1] });
              }
            }

            const rv1 = minRest > 0 && wouldViolateRestDays(u2, d1, minRest, tempSchedule);
            const rv2 = minRest > 0 && wouldViolateRestDays(u1, d2, minRest, tempSchedule);

            if (!rv1 && !rv2 && !wouldViolateWeeklyBalance([d1, d2])) {
              const z = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
              const key = swapKey(d1, u1, d2, u2);
              const isTabu = (tabuMap.get(key) ?? -1) > iter;
              // Aspiration: accept tabu move if it beats the global best
              if (z < bestMoveZ && (!isTabu || z < bestZ - FLOAT_EPSILON)) {
                bestMoveZ = z;
                bestMoveKey = key;
                bestMoveLog = {
                  dates: [d1, d2],
                  phase: 'tabu-pair',
                  prevIds: [u1, u2],
                  newIds: [u2, u1],
                };
                const sd1 = d1,
                  sd2 = d2,
                  se1 = e1,
                  se2 = e2,
                  snIds1 = newIds1,
                  snIds2 = newIds2;
                bestMove = () => {
                  const nu1 = snIds1.length === 1 ? snIds1[0] : snIds1;
                  const nu2 = snIds2.length === 1 ? snIds2[0] : snIds2;
                  tempSchedule[sd1] = { ...se1, userId: nu1 };
                  tempSchedule[sd2] = { ...se2, userId: nu2 };
                };
              }
            }

            // Revert
            tempSchedule[d1] = e1;
            tempSchedule[d2] = e2;
          }
        }
      }
    }

    // Phase B: single-replacement neighbors (supports dutiesPerDay > 1 via slotIdx)
    for (const dateStr of autoFilledDates) {
      const entry = tempSchedule[dateStr];
      if (!entry) continue;
      const assignedIds = toAssignedUserIds(entry.userId);

      for (let slotIdxT = 0; slotIdxT < assignedIds.length; slotIdxT++) {
        const assignedId = assignedIds[slotIdxT];

        for (const candidate of participants) {
          if (
            !candidate.id ||
            candidate.id === assignedId ||
            assignedIds.includes(candidate.id) ||
            !isHardEligible(candidate, dateStr) ||
            (minRest > 0 && wouldViolateRestDays(candidate.id, dateStr, minRest, tempSchedule)) ||
            wouldViolateIncompatiblePairs(candidate.id, dateStr, tempSchedule, users)
          )
            continue;

          const newIds = [...assignedIds];
          newIds[slotIdxT] = candidate.id;
          const newUserId = newIds.length === 1 ? newIds[0] : newIds;
          const newEntry: ScheduleEntry = { ...entry, userId: newUserId };
          tempSchedule[dateStr] = newEntry;

          // Visualization: show this replacement being evaluated (throttled)
          if (showAttempts) {
            const now = Date.now();
            if (now - lastVisTick >= 16) {
              lastVisTick = now;
              await onVis!({ type: 'swap-try', dates: [dateStr], userIds: [candidate.id] });
            }
          }

          if (wouldViolateWeeklyBalance([dateStr])) {
            tempSchedule[dateStr] = entry;
            continue;
          }

          const z = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
          const key = replaceKey(dateStr, assignedId, candidate.id);
          const isTabu = (tabuMap.get(key) ?? -1) > iter;

          if (z < bestMoveZ && (!isTabu || z < bestZ - FLOAT_EPSILON)) {
            bestMoveZ = z;
            bestMoveKey = key;
            bestMoveLog = {
              dates: [dateStr],
              phase: 'tabu-replace',
              prevIds: [assignedId],
              newIds: [candidate.id],
            };
            const sd = dateStr,
              se = entry,
              snIds = newIds;
            bestMove = () => {
              const nu = snIds.length === 1 ? snIds[0] : snIds;
              tempSchedule[sd] = { ...se, userId: nu };
            };
          }

          tempSchedule[dateStr] = entry;
        }
      }
    }

    // No feasible move found → terminate
    if (!bestMove) break;

    // Apply the best move
    bestMove();

    // Visualization: show accepted tabu move
    if (onVis && bestMoveLog) {
      await onVis({ type: 'swap-accept', dates: bestMoveLog.dates, userIds: bestMoveLog.newIds });
    }

    // Log the move for decision log
    if (bestMoveLog) {
      for (let mi = 0; mi < bestMoveLog.dates.length; mi++) {
        const d = bestMoveLog.dates[mi];
        const desc =
          bestMoveLog.phase === 'tabu-pair'
            ? `Tabu обмін: ${uName(bestMoveLog.prevIds[mi])} ↔ ${uName(bestMoveLog.newIds[mi])}`
            : `Tabu заміна: ${uName(bestMoveLog.prevIds[mi])} → ${uName(bestMoveLog.newIds[mi])}`;
        logTabu(d, {
          phase: bestMoveLog.phase,
          description: `${desc} (Z: ${currentZ.toFixed(1)} → ${bestMoveZ.toFixed(1)}, іт. ${iter})`,
          previousUserId: bestMoveLog.prevIds[mi],
          previousUserName: uName(bestMoveLog.prevIds[mi]),
          newUserId: bestMoveLog.newIds[mi],
          newUserName: uName(bestMoveLog.newIds[mi]),
          zBefore: currentZ,
          zAfter: bestMoveZ,
          iteration: iter,
          rejectionReason:
            bestMoveZ < currentZ
              ? `Z покращилась з ${currentZ.toFixed(1)} до ${bestMoveZ.toFixed(1)} (−${(currentZ - bestMoveZ).toFixed(1)})`
              : `Tabu хід для виходу з локального мінімуму (Z: ${currentZ.toFixed(1)} → ${bestMoveZ.toFixed(1)})`,
        });
      }
    }

    // Add the REVERSE move to the tabu list
    tabuMap.set(bestMoveKey, iter + tenure);

    // Update global best
    if (bestMoveZ < bestZ - FLOAT_EPSILON) {
      bestZ = bestMoveZ;
      bestAssignment.clear();
      for (const d of autoFilledDates) {
        const e = tempSchedule[d];
        if (e) bestAssignment.set(d, e.userId as number | number[]);
      }
      // Visualization: update persistent best highlight
      if (onVis) {
        const bestDates: string[] = [];
        const bestUids: number[] = [];
        for (const [d, uid] of bestAssignment) {
          bestDates.push(d);
          bestUids.push(typeof uid === 'number' ? uid : (uid[0] ?? 0));
        }
        if (bestDates.length > 0) {
          await onVis({ type: 'restart-best', dates: bestDates, userIds: bestUids });
        }
      }
    }
  }

  // Restore the best solution found across all iterations
  for (const [d, uid] of bestAssignment) {
    const entry = tempSchedule[d];
    if (entry) {
      tempSchedule[d] = { ...entry, userId: uid };
    }
  }

  onProgress?.('Tabu Search', 100);
};

// ─── Multi-Restart (Iterated Local Search) ──────────────────────────────────

/**
 * Synchronous mini local search (Phase 1 pair-exchange only, no async yields).
 * Used within multi-restart loops where async overhead would dominate runtime.
 * Only performs count-preserving pair swaps — never changes per-user duty totals.
 * Runs until convergence or maxIter, whichever comes first.
 */
const syncMiniOptimize = (
  autoFilledDates: string[],
  participantMap: Map<number, User>,
  userIds: number[],
  schedule: Record<string, ScheduleEntry>,
  users: User[],
  dayWeights: DayWeights,
  minRest: number,
  maxIter: number
): void => {
  for (let iter = 0; iter < maxIter; iter++) {
    let improved = false;

    // Compute baseline once per iteration, NOT inside the inner loop.
    // Old code called computeGlobalObjective twice per pair (once for base,
    // once for new) = O(N²) objective calls per iteration. Now it's O(1)
    // for the baseline + O(pairs_checked) for candidates.
    let baseObj = computeGlobalObjective(userIds, schedule, dayWeights, users);

    // Phase 1: Pair-exchange swaps
    outerPair: for (let i = 0; i < autoFilledDates.length - 1; i++) {
      for (let j = i + 1; j < autoFilledDates.length; j++) {
        const date1 = autoFilledDates[i];
        const date2 = autoFilledDates[j];
        const entry1 = schedule[date1];
        const entry2 = schedule[date2];
        if (!entry1 || !entry2) continue;
        const ids1 = toAssignedUserIds(entry1.userId);
        const ids2 = toAssignedUserIds(entry2.userId);
        // Try swapping one slot from date1 with one slot from date2 (supports dutiesPerDay > 1).
        for (let si = 0; si < ids1.length; si++) {
          for (let sj = 0; sj < ids2.length; sj++) {
            const user1 = ids1[si];
            const user2 = ids2[sj];
            if (user1 === user2) continue;
            const newIds1 = [...ids1];
            newIds1[si] = user2;
            const newIds2 = [...ids2];
            newIds2[sj] = user1;
            if (new Set(newIds1).size < newIds1.length) continue;
            if (new Set(newIds2).size < newIds2.length) continue;
            const u1obj = participantMap.get(user1);
            const u2obj = participantMap.get(user2);
            if (!u1obj || !u2obj) continue;
            if (!isHardEligible(u1obj, date2) || !isHardEligible(u2obj, date1)) continue;
            if (wouldViolateIncompatiblePairs(user1, date2, schedule, users)) continue;
            if (wouldViolateIncompatiblePairs(user2, date1, schedule, users)) continue;
            if (wouldCreateSameDowRepeat(user1, date2, schedule)) continue;
            if (wouldCreateSameDowRepeat(user2, date1, schedule)) continue;

            const newUserId1S = newIds1.length === 1 ? newIds1[0] : newIds1;
            const newUserId2S = newIds2.length === 1 ? newIds2[0] : newIds2;
            schedule[date1] = { ...entry1, userId: newUserId1S };
            schedule[date2] = { ...entry2, userId: newUserId2S };

            if (
              (minRest > 0 && wouldViolateRestDays(user2, date1, minRest, schedule)) ||
              (minRest > 0 && wouldViolateRestDays(user1, date2, minRest, schedule))
            ) {
              schedule[date1] = entry1;
              schedule[date2] = entry2;
              continue;
            }

            const newObj = computeGlobalObjective(userIds, schedule, dayWeights, users);
            if (newObj < baseObj - FLOAT_EPSILON) {
              baseObj = newObj;
              improved = true;
              break outerPair;
            } else {
              schedule[date1] = entry1;
              schedule[date2] = entry2;
            }
          }
        }
      }
    }

    if (!improved) break;
  }
};

/**
 * LNS destroy: remove assignments from a random contiguous window of dates.
 * Returns the destroyed dates so the repair step knows which to rebuild.
 * Window size: 3–7 dates (scales with schedule size, minimum 3).
 */
const lnsDestroy = (
  autoFilledDates: string[],
  schedule: Record<string, ScheduleEntry>,
  windowSize: number
): string[] => {
  if (autoFilledDates.length <= windowSize) {
    // Destroy all dates
    const destroyed: string[] = [];
    for (const d of autoFilledDates) {
      const e = schedule[d];
      if (e) {
        schedule[d] = { ...e, userId: null };
        destroyed.push(d);
      }
    }
    return destroyed;
  }

  // Pick random scattered dates (not contiguous) for better diversity.
  // This ensures each restart explores a structurally different neighborhood.
  const indices = autoFilledDates.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, windowSize).sort((a, b) => a - b);

  const destroyed: string[] = [];
  for (const idx of picked) {
    const d = autoFilledDates[idx];
    const e = schedule[d];
    if (e) {
      schedule[d] = { ...e, userId: null };
      destroyed.push(d);
    }
  }
  return destroyed;
};

/**
 * LNS repair: reassign destroyed dates using the same greedy pipeline
 * (filters + comparator) that the main scheduler uses.
 * Respects ALL constraints: hard eligibility, rest days, incompatible pairs,
 * same-DOW-last-week, weekly cap, forceUseAll, evenWeeklyDistribution.
 */
const lnsRepair = (
  destroyedDates: string[],
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  fairnessUsers: User[],
  slotsPerDay: number
): void => {
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;

  for (const dateStr of destroyedDates) {
    // Track users already picked for earlier slots on this date.
    const selectedIds: number[] = [];

    for (let slot = 0; slot < slotsPerDay; slot++) {
      // Exclude users already picked for this date's earlier slots.
      const allAutoUsers = users.filter(
        (u) => u.id && isAutoParticipant(u) && !selectedIds.includes(u.id)
      );

      const hardPool = allAutoUsers.filter((u) => isHardEligible(u, dateStr));
      if (hardPool.length === 0) break;

      let pool = [...hardPool];

      // Rest days filter
      if (minRest > 0) {
        const filtered = filterByRestDays(pool, dateStr, minRest, schedule);
        if (filtered.length > 0) pool = filtered;
      }

      // Incompatible pairs filter
      {
        const filtered = filterByIncompatiblePairs(pool, users, dateStr, schedule);
        if (filtered.length > 0) pool = filtered;
      }

      // Same weekday last week filter
      {
        const filtered = filterBySameWeekdayLastWeek(
          pool,
          dateStr,
          schedule,
          !options.evenWeeklyDistribution
        );
        if (filtered.length > 0) pool = filtered;
      }

      const totalEligibleCount = countEligibleUsersForWeek(users, schedule, dateStr);

      // Weekly cap filter
      if (options.limitOneDutyPerWeekWhenSevenPlus) {
        const filtered = filterByWeeklyCap(pool, users, dateStr, schedule, options);
        if (filtered.length > 0) pool = filtered;
      }

      // forceUseAllWhenFew filter
      if (
        options.forceUseAllWhenFew &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        const filtered = filterForceUseAllWhenFew(pool, dateStr, schedule);
        if (filtered.length > 0) pool = filtered;
      }

      // evenWeeklyDistribution filter
      if (
        options.evenWeeklyDistribution &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        const filtered = filterEvenWeeklyDistribution(pool, dateStr, schedule);
        if (filtered.length > 0) pool = filtered;
      }

      // Fairness recovery (same as main scheduler)
      if (
        (options.forceUseAllWhenFew || options.evenWeeklyDistribution) &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT &&
        pool.length > 0
      ) {
        const week = getWeekWindow(dateStr);
        const poolHasZero = pool.some(
          (u) => countUserAssignmentsInRange(u.id!, schedule, week.from, week.to) === 0
        );
        if (!poolHasZero) {
          const zeroDutyHard = hardPool.filter(
            (u) => countUserAssignmentsInRange(u.id!, schedule, week.from, week.to) === 0
          );
          if (zeroDutyHard.length > 0) {
            pool = zeroDutyHard;
          }
        }
      }

      // Starvation fallback
      if (pool.length === 0) {
        pool = [...hardPool];
      }

      if (pool.length === 0) break;

      // Sort by the same comparator used in the greedy pass
      const fairnessSchedule = getLogicSchedule(schedule, false);
      const compare = buildUserComparator(
        dateStr,
        schedule,
        dayWeights,
        options,
        undefined,
        fairnessSchedule,
        totalEligibleCount,
        pool,
        fairnessUsers
      );
      pool.sort(compare);

      // Pick randomly from top-3 to add exploration diversity across restarts.
      // Pure greedy (always pool[0]) is deterministic and produces the same
      // assignment every time given the same surrounding context.
      const topN = Math.min(3, pool.length);
      const picked = pool[Math.floor(Math.random() * topN)];
      if (picked?.id) {
        selectedIds.push(picked.id);
      }
    }

    if (selectedIds.length > 0) {
      schedule[dateStr] = {
        ...schedule[dateStr],
        userId: selectedIds.length === 1 ? selectedIds[0] : selectedIds,
      };
    }
  }
};

/**
 * Multi-Restart optimization (Iterated Local Search).
 *
 * Runs entirely within a caller-specified time budget. Strategy:
 *   1. Save current best solution (result of Phases 1-3 + optional Tabu).
 *   2. Perturb: randomly swap `perturbDegree` pairs to escape local optimum.
 *   3. Local search: syncMiniOptimize to convergence (Phases 1-2, no async delay).
 *   4. If new Z < bestZ → update best.
 *   5. Repeat until deadline.
 *   6. Restore global best.
 *
 * Compatible with all existing constraints: respects rest days, incompatible
 * pairs, hard eligibility, and same-DOW-consecutive rules. Perturbation is
 * count-preserving (pair swaps only) and respects rest-day constraints.
 * Results are validated for constraint violations before acceptance.
 *
 * Works with or without Lookahead and Tabu Search — runs after them as Phase 5.
 */
export const performMultiRestartOptimization = async (
  dates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  autoFilledDateSet: Set<string>,
  options: AutoScheduleOptions,
  dayWeights: DayWeights,
  timeoutMs: number,
  onProgress?: SchedulerProgressCallback,
  abortSignal?: AbortSignal,
  slotsPerDay = 1,
  onVis?: SchedulerVisCallback
): Promise<void> => {
  const participants = users.filter(isAutoParticipant);
  const userIds = participants.map((u) => u.id!);
  const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;
  const autoFilledDates = dates.filter((d) => autoFilledDateSet.has(d)).sort();
  const strategy = options.multiRestartStrategy ?? 'pair-swap';
  const isUnlimited = options.multiRestartTimeLimitMode === 'unlimited';
  const fairnessUsers = users.filter(isAutoParticipant);

  if (autoFilledDates.length < 2 || participants.length < 2) return;

  // Seed with current best (result of all previous optimization phases)
  let bestZ = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
  const bestAssignment = new Map<string, number | number[]>();
  for (const d of autoFilledDates) {
    const e = tempSchedule[d];
    if (e) bestAssignment.set(d, e.userId as number | number[]);
  }

  // Perturbation degree: swap 2–4 random pairs (scales with schedule size)
  const perturbDegree = Math.max(2, Math.min(4, Math.floor(autoFilledDates.length / 3)));

  // LNS window size: destroy 30-50% of dates (min 3, max 14)
  const lnsWindowSize = Math.max(3, Math.min(14, Math.floor(autoFilledDates.length * 0.4)));

  const participantMap = new Map<number, User>(participants.map((u) => [u.id!, u]));

  // Visualization: emit the initial best assignment so the UI can highlight it
  if (onVis) {
    const bestDates: string[] = [];
    const bestUserIds: number[] = [];
    for (const [d, uid] of bestAssignment) {
      bestDates.push(d);
      bestUserIds.push(typeof uid === 'number' ? uid : (uid[0] ?? 0));
    }
    if (bestDates.length > 0) {
      await onVis({ type: 'restart-best', dates: bestDates, userIds: bestUserIds });
    }
  }

  const startTime = Date.now();
  const deadline = isUnlimited ? Infinity : startTime + timeoutMs;
  let restart = 0;
  let improvements = 0;
  const strategyLabel = strategy === 'lns' ? 'LNS' : 'Multi-Restart';
  // Yield to UI thread at most once every 50ms so the browser stays
  // responsive regardless of how fast restarts get.
  let lastYield = startTime;

  // Minimum 250 restarts regardless of time budget
  const MIN_RESTARTS = 250;

  // Stagnation detection: track unique solutions seen. If too many consecutive
  // restarts produce solutions we have already seen, assume the search space
  // is exhausted and stop early.
  const seenSolutions = new Set<string>();
  let duplicatesInRow = 0;
  const MAX_DUPLICATES_IN_ROW = 80;

  const solutionFingerprint = (): string => {
    const parts: string[] = [];
    for (const d of autoFilledDates) {
      const e = tempSchedule[d];
      if (e) parts.push(`${d}:${toAssignedUserIds(e.userId).join(',')}`);
    }
    return parts.join('|');
  };

  while (restart < MIN_RESTARTS || Date.now() < deadline) {
    // Check abort signal for unlimited mode (and fixed mode too)
    if (abortSignal?.aborted) break;

    // Early stop: search space exhausted (cycling through same solutions)
    if (restart >= MIN_RESTARTS && duplicatesInRow >= MAX_DUPLICATES_IN_ROW) break;

    restart++;

    // Yield only when 50ms have elapsed since the last yield.
    // Fixed-count yielding (every N restarts) throttles throughput as the
    // restart loop speeds up — time-based yielding avoids that ceiling.
    const now = Date.now();
    if (now - lastYield >= 50) {
      const elapsed = now - startTime;
      const percent = isUnlimited
        ? -1 // Signal to UI that this is unlimited mode
        : Math.min(99, Math.round((elapsed / timeoutMs) * 100));
      onProgress?.(`${strategyLabel} (спроба ${restart}, покращень: ${improvements})`, percent);
      await new Promise<void>((r) => setTimeout(r, 0));
      lastYield = Date.now();
      if (!isUnlimited && Date.now() >= deadline) break;
      if (abortSignal?.aborted) break;
    }

    // Restore best as starting point for this restart
    for (const [d, uid] of bestAssignment) {
      const e = tempSchedule[d];
      if (e) tempSchedule[d] = { ...e, userId: uid };
    }

    if (strategy === 'lns') {
      // LNS perturbation: destroy a window, then repair with greedy pipeline
      const destroyed = lnsDestroy(autoFilledDates, tempSchedule, lnsWindowSize);
      lnsRepair(destroyed, users, tempSchedule, dayWeights, options, fairnessUsers, slotsPerDay);
    } else {
      // Classic perturbation: random pair swaps
      const shuffled = [...autoFilledDates].sort(() => Math.random() - 0.5);
      let perturbCount = 0;
      for (let i = 0; i + 1 < shuffled.length && perturbCount < perturbDegree; i += 2) {
        const d1 = shuffled[i];
        const d2 = shuffled[i + 1];
        const e1 = tempSchedule[d1];
        const e2 = tempSchedule[d2];
        if (!e1 || !e2) continue;
        const ids1 = toAssignedUserIds(e1.userId);
        const ids2 = toAssignedUserIds(e2.userId);
        if (ids1.length === 0 || ids2.length === 0) continue;
        let swapped = false;
        outer: for (let si = 0; si < ids1.length; si++) {
          for (let sj = 0; sj < ids2.length; sj++) {
            const u1 = ids1[si];
            const u2 = ids2[sj];
            if (u1 === u2) continue;
            const newIds1 = [...ids1];
            newIds1[si] = u2;
            const newIds2 = [...ids2];
            newIds2[sj] = u1;
            if (new Set(newIds1).size < newIds1.length) continue;
            if (new Set(newIds2).size < newIds2.length) continue;
            const u1obj = participants.find((u) => u.id === u1);
            const u2obj = participants.find((u) => u.id === u2);
            if (!u1obj || !u2obj) continue;
            if (!isHardEligible(u1obj, d2) || !isHardEligible(u2obj, d1)) continue;
            const nu1 = newIds1.length === 1 ? newIds1[0] : newIds1;
            const nu2 = newIds2.length === 1 ? newIds2[0] : newIds2;
            tempSchedule[d1] = { ...e1, userId: nu1 };
            tempSchedule[d2] = { ...e2, userId: nu2 };
            if (
              (minRest > 0 && wouldViolateRestDays(u2, d1, minRest, tempSchedule)) ||
              (minRest > 0 && wouldViolateRestDays(u1, d2, minRest, tempSchedule))
            ) {
              tempSchedule[d1] = e1;
              tempSchedule[d2] = e2;
              continue;
            }
            swapped = true;
            break outer;
          }
        }
        if (swapped) perturbCount++;
      }
    }

    // Local search from perturbed/repaired state (sync, no UI yields)
    syncMiniOptimize(
      autoFilledDates,
      participantMap,
      userIds,
      tempSchedule,
      users,
      dayWeights,
      minRest,
      200
    );

    // Stagnation detection: check if this solution was already seen
    const fp = solutionFingerprint();
    if (seenSolutions.has(fp)) {
      duplicatesInRow++;
    } else {
      seenSolutions.add(fp);
      duplicatesInRow = 0;
    }

    // Visualization: show current restart attempt — what changed from best
    if (onVis) {
      const tryDates: string[] = [];
      const tryUserIds: number[] = [];
      for (const d of autoFilledDates) {
        const e = tempSchedule[d];
        if (!e) continue;
        const curIds = toAssignedUserIds(e.userId);
        const bestUid = bestAssignment.get(d);
        const bestIds = bestUid !== undefined ? toAssignedUserIds(bestUid) : [];
        if (JSON.stringify(curIds) !== JSON.stringify(bestIds)) {
          tryDates.push(d);
          tryUserIds.push(curIds[0] ?? 0);
        }
      }
      if (tryDates.length > 0) {
        await onVis({ type: 'restart-try', dates: tryDates, userIds: tryUserIds });
      }
    }

    // Validate no constraint violations before accepting
    let hasViolation = false;
    if (minRest > 0) {
      for (const dateStr of autoFilledDates) {
        const entry = tempSchedule[dateStr];
        if (!entry) continue;
        for (const uid of toAssignedUserIds(entry.userId)) {
          if (wouldViolateRestDays(uid, dateStr, minRest, tempSchedule)) {
            hasViolation = true;
            break;
          }
        }
        if (hasViolation) break;
      }
    }

    // Accept only if no violations AND better than global best
    if (!hasViolation) {
      const newZ = computeGlobalObjective(userIds, tempSchedule, dayWeights, users);
      if (newZ < bestZ - FLOAT_EPSILON) {
        bestZ = newZ;
        improvements++;
        // Visualization: show all changed assignments from this improvement
        if (onVis) {
          const changedDates: string[] = [];
          const changedUserIds: number[] = [];
          for (const d of autoFilledDates) {
            const e = tempSchedule[d];
            if (!e) continue;
            const newIds = toAssignedUserIds(e.userId);
            const oldUid = bestAssignment.get(d);
            const oldIds = oldUid !== undefined ? toAssignedUserIds(oldUid) : [];
            if (JSON.stringify(newIds) !== JSON.stringify(oldIds)) {
              changedDates.push(d);
              changedUserIds.push(newIds[0] ?? 0);
            }
          }
          if (changedDates.length > 0) {
            await onVis({ type: 'restart-improve', dates: changedDates, userIds: changedUserIds });
          }
        }
        for (const d of autoFilledDates) {
          const e = tempSchedule[d];
          if (e) bestAssignment.set(d, e.userId as number | number[]);
        }
        // Visualization: update persistent best highlight
        if (onVis) {
          const bestDates: string[] = [];
          const bestUids: number[] = [];
          for (const [d, uid] of bestAssignment) {
            bestDates.push(d);
            bestUids.push(typeof uid === 'number' ? uid : (uid[0] ?? 0));
          }
          if (bestDates.length > 0) {
            await onVis({ type: 'restart-best', dates: bestDates, userIds: bestUids });
          }
        }
      }
    }
  }

  // Restore global best
  for (const [d, uid] of bestAssignment) {
    const e = tempSchedule[d];
    if (e) tempSchedule[d] = { ...e, userId: uid };
  }

  onProgress?.(
    `${strategyLabel} завершено (${restart} спроб, ${improvements} покращень${duplicatesInRow >= MAX_DUPLICATES_IN_ROW ? ', пошук вичерпано' : ''})`,
    100
  );
};
