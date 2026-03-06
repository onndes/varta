// src/services/autoScheduler/helpers.ts
// Константи, допоміжні функції дат, метрики бійця та обмеження

import type { User, ScheduleEntry, AutoScheduleOptions, DayWeights } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { getUserFairnessFrom } from '../../utils/fairness';
import { getUserAvailabilityStatus, isUserAvailable } from '../userService';
import { toAssignedUserIds, isAssignedInEntry, isHistoryType } from '../../utils/assignment';
import { countUserDaysOfWeek, calculateUserLoad } from '../scheduleService';

// ─── Константи ──────────────────────────────────────────────────────

/** Мілісекунд у добі */
export const MS_PER_DAY = 86_400_000;

/** Мінімум бійців, при якому вмикається обмеження «1 наряд на тиждень» */
export const MIN_USERS_FOR_WEEKLY_LIMIT = 7;

/** Максимум нарядів на тиждень для боржників */
export const MAX_DEBT_WEEKLY_CAP = 4;

/** Максимальна кількість ітерацій пост-балансування */
export const MAX_REBALANCE_ITERATIONS = 100;

/** Поріг різниці навантаження, нижче якого вважаємо збалансованим */
export const REBALANCE_THRESHOLD = 0.03;

/** Точність порівняння дробових чисел */
export const FLOAT_EPSILON = 1e-9;

// ─── Допоміжні функції: дати ─────────────────────────────────────────

/** Перша дата в графіку, або fallback якщо графік порожній */
export const getScheduleStart = (
  schedule: Record<string, ScheduleEntry>,
  fallbackDate: string
): string => {
  const dates = Object.keys(schedule).sort();
  return dates[0] || fallbackDate;
};

/** Найраніша історична/імпортована дата для кожного бійця */
export const buildEarliestHistoryMap = (
  schedule: Record<string, ScheduleEntry>
): Map<number, string> => {
  const map = new Map<number, string>();
  for (const entry of Object.values(schedule)) {
    if (!isHistoryType(entry)) continue;
    const ids = toAssignedUserIds(entry.userId);
    for (const id of ids) {
      const prev = map.get(id);
      if (!prev || entry.date < prev) {
        map.set(id, entry.date);
      }
    }
  }
  return map;
};

/** Попередня дата (YYYY-MM-DD) */
export const getPrevDateStr = (dateStr: string): string => {
  const prev = new Date(dateStr);
  prev.setDate(prev.getDate() - 1);
  return toLocalISO(prev);
};

/** Дата мінус N днів */
export const getDateMinusDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return toLocalISO(d);
};

/** Понеділок–неділя тижня, до якого належить дата */
export const getWeekWindow = (dateStr: string): { from: string; to: string } => {
  const d = new Date(dateStr);
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toLocalISO(monday), to: toLocalISO(sunday) };
};

