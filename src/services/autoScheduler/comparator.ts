// src/services/autoScheduler/comparator.ts
// Універсальний компаратор пріоритетів + фільтрація пулу кандидатів

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { calculateUserLoad, countUserDaysOfWeek, countUserAssignments } from '../scheduleService';
import { toAssignedUserIds } from '../../utils/assignment';
import {
  buildEarliestHistoryMap,
  countEligibleUsersForDate,
  getPrevDateStr,
  getWeekWindow,
  getDebtRepaymentScore,
  getAggressiveBalanceDecision,
  countUserAssignmentsInRange,
  daysSinceLastAssignment,
  countAvailableDaysInWindow,
  floatEq,
  getUserCompareFrom,
  getWeeklyAssignmentCap,
  MIN_USERS_FOR_WEEKLY_LIMIT,
} from './helpers';

// ─── Універсальний компаратор пріоритетів ──────────────────────────

/**
 * Сортує двох бійців за пріоритетом призначення на дату.
 *
 * Пріоритети (від найважливішого):
 * 0. Агресивне балансування (override, якщо включено)
 * 1. Хто винен саме цей день тижня (owedDays)
 * 2. Швидше повернення боргу (debtRepayment)
 * 3. Рівномірний розподіл по днях тижня (нормалізовано)
 * 4. Менше нарядів в поточному тижні
 * 5. Хто довше чекає з останнього наряду
 * 6. Загальна кількість нарядів (нормалізовано до доступності)
 * 7. Зважене навантаження + карма (нормалізовано)
 * 8. Рандом (щоб уникнути системного зміщення)
 *
 * @param tempLoadOffset - тимчасова надбавка навантаження (використовується в autoFillSchedule)
 */
export const buildUserComparator = (
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  tempLoadOffset?: Record<number, number>,
  fairnessSchedule?: Record<string, ScheduleEntry>,
  totalEligibleCount?: number
): ((a: User, b: User) => number) => {
  // For load/fairness calcs use fairnessSchedule (history entries filtered out);
  // for existence/constraint checks the caller uses the full schedule directly.
  const fs = fairnessSchedule || schedule;
  const earliestHistoryByUser = buildEarliestHistoryMap(fs);
  const dayIdx = new Date(dateStr).getDay();
  const weight = dayWeights[dayIdx] || 1.0;
  const compareTo = getPrevDateStr(dateStr);

  return (a: User, b: User): number => {
    if (!a.id || !b.id) return 0;

    const fromA = getUserCompareFrom(a, dateStr, fs, earliestHistoryByUser);
    const fromB = getUserCompareFrom(b, dateStr, fs, earliestHistoryByUser);
    const offsetA = tempLoadOffset?.[a.id] ?? 0;
    const offsetB = tempLoadOffset?.[b.id] ?? 0;

    // Пріоритет -1: Примусове використання всіх при малій кількості людей
    // Якщо людей 7 або менше — спочатку ставимо тих, хто ще не чергував цього тижня
    if (
      options.forceUseAllWhenFew &&
      totalEligibleCount !== undefined &&
      totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
    ) {
      const week = getWeekWindow(dateStr);
      const weekA = countUserAssignmentsInRange(a.id!, fs, week.from, week.to);
      const weekB = countUserAssignmentsInRange(b.id!, fs, week.from, week.to);
      if (weekA !== weekB) return weekA - weekB;

      // Tie-break for "use everyone" mode:
      // prefer users with a narrower remaining availability window in this week,
      // so we don't miss assigning weekend-only users when they still can be scheduled.
      const remainingAvailA = Math.max(1, countAvailableDaysInWindow(a, dateStr, week.to));
      const remainingAvailB = Math.max(1, countAvailableDaysInWindow(b, dateStr, week.to));
      if (remainingAvailA !== remainingAvailB) return remainingAvailA - remainingAvailB;
    }

    // Пріоритет 0: Агресивне балансування (override)
    if (options.considerLoad && options.aggressiveLoadBalancing) {
      const threshold = Math.max(0, options.aggressiveLoadBalancingThreshold ?? 0.2);
      const loadA = calculateUserLoad(a.id, fs, dayWeights, fromA) + offsetA + (a.debt || 0);
      const loadB = calculateUserLoad(b.id, fs, dayWeights, fromB) + offsetB + (b.debt || 0);
      const forced = getAggressiveBalanceDecision(loadA, loadB, threshold);
      if (forced !== 0) return forced;
    }

    // Пріоритет 1: Хто винен саме цей день тижня
    if (options.respectOwedDays) {
      const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
      const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
      if (oweA !== oweB) return oweB - oweA;
    }

    // Пріоритет 2: Швидше повернення боргу
    if (options.prioritizeFasterDebtRepayment) {
      const repayA = getDebtRepaymentScore(a, dayIdx, weight);
      const repayB = getDebtRepaymentScore(b, dayIdx, weight);
      if (repayA !== repayB) return repayB - repayA;
    }

    if (options.considerLoad) {
      // Пріоритет 3: Рівномірний розподіл по днях тижня (нормалізовано до доступності)
      const dowA = countUserDaysOfWeek(a.id, fs, fromA)[dayIdx] || 0;
      const dowB = countUserDaysOfWeek(b.id, fs, fromB)[dayIdx] || 0;
      const dowAvailA = Math.max(1, countAvailableDaysInWindow(a, fromA, compareTo, dayIdx));
      const dowAvailB = Math.max(1, countAvailableDaysInWindow(b, fromB, compareTo, dayIdx));
      const dowRateA = dowA / dowAvailA;
      const dowRateB = dowB / dowAvailB;
      if (!floatEq(dowRateA, dowRateB)) return dowRateA - dowRateB;

      // Пріоритет 4: Менше нарядів в поточному тижні
      const week = getWeekWindow(dateStr);
      const weekA = countUserAssignmentsInRange(a.id, fs, week.from, week.to);
      const weekB = countUserAssignmentsInRange(b.id, fs, week.from, week.to);
      if (weekA !== weekB) return weekA - weekB;

      // Пріоритет 5: Хто довше чекає з останнього наряду
      const waitA = daysSinceLastAssignment(a.id, fs, dateStr);
      const waitB = daysSinceLastAssignment(b.id, fs, dateStr);
      if (waitA !== waitB) return waitB - waitA;

      // Пріоритет 6: Загальна кількість нарядів (нормалізовано)
      const totalA = countUserAssignments(a.id, fs, fromA) + offsetA;
      const totalB = countUserAssignments(b.id, fs, fromB) + offsetB;
      const availA = Math.max(1, countAvailableDaysInWindow(a, fromA, compareTo));
      const availB = Math.max(1, countAvailableDaysInWindow(b, fromB, compareTo));
      const totalRateA = totalA / availA;
      const totalRateB = totalB / availB;
      if (!floatEq(totalRateA, totalRateB)) return totalRateA - totalRateB;

      // Пріоритет 7: Зважене навантаження + карма
      const loadA = calculateUserLoad(a.id, fs, dayWeights, fromA) + offsetA + (a.debt || 0);
      const loadB = calculateUserLoad(b.id, fs, dayWeights, fromB) + offsetB + (b.debt || 0);
      const loadDiff = loadA / availA - loadB / availB;
      if (!floatEq(loadDiff, 0)) return loadDiff;
    }

    // Пріоритет 8: Рандом (уникаємо системного зміщення)
    return Math.random() - 0.5;
  };
};

