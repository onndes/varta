// src/services/autoScheduler/comparator.ts
// Deterministic comparator + candidate pool filters for constraint optimization.

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { calculateUserLoad, countUserDaysOfWeek } from '../scheduleService';
import { toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import {
  countEligibleUsersForDate,
  countEligibleUsersForWeek,
  countUserAssignmentsInRange,
  getDatesInRange,
  getDateMinusDays,
  getLastAssignedDayIdx,
  getWeekWindow,
  getWeeklyAssignmentCap,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  daysSinceLastSameDowAssignment,
  daysSinceLastAssignment,
  computeDowFairnessObjective,
  didUserServeSameWeekdayLastWeek,
  floatEq,
  getDebtRepaymentScore,
  getUserMaxDowCount,
  getUserMinDowCount,
  computeUserLoadRate,
} from './helpers';

/**
 * Comparator for candidate ranking on a specific date.
 *
 * Priority order:
 * -2. Cross-DOW zero guard: if user has max DOW count ≥ 2 while min DOW count = 0
 *     AND this DOW is their max → deprioritize (prevent 2+ in one DOW while 0 in another).
 * -1. forceUseAllWhenFew: absolute priority for zero-assignment users (hard switch).
 *     Users with 0 duties this week beat all others unconditionally.
 * 0.  getDowCount — FIRST regular criterion (strict DOW fairness account).
 * 1.  Lower post-assignment SSE objective for this day-of-week.
 * 2.  Exponential penalty for serving the same weekday recently
 *     (7d ago = 100, 14d ago = 25, 21d ago = 6.25). Soft, not a hard block.
 * 3.  Soft +1 shift preference (high weight: last duty DOW + 1).
 * 4.  Fewer duties in current week (normal mode / tie-break).
 * 5.  DOW recency (longer gap since same DOW = higher priority).
 * 6.  Remaining availability for forceUse mode.
 * 7.  Fewer total duties.
 * 8.  Load balancing (if enabled).
 * 9.  Longer time since last duty.
 * 10. Stable tie-break by id.
 */
export const buildUserComparator = (
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  _tempLoadOffset?: Record<number, number>,
  fairnessSchedule?: Record<string, ScheduleEntry>,
  totalEligibleCount?: number,
  candidatePool?: User[],
  fairnessUsers?: User[]
): ((a: User, b: User) => number) => {
  const fs = fairnessSchedule || schedule;
  const dayIdx = new Date(dateStr).getDay();
  const week = getWeekWindow(dateStr);

  const population = (fairnessUsers?.length ? fairnessUsers : candidatePool || [])
    .filter((u) => u.id)
    .map((u) => u.id!) as number[];

  const stablePopulation =
    population.length > 0 ? population : (candidatePool || []).map((u) => u.id!);

  const dowCountCache = new Map<number, number>();
  const objectiveCache = new Map<number, number>();
  const plusOnePenaltyCache = new Map<number, number>();
  const weekCountCache = new Map<number, number>();
  const waitCache = new Map<number, number>();
  const dowRecencyCache = new Map<number, number>();
  const loadCache = new Map<number, number>();
  const remainingForceUseAvailCache = new Map<number, number>();
  const sameDowPenaltyCache = new Map<number, number>();
  const crossDowGuardCache = new Map<number, number>();
  const loadRateCache = new Map<number, number>();

  const getDowCount = (userId: number): number => {
    if (dowCountCache.has(userId)) return dowCountCache.get(userId)!;
    const val = countUserDaysOfWeek(userId, fs)[dayIdx] || 0;
    dowCountCache.set(userId, val);
    return val;
  };

  const getObjective = (userId: number): number => {
    if (objectiveCache.has(userId)) return objectiveCache.get(userId)!;
    const pop = stablePopulation.length > 0 ? stablePopulation : [userId];
    const val = computeDowFairnessObjective(dayIdx, pop, fs, userId);
    objectiveCache.set(userId, val);
    return val;
  };

  const getPlusOnePenalty = (userId: number): number => {
    if (plusOnePenaltyCache.has(userId)) return plusOnePenaltyCache.get(userId)!;
    const lastDow = getLastAssignedDayIdx(userId, fs, dateStr);
    // No history -> neutral.
    if (lastDow === null) {
      plusOnePenaltyCache.set(userId, 0);
      return 0;
    }
    const expectedNextDow = (lastDow + 1) % 7;
    const penalty = expectedNextDow === dayIdx ? 0 : 1;
    plusOnePenaltyCache.set(userId, penalty);
    return penalty;
  };

  const getWeekCount = (userId: number): number => {
    if (weekCountCache.has(userId)) return weekCountCache.get(userId)!;
    const val = countUserAssignmentsInRange(userId, fs, week.from, week.to);
    weekCountCache.set(userId, val);
    return val;
  };

  const getWaitDays = (userId: number): number => {
    if (waitCache.has(userId)) return waitCache.get(userId)!;
    const val = daysSinceLastAssignment(userId, fs, dateStr);
    waitCache.set(userId, val);
    return val;
  };

  const getDowRecency = (userId: number): number => {
    if (dowRecencyCache.has(userId)) return dowRecencyCache.get(userId)!;
    const val = daysSinceLastSameDowAssignment(userId, fs, dateStr);
    dowRecencyCache.set(userId, val);
    return val;
  };

  const getEffectiveLoad = (user: User): number => {
    const userId = user.id!;
    if (loadCache.has(userId)) return loadCache.get(userId)!;
    const val = calculateUserLoad(userId, fs, dayWeights) + (user.debt || 0);
    loadCache.set(userId, val);
    return val;
  };

  const getForceUseRemainingAvailability = (user: User): number => {
    if (!user.id) return 0;
    if (remainingForceUseAvailCache.has(user.id)) return remainingForceUseAvailCache.get(user.id)!;
    const dates = getDatesInRange(dateStr, week.to);
    let count = 0;
    for (const d of dates) {
      // Count only physical availability — same-weekday recency is a soft penalty,
      // not a hard block (prevents the Khlivnyuk starvation effect).
      if (getUserAvailabilityStatus(user, d) !== 'AVAILABLE') continue;
      count++;
    }
    remainingForceUseAvailCache.set(user.id, count);
    return count;
  };

  /**
   * Exponential penalty for serving the same DOW recently.
   * 7 days ago → 100, 14d → 25, 21d → 6.25, >28d → 0.
   * This is much stronger than a binary flag, making the scheduler
   * work very hard to avoid same-DOW repeats across weeks.
   */
  const getSameDowPenalty = (userId: number): number => {
    if (sameDowPenaltyCache.has(userId)) return sameDowPenaltyCache.get(userId)!;
    const daysSince = daysSinceLastSameDowAssignment(userId, fs, dateStr);
    let penalty = 0;
    if (daysSince <= 7) {
      penalty = 100; // Last week — extreme penalty
    } else if (daysSince <= 14) {
      penalty = 25; // Two weeks ago — strong penalty
    } else if (daysSince <= 21) {
      penalty = 6.25; // Three weeks ago — moderate
    }
    sameDowPenaltyCache.set(userId, penalty);
    return penalty;
  };

  /**
   * Cross-DOW imbalance guard (ABSOLUTE LAW): penalizes adding duties to any DOW
   * where count > minDow while imbalance already exists (maxDow > minDow).
   * Catches both [0,2,0,...] (minDow=0) and [1,3,1,...] (minDow=1) patterns.
   * Previously only triggered when minDow === 0, missing the second case.
   * Penalty > 5000 to dominate all other soft constraints.
   */
  const getCrossDowGuard = (userId: number): number => {
    if (crossDowGuardCache.has(userId)) return crossDowGuardCache.get(userId)!;
    const user = (fairnessUsers?.length ? fairnessUsers : candidatePool || []).find(
      (u) => u.id === userId
    );
    const blocked = user?.blockedDays;
    const maxDow = getUserMaxDowCount(userId, fs, blocked);
    const minDow = getUserMinDowCount(userId, fs, blocked);
    const thisDowCount = getDowCount(userId);
    let penalty = 0;
    // Penalize adding to a non-minimum DOW whenever any imbalance exists.
    if (maxDow > minDow && thisDowCount > minDow) {
      penalty = 5000 + 2500 * (thisDowCount - minDow + 1); // ABSOLUTE LAW
    }
    crossDowGuardCache.set(userId, penalty);
    return penalty;
  };

  return (a: User, b: User): number => {
    if (!a.id || !b.id) return 0;

    const isForceUseFew =
      options.forceUseAllWhenFew &&
      totalEligibleCount !== undefined &&
      totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT;

    // -2. Cross-DOW zero guard: prevent accumulating duties on one DOW
    //     while another DOW remains at 0. Must come before forceUseAll
    //     so that DOW diversity is respected even when forcing all users.
    const guardA = getCrossDowGuard(a.id);
    const guardB = getCrossDowGuard(b.id);
    if (guardA !== guardB) return guardA - guardB;

    // -1. forceUseAllWhenFew: absolute priority for zero-assignment users.
    //     Zero-duty user this week always beats a non-zero user, regardless of DOW history.
    if (isForceUseFew) {
      const weekA = getWeekCount(a.id);
      const weekB = getWeekCount(b.id);
      const aIsZero = weekA === 0 ? 1 : 0;
      const bIsZero = weekB === 0 ? 1 : 0;
      if (aIsZero !== bIsZero) return bIsZero - aIsZero;
    }

    // 0. DOW counter — strict DOW fairness account.
    const dowA = getDowCount(a.id);
    const dowB = getDowCount(b.id);
    if (dowA !== dowB) return dowA - dowB;

    if (options.prioritizeFasterDebtRepayment) {
      const dayWeight = dayWeights[dayIdx] || 1.0;
      const debtAfterOneShift = (u: User): number => {
        const debtAbs = Math.abs(Math.min(0, u.debt || 0));
        const owedToday = (u.owedDays && u.owedDays[dayIdx]) || 0;
        if (debtAbs <= 0 || owedToday <= 0) return Number.POSITIVE_INFINITY;
        return Math.max(0, debtAbs - dayWeight);
      };
      const remA = debtAfterOneShift(a);
      const remB = debtAfterOneShift(b);
      if (remA !== remB) return remA - remB;

      const repayA = getDebtRepaymentScore(a, dayIdx, dayWeight);
      const repayB = getDebtRepaymentScore(b, dayIdx, dayWeight);
      if (repayA !== repayB) return repayB - repayA;
    }

    if (options.respectOwedDays) {
      const owedA = (a.owedDays && a.owedDays[dayIdx]) || 0;
      const owedB = (b.owedDays && b.owedDays[dayIdx]) || 0;
      if (owedA !== owedB) return owedB - owedA;
    }

    // 1. Lower post-assignment SSE for this DOW.
    const objectiveA = getObjective(a.id);
    const objectiveB = getObjective(b.id);
    if (!floatEq(objectiveA, objectiveB)) return objectiveA - objectiveB;

    // 2. Exponential penalty for same DOW recently (SOFT — not a hard block).
    //    Much stronger than a binary flag: 100 for last week, 25 for 2 weeks ago.
    //    Makes the scheduler strongly prefer rotating through different DOWs.
    const sameDowA = getSameDowPenalty(a.id);
    const sameDowB = getSameDowPenalty(b.id);
    if (!floatEq(sameDowA, sameDowB)) return sameDowA - sameDowB;

    // 3. Weekly cap tie-break (normal mode). (+1 shift preference removed: it conflicted
    //    with DOW-balance by pulling toward a "ladder" pattern instead of gap-filling.)
    if (
      options.limitOneDutyPerWeekWhenSevenPlus &&
      (totalEligibleCount ?? 0) >= MIN_USERS_FOR_WEEKLY_LIMIT
    ) {
      const weekA = getWeekCount(a.id);
      const weekB = getWeekCount(b.id);
      if (weekA !== weekB) return weekA - weekB;
    }

    // 5. DOW recency.
    const dowRecencyA = getDowRecency(a.id);
    const dowRecencyB = getDowRecency(b.id);
    if (dowRecencyA !== dowRecencyB) return dowRecencyB - dowRecencyA;

    // 6. Remaining availability in forceUse mode.
    if (isForceUseFew) {
      const remainingAvailA = Math.max(1, getForceUseRemainingAvailability(a));
      const remainingAvailB = Math.max(1, getForceUseRemainingAvailability(b));
      if (remainingAvailA !== remainingAvailB) return remainingAvailA - remainingAvailB;
    }

    // 7. Fewer total duties — normalised by Load Rate (anti-catch-up).
    //    Rate = assignments / days_active. Prevents newcomers from being overloaded.
    const allUsers = fairnessUsers?.length ? fairnessUsers : candidatePool || [];
    const rateA = (() => {
      if (loadRateCache.has(a.id!)) return loadRateCache.get(a.id!)!;
      const v = computeUserLoadRate(a.id!, fs, dateStr, allUsers);
      loadRateCache.set(a.id!, v);
      return v;
    })();
    const rateB = (() => {
      if (loadRateCache.has(b.id!)) return loadRateCache.get(b.id!)!;
      const v = computeUserLoadRate(b.id!, fs, dateStr, allUsers);
      loadRateCache.set(b.id!, v);
      return v;
    })();
    if (!floatEq(rateA, rateB)) return rateA - rateB;

    // 8. Load balancing.
    if (options.considerLoad) {
      const loadA = getEffectiveLoad(a);
      const loadB = getEffectiveLoad(b);
      if (!floatEq(loadA, loadB)) return loadA - loadB;
    }

    // 9. Longer time since last duty.
    const waitA = getWaitDays(a.id);
    const waitB = getWaitDays(b.id);
    if (waitA !== waitB) return waitB - waitA;

    // 10. Stable tie-break.
    return a.id - b.id;
  };
};

/**
 * Hard filter for forceUseAllWhenFew:
 * While any user in the pool has 0 assignments this week,
 * restrict the pool to zero-assignment users only.
 * Enforces the hard switch: "no second duty until everyone has one."
 */
export const filterForceUseAllWhenFew = (
  pool: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): User[] => {
  const week = getWeekWindow(dateStr);
  const withCounts = pool.map((u) => ({
    user: u,
    count: countUserAssignmentsInRange(u.id!, schedule, week.from, week.to),
  }));
  const zeroUsers = withCounts.filter((x) => x.count === 0).map((x) => x.user);
  return zeroUsers.length > 0 ? zeroUsers : pool;
};

/** Remove users with duties inside the rest window around target date. */
export const filterByRestDays = (
  pool: User[],
  dateStr: string,
  minRest: number,
  tempSchedule: Record<string, ScheduleEntry>
): User[] => {
  const recentUserIds = new Set<number>();
  for (let i = 1; i <= minRest; i++) {
    const checkBefore = new Date(dateStr);
    checkBefore.setDate(checkBefore.getDate() - i);
    const rawBefore = tempSchedule[toLocalISO(checkBefore)]?.userId;
    if (rawBefore) {
      const ids = Array.isArray(rawBefore) ? rawBefore : [rawBefore];
      ids.forEach((id) => recentUserIds.add(id));
    }

    const checkAfter = new Date(dateStr);
    checkAfter.setDate(checkAfter.getDate() + i);
    const rawAfter = tempSchedule[toLocalISO(checkAfter)]?.userId;
    if (rawAfter) {
      const ids = Array.isArray(rawAfter) ? rawAfter : [rawAfter];
      ids.forEach((id) => recentUserIds.add(id));
    }
  }
  if (recentUserIds.size === 0) return pool;
  const filtered = pool.filter((u) => !recentUserIds.has(u.id!));
  return filtered.length > 0 ? filtered : pool;
};

/**
 * Filter out users incompatible with those assigned on adjacent days.
 * Bidirectional check.
 */
export const filterByIncompatiblePairs = (
  pool: User[],
  allUsers: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): User[] => {
  const prevDate = getDateMinusDays(dateStr, 1);
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = toLocalISO(nextDate);

  const neighborIds = new Set<number>();
  for (const d of [prevDate, nextDateStr]) {
    const entry = schedule[d];
    if (entry) {
      toAssignedUserIds(entry.userId).forEach((id) => neighborIds.add(id));
    }
  }

  if (neighborIds.size === 0) return pool;

  const blockedIds = new Set<number>();
  for (const nId of neighborIds) {
    const neighbor = allUsers.find((u) => u.id === nId);
    if (neighbor?.incompatibleWith) {
      neighbor.incompatibleWith.forEach((id) => blockedIds.add(id));
    }
  }
  for (const candidate of pool) {
    if (!candidate.incompatibleWith) continue;
    for (const nId of neighborIds) {
      if (candidate.incompatibleWith.includes(nId)) {
        blockedIds.add(candidate.id!);
      }
    }
  }

  if (blockedIds.size === 0) return pool;
  const filtered = pool.filter((u) => !blockedIds.has(u.id!));
  return filtered.length > 0 ? filtered : pool;
};

/** Weekly cap filter (configurable only when enough users available). */
export const filterByWeeklyCap = (
  pool: User[],
  allUsers: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  options: AutoScheduleOptions,
  _eligibleCountOnDate?: number // kept for compat; gate now uses week-based count
): User[] => {
  // Gate by week-level eligibility so that a low-availability Friday
  // doesn't silently disable the cap for the whole week.
  const weekEligibleCount = countEligibleUsersForWeek(allUsers, schedule, dateStr);
  if (weekEligibleCount < MIN_USERS_FOR_WEEKLY_LIMIT) return pool;

  const week = getWeekWindow(dateStr);
  const filtered = pool.filter((u) => {
    if (!u.id) return false;
    const assignedInWeek = countUserAssignmentsInRange(u.id, schedule, week.from, week.to);
    return assignedInWeek < getWeeklyAssignmentCap(u, options);
  });
  return filtered.length >= 1 ? filtered : pool;
};

/**
 * Hard filter: forbid the same weekday two weeks in a row (exactly -7 days).
 * Exception: users with 0 duties this week always pass through (starvation guard) —
 * forceUseAllWhenFew and coverage fairness take precedence over DOW-repeat avoidance.
 * Falls back to original pool if all candidates would be blocked.
 */
export const filterBySameWeekdayLastWeek = (
  pool: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): User[] => {
  const week = getWeekWindow(dateStr);
  const filtered = pool.filter((u) => {
    if (!u.id) return false;
    if (!didUserServeSameWeekdayLastWeek(u.id, dateStr, schedule)) return true;
    // Allow same-weekday repeat if user has 0 duties this week — never starve them.
    const weeklyCount = countUserAssignmentsInRange(u.id, schedule, week.from, week.to);
    return weeklyCount === 0;
  });
  return filtered.length > 0 ? filtered : pool;
};
