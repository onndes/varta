// src/services/autoScheduler/comparator.ts
// Deterministic comparator + candidate pool filters for constraint optimization.

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { calculateUserLoad, countUserAssignments, countUserDaysOfWeek } from '../scheduleService';
import { toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../userService';
import {
  countEligibleUsersForDate,
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
} from './helpers';

/**
 * Comparator for candidate ranking on a specific date.
 *
 * Priority order:
 * -1. forceUseAllWhenFew: absolute priority for zero-assignment users (hard switch).
 *     Users with 0 duties this week beat all others unconditionally.
 * 0.  getDowCount — FIRST regular criterion (strict DOW fairness account).
 * 1.  Lower post-assignment SSE objective for this day-of-week.
 * 2.  Heavy penalty for serving the same weekday last week (SOFT — not a hard block).
 * 3.  Fewer duties in current week (normal mode / tie-break).
 * 4.  DOW recency (longer gap since same DOW = higher priority).
 * 5.  Soft +1 shift preference (last duty day + 1) / remaining availability for forceUse.
 * 6.  Fewer total duties.
 * 7.  Load balancing (if enabled).
 * 8.  Longer time since last duty.
 * 9.  Stable tie-break by id.
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
  const totalCountCache = new Map<number, number>();
  const waitCache = new Map<number, number>();
  const dowRecencyCache = new Map<number, number>();
  const loadCache = new Map<number, number>();
  const remainingForceUseAvailCache = new Map<number, number>();
  const sameDowLastWeekPenaltyCache = new Map<number, number>();

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

  const getTotalCount = (userId: number): number => {
    if (totalCountCache.has(userId)) return totalCountCache.get(userId)!;
    const val = countUserAssignments(userId, fs);
    totalCountCache.set(userId, val);
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

  const getSameDowLastWeekPenalty = (userId: number): number => {
    if (sameDowLastWeekPenaltyCache.has(userId)) return sameDowLastWeekPenaltyCache.get(userId)!;
    const penalty = didUserServeSameWeekdayLastWeek(userId, dateStr, schedule) ? 1 : 0;
    sameDowLastWeekPenaltyCache.set(userId, penalty);
    return penalty;
  };

  return (a: User, b: User): number => {
    if (!a.id || !b.id) return 0;

    const isForceUseFew =
      options.forceUseAllWhenFew &&
      totalEligibleCount !== undefined &&
      totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT;

    // -1. forceUseAllWhenFew: absolute priority for zero-assignment users.
    //     Zero-duty user this week always beats a non-zero user, regardless of DOW history.
    if (isForceUseFew) {
      const weekA = getWeekCount(a.id);
      const weekB = getWeekCount(b.id);
      const aIsZero = weekA === 0 ? 1 : 0;
      const bIsZero = weekB === 0 ? 1 : 0;
      if (aIsZero !== bIsZero) return bIsZero - aIsZero;
    }

    // 0. DOW counter — FIRST regular criterion (strict fairness account).
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

    // 2. Heavy penalty for same weekday as last week (SOFT — not a hard block).
    //    This must come AFTER objectiveA/B so that DOW balance is not broken,
    //    but still discourages repeating same-DOW assignments across weeks.
    const recentSameDowA = getSameDowLastWeekPenalty(a.id);
    const recentSameDowB = getSameDowLastWeekPenalty(b.id);
    if (recentSameDowA !== recentSameDowB) return recentSameDowA - recentSameDowB;

    // 3. Weekly cap tie-break (normal mode).
    if (
      options.limitOneDutyPerWeekWhenSevenPlus &&
      (totalEligibleCount ?? 0) >= MIN_USERS_FOR_WEEKLY_LIMIT
    ) {
      const weekA = getWeekCount(a.id);
      const weekB = getWeekCount(b.id);
      if (weekA !== weekB) return weekA - weekB;
    }

    // 4. DOW recency.
    const dowRecencyA = getDowRecency(a.id);
    const dowRecencyB = getDowRecency(b.id);
    if (dowRecencyA !== dowRecencyB) return dowRecencyB - dowRecencyA;

    // 5. Soft +1 preference / remaining availability in forceUse mode.
    if (!isForceUseFew) {
      const plusOneA = getPlusOnePenalty(a.id);
      const plusOneB = getPlusOnePenalty(b.id);
      if (plusOneA !== plusOneB) return plusOneA - plusOneB;
    } else {
      const remainingAvailA = Math.max(1, getForceUseRemainingAvailability(a));
      const remainingAvailB = Math.max(1, getForceUseRemainingAvailability(b));
      if (remainingAvailA !== remainingAvailB) return remainingAvailA - remainingAvailB;
    }

    // 6. Fewer total duties.
    const totalA = getTotalCount(a.id);
    const totalB = getTotalCount(b.id);
    if (totalA !== totalB) return totalA - totalB;

    // 7. Load balancing.
    if (options.considerLoad) {
      const loadA = getEffectiveLoad(a);
      const loadB = getEffectiveLoad(b);
      if (!floatEq(loadA, loadB)) return loadA - loadB;
    }

    // 8. Longer time since last duty.
    const waitA = getWaitDays(a.id);
    const waitB = getWaitDays(b.id);
    if (waitA !== waitB) return waitB - waitA;

    // 9. Stable tie-break.
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
  eligibleCountOnDate?: number
): User[] => {
  const effectiveEligibleCount =
    eligibleCountOnDate ?? countEligibleUsersForDate(allUsers, schedule, dateStr);
  if (effectiveEligibleCount < MIN_USERS_FOR_WEEKLY_LIMIT) return pool;

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
 * No fallback to original pool.
 */
export const filterBySameWeekdayLastWeek = (
  pool: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): User[] => {
  return pool.filter((u) => u.id && !didUserServeSameWeekdayLastWeek(u.id, dateStr, schedule));
};