// ─── Допоміжні: фільтрація пулу ────────────────────────────────────

/** Видалити з пулу тих, хто чергував нещодавно (дні відпочинку) */
export const filterByRestDays = (
  pool: User[],
  dateStr: string,
  minRest: number,
  tempSchedule: Record<string, ScheduleEntry>
): User[] => {
  const recentUserIds = new Set<number>();
  for (let i = 1; i <= minRest; i++) {
    // Backward: check previous days
    const checkBefore = new Date(dateStr);
    checkBefore.setDate(checkBefore.getDate() - i);
    const rawBefore = tempSchedule[toLocalISO(checkBefore)]?.userId;
    if (rawBefore) {
      const ids = Array.isArray(rawBefore) ? rawBefore : [rawBefore];
      ids.forEach((id) => recentUserIds.add(id));
    }
    // Forward: check next days (pre-existing entries like manual assignments)
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
 * Bidirectional: if A has B in incompatibleWith, OR B has A — both block.
 */
export const filterByIncompatiblePairs = (
  pool: User[],
  allUsers: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): User[] => {
  const prevDate = getPrevDateStr(dateStr);
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
  // Forward: neighbor has candidate in their incompatibleWith
  for (const nId of neighborIds) {
    const neighbor = allUsers.find((u) => u.id === nId);
    if (neighbor?.incompatibleWith) {
      neighbor.incompatibleWith.forEach((id) => blockedIds.add(id));
    }
  }
  // Reverse: candidate has neighbor in their incompatibleWith
  for (const candidate of pool) {
    if (candidate.incompatibleWith) {
      for (const nId of neighborIds) {
        if (candidate.incompatibleWith.includes(nId)) {
          blockedIds.add(candidate.id!);
        }
      }
    }
  }

  if (blockedIds.size === 0) return pool;

  const filtered = pool.filter((u) => !blockedIds.has(u.id!));
  return filtered.length > 0 ? filtered : pool;
};

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
  return filtered.length > 0 ? filtered : pool;
};