/** Список дат в діапазоні [від, до] */
export const getDatesInRange = (fromDate: string, toDate: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(fromDate);
  const end = new Date(toDate);
  while (cursor <= end) {
    dates.push(toLocalISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

// ─── Допоміжні функції: обмеження ──────────────────────────────────

/** Чи досить бійців для обмеження «1 наряд на тиждень» */
export const shouldEnforceOneDutyPerWeek = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  weekDates: string[]
): boolean => {
  const eligibleThisWeek = users.filter((u) => {
    if (!u.id || !u.isActive || u.isExtra || u.excludeFromAuto) return false;
    return weekDates.some((d) => isUserAvailable(u, d, schedule));
  });
  return eligibleThisWeek.length >= MIN_USERS_FOR_WEEKLY_LIMIT;
};

/** Скільки бійців доступно саме на конкретну дату */
export const countEligibleUsersForDate = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): number =>
  users.filter((u) => {
    if (!u.id || !u.isActive || u.isExtra || u.excludeFromAuto) return false;
    return isUserAvailable(u, dateStr, schedule);
  }).length;

/** Чи має боєць неоплачений борг (карма або owedDays) */
export const hasDebtBacklog = (user: User): boolean => {
  const hasOwedDays = Object.values(user.owedDays || {}).some((v) => v > 0);
  return (user.debt || 0) < 0 || hasOwedDays;
};

/** Максимум нарядів на тиждень: боржники можуть більше */
export const getWeeklyAssignmentCap = (user: User, options: AutoScheduleOptions): number => {
  if (options.allowDebtUsersExtraWeeklyAssignments && hasDebtBacklog(user)) {
    return Math.min(MAX_DEBT_WEEKLY_CAP, Math.max(1, options.debtUsersWeeklyLimit || 1));
  }
  return 1;
};

// ─── Допоміжні функції: метрики бійця ──────────────────────────────

/**
 * Очки пріоритету для повернення боргу.
 * Якщо боєць винен саме цей день тижня — повертає очки за повернення.
 */
export const getDebtRepaymentScore = (user: User, dayIdx: number, dayWeight: number): number => {
  const debtAbs = Math.abs(Math.min(0, user.debt || 0));
  if (debtAbs <= 0) return 0;

  const owedToday = (user.owedDays && user.owedDays[dayIdx]) || 0;
  if (owedToday > 0) {
    return Math.min(debtAbs, owedToday * dayWeight);
  }
  return 0;
};

/**
 * Рішення агресивного балансування.
 * Якщо різниця навантаження > threshold — примусово переставляє.
 * Повертає 0 якщо немає підстав, інакше напрямок для сортування.
 */
export const getAggressiveBalanceDecision = (
  loadA: number,
  loadB: number,
  threshold: number
): number => {
  const gap = loadA - loadB;
  return Math.abs(gap) > threshold ? gap : 0;
};

/** Скільки нарядів у бійця в діапазоні дат */
export const countUserAssignmentsInRange = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  fromDate: string,
  toDate: string
): number => {
  return Object.values(schedule).filter((s) => {
    if (s.date < fromDate || s.date > toDate) return false;
    return toAssignedUserIds(s.userId).includes(userId);
  }).length;
};

/** Скільки днів минуло з останнього наряду (чим більше — тим вища черга) */
export const daysSinceLastAssignment = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): number => {
  const previousDates = Object.values(schedule)
    .filter((s) => s.date < dateStr && toAssignedUserIds(s.userId).includes(userId))
    .map((s) => s.date)
    .sort();
  if (previousDates.length === 0) return Number.POSITIVE_INFINITY;
  const last = previousDates[previousDates.length - 1];
  const diff = new Date(dateStr).getTime() - new Date(last).getTime();
  return Math.floor(diff / MS_PER_DAY);
};

/**
 * Чи боєць гарантовано недоступний на дату
 * (відпустка / відрядження / лікування / неактивний)
 */
export const isHardUnavailable = (user: User, dateStr: string): boolean => {
  return getUserAvailabilityStatus(user, dateStr) !== 'AVAILABLE';
};

/**
 * Підрахунок доступних днів бійця в діапазоні дат.
 * Якщо dayIdx задано — рахує тільки дні цього дня тижня.
 */
