// src/services/autoScheduler/comparator.ts
// Універсальний компаратор пріоритетів + фільтрація пулу кандидатів

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { calculateUserLoad, countUserAssignments, countUserDaysOfWeek } from '../scheduleService';
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
  daysSinceLastSameDowAssignment,
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

  // Cache DOW-recency per user to avoid O(n) scan on every comparator call.
  // daysSinceLastSameDowAssignment iterates the full schedule — caching it once
  // per date keeps the sort at O(n log n) instead of O(n² log n).
  const _dowRecencyCache = new Map<number, number>();
  const getDowRecency = (userId: number): number => {
    if (_dowRecencyCache.has(userId)) return _dowRecencyCache.get(userId)!;
    const v = daysSinceLastSameDowAssignment(userId, fs, dateStr);
    _dowRecencyCache.set(userId, v);
    return v;
  };

  // Cache raw DOW count per user for the current target day-of-week.
  // Directly implements "fill zeros first" (1111111 → 2111111 → …):
  // whoever has served this DOW fewer times gets priority.
  const _dowCountCache = new Map<number, number>();
  const getDowCount = (user: User): number => {
    const uid = user.id!;
    if (_dowCountCache.has(uid)) return _dowCountCache.get(uid)!;
    const from = getUserCompareFrom(user, dateStr, fs, earliestHistoryByUser);
    const dowCounts = countUserDaysOfWeek(uid, fs, from);
    const v = dowCounts[dayIdx] ?? 0;
    _dowCountCache.set(uid, v);
    return v;
  };

  return (a: User, b: User): number => {
    if (!a.id || !b.id) return 0;

    const fromA = getUserCompareFrom(a, dateStr, fs, earliestHistoryByUser);
    const fromB = getUserCompareFrom(b, dateStr, fs, earliestHistoryByUser);
    const offsetA = tempLoadOffset?.[a.id] ?? 0;
    const offsetB = tempLoadOffset?.[b.id] ?? 0;

    // Flag: when P-1 tie-breaks are exhausted (all DOW metrics equal),
    // replace P5 (wait time) with a deterministic week-based rotation.
    // P5 biases against the most-recently-served user, which forces the
    // same person onto Sunday every week. The rotation prevents this.
    let useWeekRotation = false;
    let weekRotationSeed = 0;

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
      // «Задіяти всіх»: користувач з меншою кількістю нарядів за тиждень
      // ЗАВЖДИ має пріоритет. Ротація по днях тижня — нижче через getDowCount.
      if (weekA !== weekB) return weekA - weekB;

      // Tie-break 1: DOW count — fewer assignments on THIS day-of-week wins.
      {
        const dowA = getDowCount(a);
        const dowB = getDowCount(b);
        if (dowA !== dowB) return dowA - dowB;
      }

      // Tie-break 2: DOW-recency — prefer the user who waited LONGER for this day-of-week.
      const dowWaitA = getDowRecency(a.id!);
      const dowWaitB = getDowRecency(b.id!);
      if (Math.abs(dowWaitA - dowWaitB) > 0.5) return dowWaitB - dowWaitA;

      // Tie-break 3: "now-or-never" — prefer users with a narrower remaining
      // availability window, so we don't miss weekend-only users.
      const remainingAvailA = Math.max(1, countAvailableDaysInWindow(a, dateStr, week.to));
      const remainingAvailB = Math.max(1, countAvailableDaysInWindow(b, dateStr, week.to));
      if (remainingAvailA !== remainingAvailB) return remainingAvailA - remainingAvailB;

      // All P-1 DOW tie-breaks exhausted — mark for week rotation at P5.
      // DON'T return here: P0-P4 (debt, owed days, load) must still run.
      useWeekRotation = true;
      weekRotationSeed = new Date(week.from).getTime() / 86400000;
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
      // Пріоритет 3: Рівномірний розподіл по днях тижня (raw count)
      // Порівнюємо скільки разів кожен боєць вже чергував саме в цей день тижня.
      // Хто чергував менше разів — іде першим. Це прямо реалізує política
      // «спочатку 1111111, потім 2111111, 2211111 і т.д.»
      // Нормалізація за доступністю зайва: недоступні бійці не потрапляють у пул.
      {
        const dowA = getDowCount(a);
        const dowB = getDowCount(b);
        if (dowA !== dowB) return dowA - dowB;
      }

      // Пріоритет 3.5: Заборона двох підряд однакових днів тижня
      // Людина чергувала в цей же день тижня менше ніж 8 днів тому →
      // знижуємо пріоритет НЕЗАЛЕЖНО від дефіциту. Раніше вимагали
      // deficit ≤ 0 (перебраний), але це не працює коли тривала історія
      // розмиває дефіцит (Хлівнюк: 1 Sun з 10 → deficit = +0.035,
      // хоча щойно чергував у неділю). Самого факту «7 днів тому» достатньо.
      {
        const recentSameDowA = getDowRecency(a.id!) <= 7 ? 1 : 0;
        const recentSameDowB = getDowRecency(b.id!) <= 7 ? 1 : 0;
        if (recentSameDowA !== recentSameDowB) return recentSameDowA - recentSameDowB;
      }

      // Пріоритет 4: Менше нарядів в поточному тижні
      const week = getWeekWindow(dateStr);
      const weekA = countUserAssignmentsInRange(a.id, fs, week.from, week.to);
      const weekB = countUserAssignmentsInRange(b.id, fs, week.from, week.to);
      if (weekA !== weekB) return weekA - weekB;

      // Пріоритет 5: Хто довше чекає з останнього наряду.
      // SKIP when forceUseAllWhenFew P-1 tie-breaks were exhausted:
      // P5 biases against the most-recently-served user, which pushes
      // the same person to the last day of the week (e.g. Sunday) every
      // week because their wait time is the shortest on Monday.
      // In that case, use a deterministic week-based rotation instead.
      if (!useWeekRotation) {
        const waitA = daysSinceLastAssignment(a.id, fs, dateStr);
        const waitB = daysSinceLastAssignment(b.id, fs, dateStr);
        if (waitA !== waitB) return waitB - waitA;
      } else {
        const hashA = Math.imul(a.id!, 0x9e3779b9) + Math.imul(weekRotationSeed | 0, 0x517cc1b7);
        const hashB = Math.imul(b.id!, 0x9e3779b9) + Math.imul(weekRotationSeed | 0, 0x517cc1b7);
        const diff = (hashA >>> 0) - (hashB >>> 0);
        if (diff !== 0) return diff;
      }

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
  // Return filtered pool whenever at least 1 user passes the cap.
  // Previously fell back to full pool when only 1 passed, which let the
  // comparator (anti-stickiness) override the weekly cap — causing users
  // with 0 weekly duties to be skipped entirely.
  return filtered.length >= 1 ? filtered : pool;
};
