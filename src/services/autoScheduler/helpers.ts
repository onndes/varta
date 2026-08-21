// src/services/autoScheduler/helpers.ts
// Константи, допоміжні функції дат, метрики бійця та обмеження

import type { User, ScheduleEntry, AutoScheduleOptions, DayWeights } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';

import { getUserAvailabilityStatus, isUserAvailable, getBirthdayBlockConfig } from '../userService';
import {
  toAssignedUserIds,
  isAssignedInEntry,
  getAvailabilityOverrideUserIds,
} from '../../utils/assignment';
import { countUserDaysOfWeek, countUserAssignments } from '../scheduleService';
import { getUserStatusPeriods } from '../../utils/userStatus';
import { getBlockedDaysPeriods, getEffectiveBlockedDows } from '../../utils/userBlockedDays';
import { isExcludedFromAutoOnDate } from '../../utils/userExcludeFromAuto';
import { applyStatsCutoffs, clampToStatsCutoff } from '../../utils/statsReset';

// ─── Константи ──────────────────────────────────────────────────────

/** Мілісекунд у добі */
export const MS_PER_DAY = 86_400_000;

/** Мінімум бійців, при якому вмикається обмеження «1 наряд на тиждень» */
export const MIN_USERS_FOR_WEEKLY_LIMIT = 7;

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

/** Скільки бійців доступно саме на конкретну дату */
export const countEligibleUsersForDate = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): number =>
  users.filter((u) => {
    if (!u.id || !u.isActive || u.isExtra || u.excludeFromAuto) return false;
    if (isExcludedFromAutoOnDate(u, dateStr)) return false;
    return isUserAvailable(u, dateStr, schedule);
  }).length;

/** Скільки бійців доступно хоча б раз протягом тижня, що містить dateStr */
export const getEligibleUsersForWeek = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): User[] => {
  const week = getWeekWindow(dateStr);
  const weekDates = getDatesInRange(week.from, week.to);
  return users.filter((u) => {
    if (!u.id || !u.isActive || u.isExtra || u.excludeFromAuto) return false;
    return weekDates.some(
      (d) => !isExcludedFromAutoOnDate(u, d) && isUserAvailable(u, d, schedule)
    );
  });
};

export const countEligibleUsersForWeek = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): number => getEligibleUsersForWeek(users, schedule, dateStr).length;

// ─── Допоміжні функції: метрики бійця ──────────────────────────────

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