export const countAvailableDaysInWindow = (
  user: User,
  fromDate: string,
  toDate: string,
  dayIdx?: number
): number => {
  if (fromDate > toDate) return 0;
  const cursor = new Date(fromDate);
  const end = new Date(toDate);
  let count = 0;

  while (cursor <= end) {
    const iso = toLocalISO(cursor);
    const matchesDay = dayIdx === undefined || cursor.getDay() === dayIdx;
    if (matchesDay && !isHardUnavailable(user, iso)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/** Порівняння дробових чисел з точністю epsilon */
export const floatEq = (a: number, b: number): boolean => Math.abs(a - b) < FLOAT_EPSILON;

/**
 * Кількість днів, що минуло з останнього разу, коли боєць чергував
 * у той самий день тижня, що і `dateStr`.
 * Повертає Infinity, якщо такого чергування не було.
 */
export const daysSinceLastSameDowAssignment = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): number => {
  const targetDow = new Date(dateStr).getDay();
  let minDays = Infinity;
  for (const [d, entry] of Object.entries(schedule)) {
    if (d >= dateStr) continue;
    const ids = toAssignedUserIds(entry.userId);
    if (!ids.includes(userId)) continue;
    const entryDow = new Date(d).getDay();
    if (entryDow !== targetDow) continue;
    const days = (new Date(dateStr).getTime() - new Date(d).getTime()) / MS_PER_DAY;
    if (days < minDays) minDays = days;
  }
  return minDays;
};

/**
 * Заборона «той самий день тижня два тижні поспіль»:
 * якщо боєць чергував рівно 7 днів тому, він недоступний.
 */
export const didUserServeSameWeekdayLastWeek = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const prevWeekDate = getDateMinusDays(dateStr, 7);
  return isAssignedInEntry(schedule[prevWeekDate], userId);
};

/** Останній день тижня (0..6) попереднього наряду користувача */
export const getLastAssignedDayIdx = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  beforeDate: string
): number | null => {
  let lastDate: string | null = null;
  for (const [date, entry] of Object.entries(schedule)) {
    if (date >= beforeDate) continue;
    if (!isAssignedInEntry(entry, userId)) continue;
    if (!lastDate || date > lastDate) lastDate = date;
  }
  return lastDate ? new Date(lastDate).getDay() : null;
};

/**
 * Цільова функція fairness для конкретного дня тижня:
 * сума квадратів відхилень від середнього після гіпотетичного призначення candidateId.
 * Менше значення = кращий баланс.
 */
export const computeDowFairnessObjective = (
  dayIdx: number,
  userIds: number[],
  schedule: Record<string, ScheduleEntry>,
  candidateId: number
): number => {
  if (userIds.length === 0) return 0;

  const counts = userIds.map((id) => countUserDaysOfWeek(id, schedule)[dayIdx] || 0);
  const sum = counts.reduce((acc, v) => acc + v, 0);
  const n = userIds.length;
  const mean = (sum + 1) / n;

  let sse = 0;
  for (let i = 0; i < userIds.length; i++) {
    const assigned = userIds[i] === candidateId ? 1 : 0;
    const diff = counts[i] + assigned - mean;
    sse += diff * diff;
  }
  return sse;
};

/**
 * Особистий дефіцит дня тижня для конкретного бійця.
 *
 * Показує наскільки dayIdx «недобраний» у цієї людини відносно
 * середнього по її інших доступних днях тижня.
 *
 * Формула:
 *   normalizedCount(d) = assignments_on_d / max(1, availableDays_of_d)
 *   avgOtherDays = середнє normalizedCount по всіх днях тижня КРІМ dayIdx,
 *                  де availableDays > 0
 *   deficit = avgOtherDays - normalizedCount(dayIdx)
 *
 * Чим вище значення — тим більше «недобраний» цей день у людини.
 * Від'ємне значення = день перебраний.
 *
 * Граничні випадки:
 * - Якщо доступний лише 1 день тижня — повертає 0
 * - Якщо availableDays для dayIdx = 0 — повертає 0
 */
export const getPersonalDowDeficit = (
  user: User,
  dayIdx: number,
  schedule: Record<string, ScheduleEntry>,
  fromDate: string,
  toDate: string
): number => {
  const targetAvail = countAvailableDaysInWindow(user, fromDate, toDate, dayIdx);
  if (targetAvail === 0 || !user.id) return 0;

  const dowCounts = countUserDaysOfWeek(user.id, schedule, fromDate);
  const targetCount = dowCounts[dayIdx] || 0;
  const targetRate = targetCount / targetAvail;

  let otherSum = 0;
  let otherDays = 0;
  for (let d = 0; d < 7; d++) {
    if (d === dayIdx) continue;
    const avail = countAvailableDaysInWindow(user, fromDate, toDate, d);
    if (avail === 0) continue;
    const count = dowCounts[d] || 0;
    otherSum += count / avail;
    otherDays++;
  }

  if (otherDays === 0) return 0;

  const avgOther = otherSum / otherDays;
  return avgOther - targetRate;
};

