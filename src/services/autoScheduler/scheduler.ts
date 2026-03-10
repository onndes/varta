// src/services/autoScheduler/scheduler.ts
// Constraint-optimization auto scheduler (fairness accounts + hard constraints).
// VARTA 2.0: Decision logging, adaptive iterations, strengthened zero-guard.

import type {
  User,
  ScheduleEntry,
  DayWeights,
  AutoScheduleOptions,
  DecisionLog,
  CandidateSnapshot,
} from '../../types';
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
  computeUserLoadRate,
  daysSinceLastAssignment,
  getLastAssignmentDate,
  daysSinceLastSameDowAssignment,
  computeDowFairnessObjective,
  countUserAssignmentsInRange,
  countUnavailableDaysInRange,
  getWeekWindow,
} from './helpers';
import { countUserDaysOfWeek } from '../scheduleService';
import {
  buildUserComparator,
  filterByIncompatiblePairs,
  filterByRestDays,
  filterBySameWeekdayLastWeek,
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
const isLookAheadSafe = (
  candidate: User,
  dateStr: string,
  futureDates: string[],
  users: User[],
  tempSchedule: Record<string, ScheduleEntry>,
  selectedIds: number[]
): boolean => {
  for (const futureDate of futureDates) {
    if (futureDate <= dateStr) continue;
    // Skip dates already filled.
    const existing = tempSchedule[futureDate];
    if (existing && toAssignedUserIds(existing.userId).length > 0) continue;

    // Count hard-eligible auto-participants for futureDate,
    // excluding the candidate AND users already selected for dateStr.
    let count = 0;
    for (const u of users) {
      if (!u.id || !isAutoParticipant(u)) continue;
      if (u.id === candidate.id) continue;
      if (selectedIds.includes(u.id)) continue;
      if (!isHardEligible(u, futureDate)) continue;
      count++;
      if (count >= 1) return true; // ≥1 is enough, no need to count all
    }
    // If we reach here, count === 0 → this futureDate would be starved.
    if (count === 0) return false;
  }
  return true;
};

// ─── Swap Optimizer ──────────────────────────────────────────────────────────

const BASE_SWAP_ITERATIONS = 1500;

/**
 * Adaptive iteration cap: scales with pool size and date count for stability.
 * Small pools (3 users) → fewer iterations needed for convergence.
 * Large pools (33 users) → more iterations to explore swap space.
 */
const getAdaptiveMaxIterations = (userCount: number, dateCount: number): number => {
  const base = Math.min(BASE_SWAP_ITERATIONS, Math.max(200, userCount * dateCount * 2));
  return Math.min(3000, base);
};

/**
 * Check if placing userId on dateStr would violate incompatible-pair constraints.
 * Looks at neighbors (day before / day after) and checks bidirectional incompatibility.
 */
const wouldViolateIncompatiblePairs = (
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
            !wouldViolateIncompatiblePairs(u.id, dateStr, tempSchedule, users)
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

// ─── Decision Log Builder (Info Button «i») ──────────────────────────────────

const DOW_NAMES: Record<number, string> = {
  0: 'неділю',
  1: 'понеділок',
  2: 'вівторок',
  3: 'середу',
  4: 'четвер',
  5: "п'ятницю",
  6: 'суботу',
};

const DOW_NAMES_NOMINATIVE: Record<number, string> = {
  0: 'неділя',
  1: 'понеділок',
  2: 'вівторок',
  3: 'середа',
  4: 'четвер',
  5: "п'ятниця",
  6: 'субота',
};

const DOW_SHORT: Record<number, string> = {
  0: 'Нд',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

/** Відмінювання слова «раз»: 1 раз, 2 рази, 5 разів. */
const timesWord = (n: number): string => {
  if (n === 1) return '1 раз';
  if (n >= 2 && n <= 4) return `${n} рази`;
  return `${n} разів`;
};

/** JS DOW → ISO DOW (1=Mon…7=Sun) for blockedDays check. */
const toIsoDow = (jsDow: number): number => (jsDow === 0 ? 7 : jsDow);

/** Check if a specific JS DOW is blocked for the user. */
const isDowBlockedForUser = (user: User, jsDow: number): boolean =>
  user.blockedDays?.includes(toIsoDow(jsDow)) ?? false;

// ─── Human-First reason code translator ──────────────────────────────────────
const REASON_UA: Record<string, string> = {
  // Hard constraints
  hard_inactive: 'Не в строю (неактивний)',
  hard_excluded: 'Виключений з автоматичного розподілу',
  hard_status_busy: 'Має заплановану відсутність або інше завдання',
  hard_day_blocked: 'Цей день тижня заблоковано у профілі',
  hard_rest_day: 'Відпочинок до/після відрядження чи відпустки',
  hard_incompatible_pair: 'Несумісна пара з сусіднім черговим',
  // Filters
  filter_rest_days: 'Потрібен відпочинок між нарядами (мін. перерва)',
  filter_weekly_cap: 'Досягнуто тижневий ліміт нарядів',
  filter_force_use_all: 'Є колеги, які ще не чергували цього тижня',
  outranked: 'Доступний, але має нижчий пріоритет',
  // Availability statuses
  STATUS_BUSY: 'Має заплановану відсутність або інше завдання (STATUS_BUSY)',
  DAY_BLOCKED: 'День тижня заблоковано у профілі (DAY_BLOCKED)',
  REST_DAY: 'Відпочинок після відрядження (rest_after)',
  PRE_STATUS_DAY: 'Відпочинок перед відрядженням/відпусткою (rest_before)',
  UNAVAILABLE: 'Недоступний (UNAVAILABLE)',
  AVAILABLE: 'Доступний',
};

/** Translate a technical reason code to a Ukrainian human-readable phrase. */
const translateReason = (reason: string): string => {
  // Try exact match first
  if (REASON_UA[reason]) return REASON_UA[reason];
  // Try compound format "hard_status_busy (STATUS_BUSY)"
  const match = reason.match(/^(\w+)\s*\((\w+)\)$/);
  if (match) {
    return REASON_UA[match[1]] || REASON_UA[match[2]] || reason;
  }
  return reason;
};

/**
 * Build a DecisionLog explaining why a specific user was assigned to a date.
 *
 * VARTA 2.0 Human-First: structured sections (✅ / ❌ / 📅 / ⚠️) + flat userText.
 */
const buildDecisionLog = (
  assignedId: number,
  dateStr: string,
  dayIdx: number,
  schedule: Record<string, ScheduleEntry>,
  allUsers: User[],
  population: number[],
  poolSizes: DecisionLog['debug']['poolSizes'],
  alternatives: CandidateSnapshot[],
  week: { from: string; to: string },
  allDates: string[]
): DecisionLog => {
  const dowCount = countUserDaysOfWeek(assignedId, schedule)[dayIdx] || 0;
  const dowSSE = computeDowFairnessObjective(dayIdx, population, schedule, assignedId);
  const sameDow = daysSinceLastSameDowAssignment(assignedId, schedule, dateStr);
  const sameDowPenalty = sameDow <= 7 ? 100 : sameDow <= 14 ? 25 : sameDow <= 21 ? 6.25 : 0;
  const loadRate = computeUserLoadRate(assignedId, schedule, dateStr, allUsers);
  const waitDays = daysSinceLastAssignment(assignedId, schedule, dateStr);
  const weeklyCount = countUserAssignmentsInRange(assignedId, schedule, week.from, week.to);

  // Group averages
  const rates = allUsers.map((u) => computeUserLoadRate(u.id!, schedule, dateStr, allUsers));
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const dowCounts = allUsers.map((u) => countUserDaysOfWeek(u.id!, schedule)[dayIdx] || 0);
  const avgDow = dowCounts.length > 0 ? dowCounts.reduce((a, b) => a + b, 0) / dowCounts.length : 0;

  // Winning criterion
  let winningCriterion = 'dowCount';
  if (alternatives.length > 0) {
    const top = alternatives.find((a) => a.rejectPhase === 'comparator');
    if (top?.metrics) {
      if (dowCount < top.metrics.dowCount) winningCriterion = 'dowCount';
      else if (sameDowPenalty < top.metrics.sameDowPenalty) winningCriterion = 'sameDowPenalty';
      else if (loadRate < top.metrics.loadRate) winningCriterion = 'loadRate';
      else if (waitDays > top.metrics.waitDays) winningCriterion = 'waitDays';
    }
  }

  const dowName = DOW_NAMES[dayIdx] || `день ${dayIdx}`;
  const dowNom = DOW_NAMES_NOMINATIVE[dayIdx] || `день ${dayIdx}`;
  const sections: import('../../types').DecisionLogSection[] = [];
  const user = allUsers.find((u) => u.id === assignedId);

  // Full per-DOW counts for this user
  const userAllDowCounts = countUserDaysOfWeek(assignedId, schedule);

  // ─── 📋 Section: Why you? ──────────────────────────────────────────
  const whyYou: string[] = [];

  if (dowCount === 0) {
    whyYou.push(
      `У вас ще жодного чергування у ${dowName}, тоді як в середньому по групі — ` +
        `${avgDow.toFixed(1)}. Тому ваша черга прийшла.`
    );
  } else if (dowCount <= avgDow) {
    whyYou.push(
      `У вас лише ${timesWord(dowCount)} у ${dowName} — це менше або на рівні ` +
        `середнього по групі (${avgDow.toFixed(1)}).`
    );
  } else {
    whyYou.push(
      `У вас ${timesWord(dowCount)} у ${dowName} (середнє по групі — ` +
        `${avgDow.toFixed(1)}). Серед доступних колег саме ви мали найкращий загальний баланс.`
    );
  }

  const ratio = avgRate > 0 ? loadRate / avgRate : 1;
  if (ratio < 0.7) {
    whyYou.push(
      `Ви чергуєте значно рідше за середнє по групі — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 0.9) {
    whyYou.push(
      `Ви чергуєте трохи рідше за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 1.1) {
    whyYou.push(
      `Навантаження приблизно як у всіх — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 1.3) {
    whyYou.push(
      `Навантаження трохи вище за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}), ` +
        `але серед доступних кандидатів саме ви мали найкращий баланс днів тижня.`
    );
  } else {
    whyYou.push(
      `Навантаження помітно вище за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}), ` +
        `але серед доступних колег тільки ви мали найкращий баланс.`
    );
  }

  const lastAssignDate = getLastAssignmentDate(assignedId, schedule, dateStr);
  const unavailInWait =
    lastAssignDate && user ? countUnavailableDaysInRange(user, lastAssignDate, dateStr) : 0;

  if (waitDays !== Infinity && waitDays > 0 && waitDays <= 3) {
    whyYou.push(
      `Останнє чергування було лише ${waitDays} дн. тому, але інші колеги ` +
        `або недоступні, або мають гірший баланс.`
    );
  } else if (waitDays !== Infinity && waitDays > 0) {
    if (unavailInWait > 0) {
      whyYou.push(
        `З моменту останнього наряду минуло ${waitDays} дн., з яких ${unavailInWait} — ` +
          `у відрядженні, відпустці або на лікарняному.`
      );
      if (unavailInWait > 3) {
        whyYou.push(
          `Щойно повернувся(-лась) з відрядження/відпустки (${unavailInWait} дн.) — ` +
            `навантаження враховане пропорційно до доступних днів.`
        );
      }
    } else {
      whyYou.push(
        `Ви відпочивали ${waitDays} дн. з моменту останнього чергування — достатня перерва.`
      );
    }
  } else if (waitDays === Infinity || waitDays < 0) {
    whyYou.push(`Ви ще не чергували в цьому періоді — тому маєте пріоритет.`);
  }

  if (weeklyCount <= 1) {
    whyYou.push(
      weeklyCount === 0
        ? `Цього тижня у вас ще жодного наряду — є запас.`
        : `Цього тижня у вас поки лише 1 наряд.`
    );
  }

  // Debt info
  if (user && (user.debt || 0) < 0) {
    const debtAbs = Math.abs(user.debt || 0);
    whyYou.push(
      `Також враховано борг з попередніх місяців — ${debtAbs} пропущених ` +
        `нарядів, які система поступово відпрацьовує.`
    );
  }

  sections.push({ icon: '📋', title: 'Чому саме ви?', items: whyYou });

  // ─── 👥 Section: Why not others? ──────────────────────────────────
  const whyNotOthers: string[] = [];
  const hardBlocked = alternatives.filter((a) => a.rejectPhase === 'hardConstraint');
  const softOutranked = alternatives.filter((a) => a.rejectPhase === 'comparator');
  const filterBlocked = alternatives.filter((a) => a.rejectPhase === 'filter');

  if (hardBlocked.length > 0) {
    whyNotOthers.push(`Недоступні на цю дату (${hardBlocked.length}):`);
    for (const alt of hardBlocked.slice(0, 5)) {
      whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
    }
    if (hardBlocked.length > 5) {
      whyNotOthers.push(`  …та ще ${hardBlocked.length - 5}`);
    }
  }

  if (filterBlocked.length > 0) {
    whyNotOthers.push(`Відфільтровані за правилами (${filterBlocked.length}):`);
    for (const alt of filterBlocked.slice(0, 3)) {
      whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
    }
  }

  if (softOutranked.length > 0) {
    whyNotOthers.push(`Доступні, але ви мали вищий пріоритет (${softOutranked.length}):`);
    for (const alt of softOutranked.slice(0, 4)) {
      const m = alt.metrics;
      if (m) {
        const cmpParts: string[] = [];
        if (m.dowCount > dowCount) {
          cmpParts.push(
            `уже чергував(-ла) у ${dowName} ${timesWord(m.dowCount)} (ви — ${dowCount})`
          );
        }
        if (m.loadRate > loadRate + 0.005 && cmpParts.length === 0) {
          cmpParts.push(`має вище загальне навантаження`);
        }
        if (m.waitDays < waitDays && cmpParts.length === 0) {
          cmpParts.push(`менший перепочинок між нарядами (${m.waitDays} дн.)`);
        }
        if (cmpParts.length === 0) {
          cmpParts.push(`має гірший сукупний баланс навантаження та днів тижня`);
        }
        whyNotOthers.push(`  ${alt.userName} — ${cmpParts.join('; ')}`);
      } else {
        whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
      }
    }
  }

  if (poolSizes.final === 1 && poolSizes.initial > 1) {
    whyNotOthers.push(
      `Увага: з ${poolSizes.initial} осіб після перевірки доступності ` +
        `залишився лише 1 кандидат — вибору фактично не було.`
    );
  }

  if (whyNotOthers.length > 0) {
    sections.push({ icon: '👥', title: 'Чому не хтось інший?', items: whyNotOthers });
  }

  // ─── 📅 Section: Why this day of week? ─────────────────────────────
  const whyThisDay: string[] = [];

  // Show DOW distribution (Mon-Sun)
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const distParts = dowOrder.map((d) => `${DOW_SHORT[d]}—${userAllDowCounts[d] || 0}`);
  whyThisDay.push(`Ваші чергування по днях: ${distParts.join(', ')}`);

  // Find zero-count DOWs (excluding the current DOW)
  const zeroDows = dowOrder.filter((d) => (userAllDowCounts[d] || 0) === 0 && d !== dayIdx);
  const zeroDowsBlocked = zeroDows.filter((d) => user && isDowBlockedForUser(user, d));
  const zeroDowsAvailable = zeroDows.filter((d) => !(user && isDowBlockedForUser(user, d)));

  if (dowCount === 0) {
    whyThisDay.push(
      `${dowNom} — оптимальний вибір: у вас тут ще жодного чергування. ` +
        `Система розподіляє навантаження рівномірно по всіх днях тижня.`
    );
  } else if (zeroDows.length === 0) {
    whyThisDay.push(
      `У вас є чергування в кожному дні тижня. ${dowNom} обрано, бо тут ` +
        `найменший дисбаланс серед усіх кандидатів.`
    );
  } else {
    if (zeroDowsBlocked.length > 0) {
      const blockedNames = zeroDowsBlocked.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
      whyThisDay.push(
        `${blockedNames} — заблоковано у вашому профілі, тому чергування ` +
          `в ці дні неможливе (0 чергувань у ці дні — не помилка).`
      );
    }
    if (zeroDowsAvailable.length > 0) {
      const avNames = zeroDowsAvailable.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
      whyThisDay.push(
        `Хоча у ${avNames} у вас ще 0 чергувань, на ці дати не було ` +
          `вільних слотів або вони будуть розподілені у наступних ітераціях розкладу.`
      );
    }
  }

  // Check unavailable DOWs in upcoming dates for context
  if (user) {
    const unavailableDows = new Map<number, string>();
    const futureDates = allDates.filter(
      (d) =>
        d >= dateStr &&
        d !== dateStr &&
        !toAssignedUserIds(schedule[d]?.userId).includes(assignedId)
    );
    for (const d of futureDates.slice(0, 28)) {
      const status = getUserAvailabilityStatus(user, d);
      if (status !== 'AVAILABLE' && !unavailableDows.has(new Date(d).getDay())) {
        unavailableDows.set(new Date(d).getDay(), translateReason(status));
      }
    }
    if (unavailableDows.size >= 3) {
      const dowList = [...unavailableDows.entries()]
        .map(([d, reason]) => `${DOW_NAMES_NOMINATIVE[d]} (${reason})`)
        .slice(0, 4)
        .join(', ');
      whyThisDay.push(
        `На інші дні тижня (${dowList}) ви часто недоступні, тому ` +
          `${dowNom.toLowerCase()} залишається одним з небагатьох варіантів.`
      );
    }
  }

  if (whyThisDay.length > 1) {
    sections.push({
      icon: '📅',
      title: `Чому саме ${dowNom.toLowerCase()}?`,
      items: whyThisDay,
    });
  }

  // ─── ⚠️ Section: Warnings ──────────────────────────────────────────
  const warnings: string[] = [];
  const isWeekend = dayIdx === 0 || dayIdx === 6;
  const hasDebt = user && (user.debt || 0) < 0;
  const debtAmount = hasDebt ? Math.abs(user!.debt || 0) : 0;

  if (weeklyCount >= 2) {
    const weekLabel = weeklyCount === 2 ? 'другий' : `${weeklyCount}-й`;
    if (poolSizes.final <= 2) {
      warnings.push(
        `Це вже ${weekLabel} наряд цього тижня. Причина: мало доступних — ` +
          `лише ${poolSizes.final} кандидат(-ів) з ${poolSizes.initial}.`
      );
    } else if (hasDebt) {
      warnings.push(
        `Це ${weekLabel} наряд цього тижня. Причина: є борг з попередніх ` +
          `місяців — система відпрацьовує ${debtAmount} пропущених нарядів.`
      );
    } else {
      warnings.push(
        `Це ${weekLabel} наряд цього тижня. Причина: серед доступних ` +
          `колег саме ви мали найкраще навантаження і баланс.`
      );
    }
    if (isWeekend) {
      warnings.push(
        `Призначено на вихідний (${dowNom.toLowerCase()}), і це не перший наряд цього тижня.`
      );
    }
  }

  if (sameDowPenalty >= 100) {
    warnings.push(
      `Ви вже чергували у ${dowName} минулого тижня (${sameDow} дн. тому). ` +
        `Система намагалась уникнути цього, але серед доступних кандидатів ` +
        `це був єдиний або найкращий варіант.`
    );
  } else if (sameDowPenalty >= 25) {
    warnings.push(
      `${dowNom} повторюється з невеликим інтервалом — останній раз ${sameDow} дн. тому ` +
        `(менш ніж ${sameDow <= 14 ? '2 тижні' : '3 тижні'}). ` +
        `Система намагалась уникнути, але це був найкращий варіант.`
    );
  }

  if (dowCount > 0 && zeroDowsAvailable.length > 0) {
    const avNames = zeroDowsAvailable.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
    warnings.push(
      `У вас 0 чергувань у «${avNames}», але призначено на ${dowName} ` +
        `(де вже ${dowCount}). Баланс буде вирівняно поступово.`
    );
  }

  if (warnings.length > 0) {
    sections.push({ icon: '⚠️', title: 'Зверніть увагу', items: warnings });
  }

  // ─── Build flat userText from sections ─────────────────────────────
  const textLines: string[] = [];
  for (const s of sections) {
    textLines.push(`${s.icon} ${s.title}`);
    for (const item of s.items) textLines.push(`  ${item}`);
    textLines.push('');
  }

  return {
    userText: textLines.join('\n').trim(),
    sections,
    debug: {
      winningCriterion,
      assignedUserId: assignedId,
      dowCount,
      dowSSE,
      sameDowPenalty,
      loadRate,
      waitDays: waitDays === Infinity ? -1 : waitDays,
      weeklyCount,
      poolSizes,
      alternatives,
    },
  };
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
 * Pass 2+ (Refinement): Multi-phase swap optimization minimizing
 *   the combined global objective Z = W_sameDow * penalties
 *     + W_sse * systemSSE + W_withinUser * variance + W_load * loadRange
 *
 *   Phase 1: Pair-exchange swaps (weekly-balance-neutral)
 *   Phase 2: Single-replacement swaps (forceUseAll-guarded)
 *   Phase 3: Targeted same-DOW-consecutive resolution
 *
 * Iterates swaps until global objective stabilizes.
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

    // Track pool sizes at each stage for decision log
    const logPoolSizes = {
      initial: 0,
      afterHardEligible: 0,
      afterRestDays: 0,
      afterIncompatiblePairs: 0,
      afterWeeklyCap: 0,
      afterForceUseAll: 0,
      final: 0,
    };
    const logAlternatives: CandidateSnapshot[] = [];

    for (let slot = 0; slot < slotsToFill; slot++) {
      const allAutoUsers = users.filter(
        (u) => u.id && isAutoParticipant(u) && !selectedIds.includes(u.id)
      );
      logPoolSizes.initial = allAutoUsers.length;

      const hardPool = allAutoUsers.filter((u) => isHardEligible(u, dateStr));
      logPoolSizes.afterHardEligible = hardPool.length;

      // Record hard-rejected users for decision log
      const hardRejected = allAutoUsers.filter((u) => !isHardEligible(u, dateStr));
      for (const u of hardRejected) {
        const status = getUserAvailabilityStatus(u, dateStr);
        let reason: string = 'hard_inactive';
        if (status === 'STATUS_BUSY') reason = 'hard_status_busy';
        else if (status === 'DAY_BLOCKED') reason = 'hard_day_blocked';
        else if (status === 'REST_DAY' || status === 'PRE_STATUS_DAY') reason = 'hard_rest_day';
        logAlternatives.push({
          userId: u.id!,
          userName: u.name,
          rejected: true,
          rejectPhase: 'hardConstraint',
          rejectReason: `${reason} (${status})`,
          metrics: null,
        });
      }

      let pool = [...hardPool];
      if (pool.length === 0) break;

      // Optional constraints from settings.
      if (options.avoidConsecutiveDays) {
        pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
      }
      logPoolSizes.afterRestDays = pool.length;

      pool = filterByIncompatiblePairs(pool, users, dateStr, tempSchedule);
      logPoolSizes.afterIncompatiblePairs = pool.length;

      pool = filterBySameWeekdayLastWeek(pool, dateStr, tempSchedule);

      const totalEligibleCount = countEligibleUsersForDate(users, tempSchedule, dateStr);
      if (options.limitOneDutyPerWeekWhenSevenPlus) {
        pool = filterByWeeklyCap(pool, users, dateStr, tempSchedule, options);
      }
      logPoolSizes.afterWeeklyCap = pool.length;

      // forceUseAllWhenFew hard switch:
      // While any eligible user has 0 duties this week, only they may be assigned.
      if (
        options.forceUseAllWhenFew &&
        totalEligibleCount !== undefined &&
        totalEligibleCount <= MIN_USERS_FOR_WEEKLY_LIMIT
      ) {
        pool = filterForceUseAllWhenFew(pool, dateStr, tempSchedule);
      }
      logPoolSizes.afterForceUseAll = pool.length;

      // Starvation fallback:
      // if soft filters emptied the pool, relax them and use any hard-eligible user.
      if (pool.length === 0) {
        pool = [...hardPool];
      }
      logPoolSizes.final = pool.length;

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

      // Look-ahead: prefer the highest-ranked candidate that does NOT
      // starve a future date. Falls back to pool[0] if all would starve.
      let selected = pool[0];
      if (pool.length > 1) {
        for (const candidate of pool) {
          if (isLookAheadSafe(candidate, dateStr, dates, users, tempSchedule, selectedIds)) {
            selected = candidate;
            break;
          }
        }
      }
      if (!selected?.id) break;
      selectedIds.push(selected.id);

      // Build alternative snapshots for non-selected candidates
      const dayIdx = new Date(dateStr).getDay();
      const week = getWeekWindow(dateStr);
      for (let ci = 1; ci < Math.min(pool.length, 6); ci++) {
        const alt = pool[ci];
        if (!alt.id) continue;
        const altDowCount = countUserDaysOfWeek(alt.id, fairnessSchedule)[dayIdx] || 0;
        const selDowCount = countUserDaysOfWeek(selected.id, fairnessSchedule)[dayIdx] || 0;
        let criterion = 'outranked';
        if (altDowCount > selDowCount) criterion = 'dowCount';
        logAlternatives.push({
          userId: alt.id,
          userName: alt.name,
          rejected: false,
          rejectPhase: 'comparator',
          rejectReason: `outranked at ${criterion}`,
          metrics: {
            dowCount: altDowCount,
            sameDowPenalty:
              daysSinceLastSameDowAssignment(alt.id, fairnessSchedule, dateStr) <= 7 ? 100 : 0,
            loadRate: computeUserLoadRate(alt.id, fairnessSchedule, dateStr, fairnessUsers),
            waitDays: daysSinceLastAssignment(alt.id, fairnessSchedule, dateStr),
            weeklyCount: countUserAssignmentsInRange(alt.id, fairnessSchedule, week.from, week.to),
          },
        });
      }
    }

    if (selectedIds.length === 0) {
      const critical: ScheduleEntry = { date: dateStr, userId: null, type: 'critical' };
      updates.push(critical);
      tempSchedule[dateStr] = critical;
      continue;
    }

    // Build decision log for this entry
    const assignedId = selectedIds[selectedIds.length - 1]; // last assigned by this slot
    const fairnessSchedule = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
    const dayIdx = new Date(dateStr).getDay();
    const week = getWeekWindow(dateStr);
    const pop = fairnessUsers.map((u) => u.id!);

    const decisionLog: DecisionLog = buildDecisionLog(
      assignedId,
      dateStr,
      dayIdx,
      fairnessSchedule,
      fairnessUsers,
      pop,
      logPoolSizes,
      logAlternatives,
      week,
      dates
    );

    const nextEntry: ScheduleEntry = {
      date: dateStr,
      userId: selectedIds.length === 1 ? selectedIds[0] : selectedIds,
      type: isManualType(existingEntry) ? existingEntry!.type : 'auto',
      isLocked: existingEntry?.isLocked || false,
      decisionLog,
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

  // ─── Post-optimization: minimize global objective via multi-phase swaps ────
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

    // Reconcile: collect final state for any date touched by swap optimizer.
    // Rebuild decision logs for entries whose assignment changed during swaps,
    // so the info button shows metrics for the ACTUAL assigned user.
    const fairnessScheduleFinal = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
    const pop = fairnessUsers.map((u) => u.id!);

    for (const dateStr of autoFilledDateSet) {
      const finalEntry = tempSchedule[dateStr];
      if (!finalEntry) continue;
      const existingUpdate = updates.find((u) => u.date === dateStr);
      if (!existingUpdate) continue;

      const oldIds = toAssignedUserIds(existingUpdate.userId);
      const newIds = toAssignedUserIds(finalEntry.userId);
      existingUpdate.userId = finalEntry.userId;

      // Rebuild decision log if the assigned user changed.
      const changed =
        oldIds.length !== newIds.length || oldIds.some((id, idx) => id !== newIds[idx]);
      if (changed) {
        const assignedId = newIds[newIds.length - 1];
        const dayIdx = new Date(dateStr).getDay();
        const week = getWeekWindow(dateStr);

        // Exclude current date from schedule so dowCount reflects state-before-assignment
        // (matches greedy pass behaviour where buildDecisionLog is called before the entry
        // is written to tempSchedule).
        const { [dateStr]: _, ...scheduleWithoutDate } = fairnessScheduleFinal;

        existingUpdate.decisionLog = buildDecisionLog(
          assignedId,
          dateStr,
          dayIdx,
          scheduleWithoutDate,
          fairnessUsers,
          pop,
          existingUpdate.decisionLog?.debug?.poolSizes || {
            initial: 0,
            afterHardEligible: 0,
            afterRestDays: 0,
            afterIncompatiblePairs: 0,
            afterWeeklyCap: 0,
            afterForceUseAll: 0,
            final: 0,
          },
          [], // alternatives from greedy pass are stale after swap
          week,
          dates
        );
      }
    }
  }

  return updates;
};
