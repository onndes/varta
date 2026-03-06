// src/services/autoScheduler/helpers.ts
// Константи, допоміжні функції дат, метрики бійця та обмеження

import type { User, ScheduleEntry, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { getUserFairnessFrom } from '../../utils/fairness';
import { getUserAvailabilityStatus, isUserAvailable } from '../userService';
import { toAssignedUserIds, isHistoryType } from '../../utils/assignment';
import { countUserDaysOfWeek } from '../scheduleService';

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