/** Базова дата обліку для бійця (кожен рахується від своєї дати вступу) */
export const getUserCompareFrom = (
  user: User,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  earliestHistoryByUser?: Map<number, string>
): string => {
  let from = getUserFairnessFrom(user, dateStr) || getScheduleStart(schedule, dateStr);
  if (user.id && earliestHistoryByUser) {
    const historyFrom = earliestHistoryByUser.get(user.id);
    if (historyFrom && historyFrom < from) from = historyFrom;
  }
  return from;
};

// ─── Global Objective Helpers ───────────────────────────────────────

/**
 * Count back-to-back same-DOW assignments (exactly 7 days apart) across users.
 * Each such pair adds 1 to the penalty total.
 */
export const computeSameDowConsecutivePenalty = (
  userIds: number[],
  schedule: Record<string, ScheduleEntry>
): number => {
  let penalty = 0;
  for (const uid of userIds) {
    // Gather all assignment dates for this user, sorted
    const dates: string[] = [];
    for (const [d, entry] of Object.entries(schedule)) {
      if (toAssignedUserIds(entry.userId).includes(uid)) dates.push(d);
    }
    dates.sort();

    // For each pair of dates: if same DOW and exactly 7 days apart → penalty
    for (let i = 0; i < dates.length; i++) {
      const d1 = new Date(dates[i]);
      const dow1 = d1.getDay();
      for (let j = i + 1; j < dates.length; j++) {
        const d2 = new Date(dates[j]);
        const gap = (d2.getTime() - d1.getTime()) / MS_PER_DAY;
        if (gap > 7) break; // dates sorted, no point checking further
        if (gap === 7 && d2.getDay() === dow1) {
          penalty += 1;
        }
      }
    }
  }
  return penalty;
};

/**
 * Load range: max(totalPoints) − min(totalPoints) across users.
 * A lower value means more balanced workload.
 */