/** Дата останнього наряду бійця до dateStr (або null якщо не було) */
export const getLastAssignmentDate = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dateStr: string
): string | null => {
  const previousDates = Object.values(schedule)
    .filter((s) => s.date < dateStr && toAssignedUserIds(s.userId).includes(userId))
    .map((s) => s.date)
    .sort();
  return previousDates.length > 0 ? previousDates[previousDates.length - 1] : null;
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

// ─── Load Rate & Fairness ───────────────────────────────────────────

/**
 * Count unavailable days (VACATION, SICK, TRIP, ABSENT periods) for a user
 * in the range [fromDate, toDate]. Used to subtract from daysActive for
 * accurate Load Rate normalization (anti-catch-up).
 */
export const countUnavailableDaysInRange = (
  user: User,
  fromDate: string,
  toDate: string
): number => {
  // Fast path: nothing can make any day unavailable for this user.
  // Blocked-day periods and birthday blocking must count as unavailable too —
  // otherwise users with only blocked days (no status periods) would be
  // treated as "behind" on load after their blocked stretches.
  const periods = getUserStatusPeriods(user);
  const blockedPeriods = getBlockedDaysPeriods(user);
  const birthdayBlocking = !!user.birthday && getBirthdayBlockConfig().enabled;
  if (periods.length === 0 && blockedPeriods.length === 0 && !birthdayBlocking) return 0;

  let count = 0;
  const cursor = new Date(fromDate);
  const end = new Date(toDate);
  while (cursor <= end) {
    const iso = toLocalISO(cursor);
    if (getUserAvailabilityStatus(user, iso) !== 'AVAILABLE') {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

/**
 * Number of *available* days a user has been "in the system" up to `dateStr`.
 * Uses `dateAddedToAuto` if set, otherwise earliest history/schedule date.
 * **Subtracts** days in VACATION / SICK / TRIP / ABSENT / BLOCKED periods
 * so that a user returning from a 14-day vacation is NOT "behind" by 14 days.
 * Returns at least 1 to avoid division by zero.
 *
 * When `useFirstDutyDate` is true (default), the earliest assignment date
 * takes precedence over `dateAddedToAuto` — this ensures fairness tracking
 * starts from actual participation rather than the date the user was added.
 */
export const computeDaysActive = (
  user: User,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  useFirstDutyDate = true
): number => {
  // Find earliest assignment in schedule
  let firstDuty: string | undefined;
  if (user.id) {
    for (const entry of Object.values(schedule)) {
      if (toAssignedUserIds(entry.userId).includes(user.id)) {
        if (!firstDuty || entry.date < firstDuty) firstDuty = entry.date;
      }
    }
  }

  let from: string | undefined;
  if (useFirstDutyDate) {
    from = firstDuty || user.dateAddedToAuto;
  } else {
    from = user.dateAddedToAuto || firstDuty;
  }

  from = clampToStatsCutoff(user, from);

  if (!from) from = dateStr; // brand-new user with no history
  if (from > dateStr) return 1;
  const totalDays = Math.floor(
    (new Date(dateStr).getTime() - new Date(from).getTime()) / MS_PER_DAY
  );
  const unavailable = countUnavailableDaysInRange(user, from, dateStr);
  return Math.max(1, totalDays - unavailable);
};

/**
 * Load Rate (intensity) = totalAssignments / daysActive.
 * Normalises workload so newcomers are compared fairly with veterans.
 */
export const computeUserLoadRate = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dateStr: string,
  users: User[],
  useFirstDutyDate = true
): number => {
  const user = users.find((u) => u.id === userId);
  if (!user) return 0;
  const total = countUserAssignments(userId, schedule);
  const daysActive = computeDaysActive(user, dateStr, schedule, useFirstDutyDate);
  return total / daysActive;
};

/**
 * Fairness Index for a single user (0..1, where 1 = perfectly fair).
 *
 * Compares the user's Load Rate to the group average Rate.
 * Accounts for individual blocked days / unavailability by normalising
 * against the user's available-day ratio.
 *
 * Formula:
 *   groupAvgRate   = Σ(Rate_u) / N
 *   deviation       = |userRate − groupAvgRate|
 *   fairnessIndex  = max(0, 1 − deviation / max(groupAvgRate, ε))
 */
export const calculateUserFairnessIndex = (
  userId: number,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  _dayWeights: DayWeights,
  dateStr: string
): number => {
  const participants = users.filter((u) => u.id && u.isActive && !u.isExtra && !u.excludeFromAuto);
  if (participants.length === 0) return 1;

  const rates = participants.map((u) => computeUserLoadRate(u.id!, schedule, dateStr, users));
  const groupAvg = rates.reduce((a, b) => a + b, 0) / rates.length;

  const userRate = computeUserLoadRate(userId, schedule, dateStr, users);
  const deviation = Math.abs(userRate - groupAvg);
  const epsilon = 1e-9;
  return Math.max(0, 1 - deviation / Math.max(groupAvg, epsilon));
};

// ─── Force-override fairness accounting ─────────────────────────────

/** Force-overridden "date:userId" pairs in a schedule (type 'force' or marked override). */
const collectForceOverridePairs = (entry: ScheduleEntry): number[] =>
  entry.type === 'force' ? toAssignedUserIds(entry.userId) : getAvailabilityOverrideUserIds(entry);

/**
 * 'neutral' accounting: returns the set of "date:userId" keys that must be
 * invisible to fairness math (counts, load rate, objective). Hard constraints
 * (rest days, incompatible pairs, weekly caps) still see these entries.
 * Returns undefined in 'normal' / 'bonus' modes — everything counts.
 */
export const buildFairnessExclusionSet = (
  schedule: Record<string, ScheduleEntry>,
  options: AutoScheduleOptions
): Set<string> | undefined => {
  if ((options.forceOverrideAccounting ?? 'normal') !== 'neutral') return undefined;
  const set = new Set<string>();
  for (const entry of Object.values(schedule)) {
    for (const uid of collectForceOverridePairs(entry)) {
      set.add(`${entry.date}:${uid}`);
    }
  }
  return set.size > 0 ? set : undefined;
};

/**
 * Fairness view of the schedule for comparator counts: with 'neutral'
 * accounting, force-override assignments are removed from the copy.
 * Returns the original object unchanged in 'normal' / 'bonus' modes.
 */
export const applyForceOverrideAccounting = (
  schedule: Record<string, ScheduleEntry>,
  options: AutoScheduleOptions,
  users?: User[]
): Record<string, ScheduleEntry> => {
  // Наряди, приховані «обнуленням статистики», не беруть участі в обліку.
  const base = users ? applyStatsCutoffs(schedule, users) : schedule;
  if ((options.forceOverrideAccounting ?? 'normal') !== 'neutral') return base;
  const result: Record<string, ScheduleEntry> = {};
  for (const [date, entry] of Object.entries(base)) {
    const excluded = collectForceOverridePairs(entry);
    if (excluded.length === 0) {
      result[date] = entry;
      continue;
    }
    const remaining = toAssignedUserIds(entry.userId).filter((id) => !excluded.includes(id));
    if (remaining.length === 0) continue;
    result[date] = { ...entry, userId: remaining.length === 1 ? remaining[0] : remaining };
  }
  return result;
};

// ─── Global Objective Helpers ───────────────────────────────────────

/**
 * Combined global objective for swap optimization (OPTIMISED single-pass).
 *
 * Gathers all metrics in ONE iteration over schedule entries,
 * then computes the weighted sum.
 *
 * Weights:
 *   W_SAME_DOW    =  50.0  (highest: avoid same DOW repeat week-over-week)
 *   W_SYSTEM_SSE  =   3.0  (cross-user DOW fairness)
 *   W_WITHIN_USER = 300.0  (per-user DOW spread, availability-normalised)
 *   W_LOAD_RANGE  =   1.0  (soft pressure toward equal workload)
 *   W_ZERO_GUARD  =  10.0  (multiplier; internal penalty already 5000+)
 *   W_TOTAL_SSE   = 100.0  (anti-concentration: prevents duty hoarding)
 *   W_RATE_SSE    = 5000.0 (rate-normalised cross-user fairness)
 *
 * Lower Z → better schedule.
 */
export const computeGlobalObjective = (
  userIds: number[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  users?: User[],
  enableDroughtPenalty?: boolean,
  daysActiveCache?: Map<number, number>,
  fairnessExclusions?: Set<string>
): number => {
  const N = userIds.length;
  if (N === 0) return 0;

  // Pre-allocate per-user data
  const uidSet = new Set(userIds);
  const dowCountsMap = new Map<number, number[]>();
  const loadsMap = new Map<number, number>();
  const datesMap = new Map<number, string[]>();

  // User lookup + effective blocked DOWs (period-aware, ISO 1=Mon…7=Sun).
  // Uses blockedDaysPeriods (with legacy blockedDays fallback) evaluated
  // around today — the flat `blockedDays` field no longer exists after DB v12.
  const usersById = new Map<number, User>();
  if (users) {
    for (const u of users) if (u.id) usersById.set(u.id, u);
  }
  const todayIso = toLocalISO(new Date());
  const blockedDowsCache = new Map<number, number[]>();
  const getBlockedDows = (uid: number): number[] => {
    let cached = blockedDowsCache.get(uid);
    if (cached === undefined) {
      const u = usersById.get(uid);
      cached = u ? getEffectiveBlockedDows(u, todayIso) : [];
      blockedDowsCache.set(uid, cached);
    }
    return cached;
  };

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
      // 'neutral' force-override accounting: skip excluded date:user pairs.
      if (fairnessExclusions?.has(`${entry.date}:${id}`)) continue;
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

  // ── 3. Within-user DOW variance (availability-normalised) ──────────
  // Divides by number of AVAILABLE days of week, not always 7.
  // Prevents penalizing users who are blocked on certain weekdays
  // (e.g. a user available only Fri+Sat: pattern [0,0,0,0,3,3,0] is perfect
  // for them and must not be treated as high variance).
  let withinUserVar = 0;
  for (const uid of userIds) {
    const counts = dowCountsMap.get(uid)!;
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += counts[d];
    if (sum === 0) continue;

    // Count DOWs where user is not currently blocked.
    // Blocked DOWs use ISO numbering: 1=Mon … 6=Sat, 7=Sun (JS: 0=Sun).
    const blockedDows = getBlockedDows(uid);
    const activeDows = Math.max(1, 7 - blockedDows.length);

    const mean = sum / activeDows;
    for (let d = 0; d < 7; d++) {
      // Skip blocked DOWs — they contribute 0 by definition.
      const isoDow = d === 0 ? 7 : d;
      if (blockedDows.includes(isoDow)) continue;
      withinUserVar += (counts[d] - mean) ** 2;
    }
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

  // ── 4b. Total assignment SSE (cross-user total fairness) ──────────
  // Prevents optimizer from concentrating duties on one user to improve
  // their DOW variance while starving others.
  let totalAssignmentSSE = 0;
  {
    let sumTotal = 0;
    const totals: number[] = [];
    for (const uid of userIds) {
      let t = 0;
      const counts = dowCountsMap.get(uid)!;
      for (let d = 0; d < 7; d++) t += counts[d];
      totals.push(t);
      sumTotal += t;
    }
    const meanTotal = sumTotal / N;
    for (const t of totals) totalAssignmentSSE += (t - meanTotal) ** 2;
  }

  // ── 4c. Rate SSE (rate-normalised cross-user fairness) ────────────
  // Uses loadRate = totalAssignments / daysActive to compare users fairly
  // regardless of when they joined or how many days they were on leave.
  // Without this, users with different available-day counts can diverge
  // by 30%+ in rate even though their absolute counts look close.
  let rateSSE = 0;
  if (users && users.length > 0) {
    const rates: number[] = [];
    const todayStr = todayIso;
    for (const uid of userIds) {
      const user = usersById.get(uid);
      if (!user) continue;
      let total = 0;
      const counts = dowCountsMap.get(uid)!;
      for (let d = 0; d < 7; d++) total += counts[d];
      let daysActive: number;
      if (daysActiveCache) {
        if (daysActiveCache.has(uid)) {
          daysActive = daysActiveCache.get(uid)!;
        } else {
          daysActive = computeDaysActive(user, todayStr, schedule);
          daysActiveCache.set(uid, daysActive);
        }
      } else {
        daysActive = computeDaysActive(user, todayStr, schedule);
      }
      rates.push(total / daysActive);
    }
    if (rates.length > 0) {
      const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      for (const r of rates) rateSSE += (r - meanRate) ** 2;
    }
  }

  // ── 5. Zero-guard penalty (ABSOLUTE LAW) ──────────────────────────
  // Fires when a user's DOW spread exceeds the theoretical minimum.
  // With `total` duties and `activeDows` available DOWs, the best possible
  // spread is ceil(total/activeDows) - floor(total/activeDows) = 0 or 1.
  // Pattern [1,0,0,0,0,0,0] (total=1, spread=1) → unavoidable, NO penalty.
  // Pattern [1,0,0,0,1,2,1] (total=5, spread=2) → avoidable, PENALTY.
  // Only counts DOWs where the user is not permanently blocked.
  let zeroGuardPenalty = 0;
  for (const uid of userIds) {
    const counts = dowCountsMap.get(uid)!;
    const blockedDows = getBlockedDows(uid);

    let uMin = Infinity;
    let uMax = -Infinity;
    let total = 0;
    let activeDows = 0;
    for (let d = 0; d < 7; d++) {
      const isoDow = d === 0 ? 7 : d;
      if (blockedDows.includes(isoDow)) continue;
      activeDows++;
      total += counts[d];
      if (counts[d] < uMin) uMin = counts[d];
      if (counts[d] > uMax) uMax = counts[d];
    }
    if (activeDows === 0 || total === 0) continue;

    const idealSpread = total % activeDows === 0 ? 0 : 1;
    const actualSpread = uMax - uMin;
    if (actualSpread > idealSpread) {
      // Catastrophic: 5000 base + 2500 per each level of excess imbalance
      zeroGuardPenalty += 5000 + 2500 * (actualSpread - idealSpread);
    }
  }

  // ── 6. Weekly drought penalty ──────────────────────────────────────
  // Penalizes users whose last assignment is ≥1 full week before the
  // schedule horizon. Quadratic scaling: 1 week = 1×, 2 weeks = 4×.
  // Group-size scaling: full weight at N ≤ MIN_USERS (7), linearly
  // decays to 0 at N ≥ 2×MIN_USERS (14). Disabled for large groups
  // where missing weeks is statistically expected.
  let weeklyDroughtPenalty = 0;
  if (enableDroughtPenalty && N >= 2) {
    const droughtScale = Math.max(
      0,
      Math.min(1, (2 * MIN_USERS_FOR_WEEKLY_LIMIT - N) / MIN_USERS_FOR_WEEKLY_LIMIT)
    );
    if (droughtScale > 0) {
      // Find the latest date in the schedule
      let maxDateStr = '';
      for (const entry of Object.values(schedule)) {
        if (entry.date > maxDateStr) maxDateStr = entry.date;
      }
      if (maxDateStr) {
        const maxTime = new Date(maxDateStr).getTime();
        for (const uid of userIds) {
          const dates = datesMap.get(uid)!;
          if (dates.length === 0) continue; // new user, no assignments yet
          // Find user's last assignment date
          let lastDate = '';
          for (const d of dates) {
            if (d > lastDate) lastDate = d;
          }
          const gapDays = Math.round((maxTime - new Date(lastDate).getTime()) / MS_PER_DAY);
          const gapWeeks = Math.floor(gapDays / 7);
          if (gapWeeks >= 1) {
            // Cap the per-user contribution so W_DROUGHT × value stays below
            // the zero-guard minimum (50,000): drought pressure must never
            // outbid per-user DOW fairness (4.8 × 10,000 = 48,000 < 50,000).
            weeklyDroughtPenalty += Math.min(4.8, gapWeeks * gapWeeks * droughtScale);
          }
        }
      }
    }
  }

  // ── Weighted combination ───────────────────────────────────────────
  const W_SAME_DOW = 50.0; // Highest: avoid same DOW repeat week-over-week
  const W_SYSTEM_SSE = 3.0; // Cross-user DOW fairness
  const W_WITHIN_USER = 300.0; // Per-user DOW spread (availability-normalised)
  const W_LOAD_RANGE = 1.0; // Soft pressure toward equal workload
  const W_ZERO_GUARD = 10.0; // Multiplier — internal penalty already 5000+
  const W_TOTAL_SSE = 100.0; // Anti-concentration: prevents duty hoarding
  const W_RATE_SSE = 5000.0; // Rate-normalised fairness across users
  const W_DROUGHT = 10_000.0; // Weekly drought: penalises consecutive weeks off (capped below zero-guard 50k)

  return (
    W_SAME_DOW * sameDowPenalty +
    W_SYSTEM_SSE * systemSSE +
    W_WITHIN_USER * withinUserVar +
    W_LOAD_RANGE * loadRange +
    W_ZERO_GUARD * zeroGuardPenalty +
    W_TOTAL_SSE * totalAssignmentSSE +
    W_RATE_SSE * rateSSE +
    W_DROUGHT * weeklyDroughtPenalty
  );
};

/**
 * User's max DOW count across available (non-blocked) days.
 * Blocked DOWs are permanently 0 and must not skew the result.
 */
export const getUserMaxDowCount = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  blockedDays?: number[]
): number => {
  const counts = countUserDaysOfWeek(userId, schedule);
  const vals: number[] = [];
  for (let d = 0; d < 7; d++) {
    if (blockedDays && blockedDays.length > 0) {
      const isoDow = d === 0 ? 7 : d;
      if (blockedDays.includes(isoDow)) continue;
    }
    vals.push(counts[d] || 0);
  }
  return vals.length > 0 ? Math.max(...vals) : 0;
};

/**
 * User's min DOW count across available (non-blocked) days.
 * Blocked DOWs are permanently 0 and must not skew the result.
 */
export const getUserMinDowCount = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  blockedDays?: number[]
): number => {
  const counts = countUserDaysOfWeek(userId, schedule);
  const vals: number[] = [];
  for (let d = 0; d < 7; d++) {
    if (blockedDays && blockedDays.length > 0) {
      const isoDow = d === 0 ? 7 : d;
      if (blockedDays.includes(isoDow)) continue;
    }
    vals.push(counts[d] || 0);
  }
  return vals.length > 0 ? Math.min(...vals) : 0;
};