export const computeLoadRange = (
  userIds: number[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): number => {
  if (userIds.length === 0) return 0;
  const loads = userIds.map((uid) => calculateUserLoad(uid, schedule, dayWeights));
  return Math.max(...loads) - Math.min(...loads);
};

/**
 * Within-user DOW variance: measures how unevenly each user's duties
 * are spread across days of the week.
 *
 * ∑_u  ∑_d  (count_{u,d} − mean_u)²
 *
 * A user with [0,2,0,1,0,0,0] has high variance → bad DOW diversity.
 * A user with [1,1,1,1,1,1,1] has 0 variance → perfect.
 */
export const computeWithinUserDowVariance = (
  userIds: number[],
  schedule: Record<string, ScheduleEntry>
): number => {
  let total = 0;
  for (const uid of userIds) {
    const counts = countUserDaysOfWeek(uid, schedule);
    const vals = Object.values(counts);
    const sum = vals.reduce((a, b) => a + b, 0);
    if (sum === 0) continue;
    const mean = sum / 7;
    total += vals.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  }
  return total;
};

/**
 * Combined global objective for swap optimization (OPTIMISED single-pass).
 *
 * Gathers all metrics in ONE iteration over schedule entries,
 * then computes the weighted sum.
 *
 * Weights:
 *   W_SAME_DOW = 50   (highest: avoid back-to-back same DOW weeks)
 *   W_SYSTEM_SSE = 5   (cross-user DOW fairness)
 *   W_WITHIN_USER = 2  (within-user DOW diversity)
 *   W_LOAD_RANGE = 1   (workload balance)
 *
 * Lower Z → better schedule.
 */
export const computeGlobalObjective = (
  userIds: number[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): number => {
  const N = userIds.length;
  if (N === 0) return 0;

  // Pre-allocate per-user data
  const uidSet = new Set(userIds);
  const dowCountsMap = new Map<number, number[]>();
  const loadsMap = new Map<number, number>();
  const datesMap = new Map<number, string[]>();

  for (const uid of userIds) {
    dowCountsMap.set(uid, [0, 0, 0, 0, 0, 0, 0]);
    loadsMap.set(uid, 0);
    datesMap.set(uid, []);
  }

  // DOW cache by date string to avoid repeated Date construction
  const dowCache = new Map<string, number>();
  const getDow = (dateStr: string): number => {
    let d = dowCache.get(dateStr);
    if (d === undefined) {
      d = new Date(dateStr).getDay();
      dowCache.set(dateStr, d);
    }
    return d;
  };

  // ── Single pass over schedule ──────────────────────────────────────
  for (const entry of Object.values(schedule)) {
    const ids = toAssignedUserIds(entry.userId);
    if (ids.length === 0) continue;
    const dow = getDow(entry.date);
    const weight = dayWeights[dow] || 1;
    for (const id of ids) {
      if (!uidSet.has(id)) continue;
      dowCountsMap.get(id)![dow]++;
      loadsMap.set(id, loadsMap.get(id)! + weight);
      datesMap.get(id)!.push(entry.date);
    }
  }

  // ── 1. System-wide DOW SSE ─────────────────────────────────────────
  let systemSSE = 0;
  for (let d = 0; d < 7; d++) {
    let sum = 0;
    const vals: number[] = [];
    for (const uid of userIds) {
      const v = dowCountsMap.get(uid)![d];
      vals.push(v);
      sum += v;
    }
    const mean = sum / N;
    for (const v of vals) systemSSE += (v - mean) ** 2;
  }

  // ── 2. Same-DOW consecutive penalty ────────────────────────────────
  let sameDowPenalty = 0;
  for (const uid of userIds) {
    const dates = datesMap.get(uid)!;
    if (dates.length < 2) continue;
    dates.sort();
    for (let i = 0; i < dates.length; i++) {
      const dow1 = getDow(dates[i]);
      const t1 = new Date(dates[i]).getTime();
      for (let j = i + 1; j < dates.length; j++) {
        const gap = (new Date(dates[j]).getTime() - t1) / MS_PER_DAY;
        if (gap > 7) break;
        if (gap === 7 && getDow(dates[j]) === dow1) {
          sameDowPenalty++;
        }
      }
    }
  }

  // ── 3. Within-user DOW variance ────────────────────────────────────
  let withinUserVar = 0;
  for (const uid of userIds) {
    const counts = dowCountsMap.get(uid)!;
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += counts[d];
    if (sum === 0) continue;
    const mean = sum / 7;
    for (let d = 0; d < 7; d++) withinUserVar += (counts[d] - mean) ** 2;
  }

  // ── 4. Load range ──────────────────────────────────────────────────
  let minLoad = Infinity;
  let maxLoad = -Infinity;
  for (const uid of userIds) {
    const l = loadsMap.get(uid)!;
    if (l < minLoad) minLoad = l;
    if (l > maxLoad) maxLoad = l;
  }
  const loadRange = maxLoad - minLoad;

  // ── Weighted combination ───────────────────────────────────────────
  const W_SAME_DOW = 50.0;
  const W_SYSTEM_SSE = 5.0;
  const W_WITHIN_USER = 2.0;
  const W_LOAD_RANGE = 1.0;

  return (
    W_SAME_DOW * sameDowPenalty +
    W_SYSTEM_SSE * systemSSE +
    W_WITHIN_USER * withinUserVar +
    W_LOAD_RANGE * loadRange
  );
};

/**
 * User's max DOW count across all 7 days.
 */
export const getUserMaxDowCount = (
  userId: number,
  schedule: Record<string, ScheduleEntry>
): number => {
  const counts = countUserDaysOfWeek(userId, schedule);
  return Math.max(...Object.values(counts));
};

/**
 * User's min DOW count across all 7 days.
 */
export const getUserMinDowCount = (
  userId: number,
  schedule: Record<string, ScheduleEntry>
): number => {
  const counts = countUserDaysOfWeek(userId, schedule);
  return Math.min(...Object.values(counts));
};
