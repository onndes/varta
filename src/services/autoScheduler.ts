// src/services/autoScheduler.ts

import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { getUserFairnessFrom } from '../utils/fairness';
import { isUserAvailable, repayOwedDay } from './userService';
import { calculateUserLoad, countUserDaysOfWeek, countUserAssignments } from './scheduleService';
import { toAssignedUserIds, isManualType } from '../utils/assignment';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';

// ─── \u041a\u043e\u043d\u0441\u0442\u0430\u043d\u0442\u0438 ──────────────────────────────────────────────────────

/** \u041c\u0456\u043b\u0456\u0441\u0435\u043a\u0443\u043d\u0434 \u0443 \u0434\u043e\u0431\u0456 */
const MS_PER_DAY = 86_400_000;

/** \u041c\u0456\u043d\u0456\u043c\u0443\u043c \u0431\u0456\u0439\u0446\u0456\u0432, \u043f\u0440\u0438 \u044f\u043a\u043e\u043c\u0443 \u0432\u043c\u0438\u043a\u0430\u0454\u0442\u044c\u0441\u044f \u043e\u0431\u043c\u0435\u0436\u0435\u043d\u043d\u044f \u00ab1 \u043d\u0430\u0440\u044f\u0434 \u043d\u0430 \u0442\u0438\u0436\u0434\u0435\u043d\u044c\u00bb */
const MIN_USERS_FOR_WEEKLY_LIMIT = 7;

/** \u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c \u043d\u0430\u0440\u044f\u0434\u0456\u0432 \u043d\u0430 \u0442\u0438\u0436\u0434\u0435\u043d\u044c \u0434\u043b\u044f \u0431\u043e\u0440\u0436\u043d\u0438\u043a\u0456\u0432 */
const MAX_DEBT_WEEKLY_CAP = 4;

/** \u041c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u0430 \u043a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c \u0456\u0442\u0435\u0440\u0430\u0446\u0456\u0439 \u043f\u043e\u0441\u0442-\u0431\u0430\u043b\u0430\u043d\u0441\u0443\u0432\u0430\u043d\u043d\u044f */
const MAX_REBALANCE_ITERATIONS = 100;

/** \u041f\u043e\u0440\u0456\u0433 \u0440\u0456\u0437\u043d\u0438\u0446\u0456 \u043d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f, \u043d\u0438\u0436\u0447\u0435 \u044f\u043a\u043e\u0433\u043e \u0432\u0432\u0430\u0436\u0430\u0454\u043c\u043e \u0437\u0431\u0430\u043b\u0430\u043d\u0441\u043e\u0432\u0430\u043d\u0438\u043c */
const REBALANCE_THRESHOLD = 0.03;

/** \u041c\u0456\u043d\u0456\u043c\u0430\u043b\u044c\u043d\u0430 \u0434\u0430\u0442\u0430 \u0434\u043b\u044f \u0444\u043e\u043b\u0431\u0435\u043a-\u043f\u043e\u0440\u0456\u0432\u043d\u044f\u043d\u043d\u044f */
const MIN_DATE_SENTINEL = '0000-01-01';

/** \u041c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u0430 \u0434\u0430\u0442\u0430 \u0434\u043b\u044f \u0444\u043e\u043b\u0431\u0435\u043a-\u043f\u043e\u0440\u0456\u0432\u043d\u044f\u043d\u043d\u044f */
const MAX_DATE_SENTINEL = '9999-12-31';

/** \u0422\u043e\u0447\u043d\u0456\u0441\u0442\u044c \u043f\u043e\u0440\u0456\u0432\u043d\u044f\u043d\u043d\u044f \u0434\u0440\u043e\u0431\u041e\u0432\u0438\u0445 \u0447\u0438\u0441\u0435\u043b */
const FLOAT_EPSILON = 1e-9;

// \u2500\u2500\u2500 \u0414\u043e\u043f\u043e\u043c\u0456\u0436\u043d\u0456 \u0444\u0443\u043d\u043a\u0446\u0456\u0457: \u0434\u0430\u0442\u0438 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** \u041f\u0435\u0440\u0448\u0430 \u0434\u0430\u0442\u0430 \u0432 \u0433\u0440\u0430\u0444\u0456\u043a\u0443, \u0430\u0431\u043e fallback \u044f\u043a\u0449\u043e \u0433\u0440\u0430\u0444\u0456\u043a \u043f\u043e\u0440\u043e\u0436\u043d\u0456\u0439 */
const getScheduleStart = (
  schedule: Record<string, ScheduleEntry>,
  fallbackDate: string
): string => {
  const dates = Object.keys(schedule).sort();
  return dates[0] || fallbackDate;
};

/** \u041f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u0434\u0430\u0442\u0430 (YYYY-MM-DD) */
const getPrevDateStr = (dateStr: string): string => {
  const prev = new Date(dateStr);
  prev.setDate(prev.getDate() - 1);
  return toLocalISO(prev);
};

/** \u041f\u043e\u043d\u0435\u0434\u0456\u043b\u043e\u043a\u2013\u043d\u0435\u0434\u0456\u043b\u044f \u0442\u0438\u0436\u043d\u044f, \u0434\u043e \u044f\u043a\u043e\u0433\u043e \u043d\u0430\u043b\u0435\u0436\u0438\u0442\u044c \u0434\u0430\u0442\u0430 */
const getWeekWindow = (dateStr: string): { from: string; to: string } => {
  const d = new Date(dateStr);
  const dow = d.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toLocalISO(monday), to: toLocalISO(sunday) };
};

/** \u0421\u043f\u0438\u0441\u043e\u043a \u0434\u0430\u0442 \u0432 \u0434\u0456\u0430\u043f\u0430\u0437\u043e\u043d\u0456 [\u0432\u0456\u0434, \u0434\u043e] */
const getDatesInRange = (fromDate: string, toDate: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(fromDate);
  const end = new Date(toDate);
  while (cursor <= end) {
    dates.push(toLocalISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

// \u2500\u2500\u2500 \u0414\u043e\u043f\u043e\u043c\u0456\u0436\u043d\u0456 \u0444\u0443\u043d\u043a\u0446\u0456\u0457: \u043e\u0431\u043c\u0435\u0436\u0435\u043d\u043d\u044f \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** \u0427\u0438 \u0434\u043e\u0441\u0438\u0442\u044c \u0431\u0456\u0439\u0446\u0456\u0432 \u0434\u043b\u044f \u043e\u0431\u043c\u0435\u0436\u0435\u043d\u043d\u044f \u00ab1 \u043d\u0430\u0440\u044f\u0434 \u043d\u0430 \u0442\u0438\u0436\u0434\u0435\u043d\u044c\u00bb */
const shouldEnforceOneDutyPerWeek = (
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

/** \u0427\u0438 \u043c\u0430\u0454 \u0431\u043e\u0454\u0446\u044c \u043d\u0435\u043e\u043f\u043b\u0430\u0447\u0435\u043d\u0438\u0439 \u0431\u043e\u0440\u0433 (\u043a\u0430\u0440\u043c\u0430 \u0430\u0431\u043e owedDays) */
const hasDebtBacklog = (user: User): boolean => {
  const hasOwedDays = Object.values(user.owedDays || {}).some((v) => v > 0);
  return (user.debt || 0) < 0 || hasOwedDays;
};

/** \u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c \u043d\u0430\u0440\u044f\u0434\u0456\u0432 \u043d\u0430 \u0442\u0438\u0436\u0434\u0435\u043d\u044c: \u0431\u043e\u0440\u0436\u043d\u0438\u043a\u0438 \u043c\u043e\u0436\u0443\u0442\u044c \u0431\u0456\u043b\u044c\u0448\u0435 */
const getWeeklyAssignmentCap = (user: User, options: AutoScheduleOptions): number => {
  if (options.allowDebtUsersExtraWeeklyAssignments && hasDebtBacklog(user)) {
    return Math.min(MAX_DEBT_WEEKLY_CAP, Math.max(1, options.debtUsersWeeklyLimit || 1));
  }
  return 1;
};

// \u2500\u2500\u2500 \u0414\u043e\u043f\u043e\u043c\u0456\u0436\u043d\u0456 \u0444\u0443\u043d\u043a\u0446\u0456\u0457: \u043c\u0435\u0442\u0440\u0438\u043a\u0438 \u0431\u0456\u0439\u0446\u044f \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * \u041e\u0447\u043a\u0438 \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u0443 \u0434\u043b\u044f \u043f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f \u0431\u043e\u0440\u0433\u0443.
 * \u042f\u043a\u0449\u043e \u0431\u043e\u0454\u0446\u044c \u0432\u0438\u043d\u0435\u043d \u0441\u0430\u043c\u0435 \u0446\u0435\u0439 \u0434\u0435\u043d\u044c \u0442\u0438\u0436\u043d\u044f \u2014 \u043f\u043e\u0432\u0435\u0440\u0442\u0430\u0454 \u043e\u0447\u043a\u0438 \u0437\u0430 \u043f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f.
 */
const getDebtRepaymentScore = (user: User, dayIdx: number, dayWeight: number): number => {
  const debtAbs = Math.abs(Math.min(0, user.debt || 0));
  if (debtAbs <= 0) return 0;

  const owedToday = (user.owedDays && user.owedDays[dayIdx]) || 0;
  if (owedToday > 0) {
    return Math.min(debtAbs, owedToday * dayWeight);
  }
  return 0;
};

/**
 * \u0420\u0456\u0448\u0435\u043d\u043d\u044f \u0430\u0433\u0440\u0435\u0441\u0438\u0432\u043d\u043e\u0433\u043e \u0431\u0430\u043b\u0430\u043d\u0441\u0443\u0432\u0430\u043d\u043d\u044f.
 * \u042f\u043a\u0449\u043e \u0440\u0456\u0437\u043d\u0438\u0446\u044f \u043d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f > threshold \u2014 \u043f\u0440\u0438\u043c\u0443\u0441\u043e\u0432\u043e \u043f\u0435\u0440\u0435\u0441\u0442\u0430\u0432\u043b\u044f\u0454.
 * \u041f\u043e\u0432\u0435\u0440\u0442\u0430\u0454 0 \u044f\u043a\u0449\u043e \u043d\u0435\u043c\u0430\u0454 \u043f\u0456\u0434\u0441\u0442\u0430\u0432, \u0456\u043d\u0430\u043a\u0448\u0435 \u043d\u0430\u043f\u0440\u044f\u043c\u043e\u043a \u0434\u043b\u044f \u0441\u043e\u0440\u0442\u0443\u0432\u0430\u043d\u043d\u044f.
 */
const getAggressiveBalanceDecision = (loadA: number, loadB: number, threshold: number): number => {
  const gap = loadA - loadB;
  return Math.abs(gap) > threshold ? gap : 0;
};

/** \u0421\u043a\u0456\u043b\u044c\u043a\u0438 \u043d\u0430\u0440\u044f\u0434\u0456\u0432 \u0443 \u0431\u0456\u0439\u0446\u044f \u0432 \u0434\u0456\u0430\u043f\u0430\u0437\u043e\u043d\u0456 \u0434\u0430\u0442 */
const countUserAssignmentsInRange = (
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

/** \u0421\u043a\u0456\u043b\u044c\u043a\u0438 \u0434\u043d\u0456\u0432 \u043c\u0438\u043d\u0443\u043b\u043e \u0437 \u043e\u0441\u0442\u0430\u043d\u043d\u044c\u043e\u0433\u043e \u043d\u0430\u0440\u044f\u0434\u0443 (\u0447\u0438\u043c \u0431\u0456\u043b\u044c\u0448\u0435 \u2014 \u0442\u0438\u043c \u0432\u0438\u0449\u0430 \u0447\u0435\u0440\u0433\u0430) */
const daysSinceLastAssignment = (
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
 * \u0427\u0438 \u0431\u043e\u0454\u0446\u044c \u0433\u0430\u0440\u0430\u043d\u0442\u043e\u0432\u0430\u043d\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439 \u043d\u0430 \u0434\u0430\u0442\u0443
 * (\u0432\u0456\u0434\u043f\u0443\u0441\u0442\u043a\u0430 / \u0432\u0456\u0434\u0440\u044f\u0434\u0436\u0435\u043d\u043d\u044f / \u043b\u0456\u043a\u0443\u0432\u0430\u043d\u043d\u044f / \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u0438\u0439)
 */
const isHardUnavailable = (user: User, dateStr: string): boolean => {
  if (!user.isActive) return true;
  if (user.status === 'VACATION' || user.status === 'TRIP' || user.status === 'SICK') {
    const from = user.statusFrom || MIN_DATE_SENTINEL;
    const to = user.statusTo || MAX_DATE_SENTINEL;
    if (dateStr >= from && dateStr <= to) return true;
  }
  return false;
};

/**
 * \u041f\u0456\u0434\u0440\u0430\u0445\u0443\u043d\u043e\u043a \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0445 \u0434\u043d\u0456\u0432 \u0431\u0456\u0439\u0446\u044f \u0432 \u0434\u0456\u0430\u043f\u0430\u0437\u043e\u043d\u0456 \u0434\u0430\u0442.
 * \u042f\u043a\u0449\u043e dayIdx \u0437\u0430\u0434\u0430\u043d\u043e \u2014 \u0440\u0430\u0445\u0443\u0454 \u0442\u0456\u043b\u044c\u043a\u0438 \u0434\u043d\u0456 \u0446\u044c\u043e\u0433\u043e \u0434\u043d\u044f \u0442\u0438\u0436\u043d\u044f.
 */
const countAvailableDaysInWindow = (
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

/** \u041f\u043e\u0440\u0456\u0432\u043d\u044f\u043d\u043d\u044f \u0434\u0440\u043e\u0431\u043e\u0432\u0438\u0445 \u0447\u0438\u0441\u0435\u043b \u0437 \u0442\u043e\u0447\u043d\u0456\u0441\u0442\u044e epsilon */
const floatEq = (a: number, b: number): boolean => Math.abs(a - b) < FLOAT_EPSILON;

/** \u0411\u0430\u0437\u043e\u0432\u0430 \u0434\u0430\u0442\u0430 \u043e\u0431\u043b\u0456\u043a\u0443 \u0434\u043b\u044f \u0431\u0456\u0439\u0446\u044f (\u043a\u043e\u0436\u0435\u043d \u0440\u0430\u0445\u0443\u0454\u0442\u044c\u0441\u044f \u0432\u0456\u0434 \u0441\u0432\u043e\u0454\u0457 \u0434\u0430\u0442\u0438 \u0432\u0441\u0442\u0443\u043f\u0443) */
const getUserCompareFrom = (
  user: User,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): string => {
  return getUserFairnessFrom(user, dateStr) || getScheduleStart(schedule, dateStr);
};

// \u2500\u2500\u2500 \u0423\u043d\u0456\u0432\u0435\u0440\u0441\u0430\u043b\u044c\u043d\u0438\u0439 \u043a\u043e\u043c\u043f\u0430\u0440\u0430\u0442\u043e\u0440 \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u0456\u0432 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * \u0421\u043e\u0440\u0442\u0443\u0454 \u0434\u0432\u043e\u0445 \u0431\u0456\u0439\u0446\u0456\u0432 \u0437\u0430 \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u043e\u043c \u043f\u0440\u0438\u0437\u043d\u0430\u0447\u0435\u043d\u043d\u044f \u043d\u0430 \u0434\u0430\u0442\u0443.
 *
 * \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u0438 (\u0432\u0456\u0434 \u043d\u0430\u0439\u0432\u0430\u0436\u043b\u0438\u0432\u0456\u0448\u043e\u0433\u043e):
 * 0. \u0410\u0433\u0440\u0435\u0441\u0438\u0432\u043d\u0435 \u0431\u0430\u043b\u0430\u043d\u0441\u0443\u0432\u0430\u043d\u043d\u044f (override, \u044f\u043a\u0449\u043e \u0432\u043a\u043b\u044e\u0447\u0435\u043d\u043e)
 * 1. \u0425\u0442\u043e \u0432\u0438\u043d\u0435\u043d \u0441\u0430\u043c\u0435 \u0446\u0435\u0439 \u0434\u0435\u043d\u044c \u0442\u0438\u0436\u043d\u044f (owedDays)
 * 2. \u0428\u0432\u0438\u0434\u0448\u0435 \u043f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f \u0431\u043e\u0440\u0433\u0443 (debtRepayment)
 * 3. \u0420\u0456\u0432\u043d\u043e\u043c\u0456\u0440\u043d\u0438\u0439 \u0440\u043e\u0437\u043f\u043e\u0434\u0456\u043b \u043f\u043e \u0434\u043d\u044f\u0445 \u0442\u0438\u0436\u043d\u044f (\u043d\u043e\u0440\u043c\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u043e)
 * 4. \u041c\u0435\u043d\u0448\u0435 \u043d\u0430\u0440\u044f\u0434\u0456\u0432 \u0432 \u043f\u043e\u0442\u043e\u0447\u043d\u043e\u043c\u0443 \u0442\u0438\u0436\u043d\u0456
 * 5. \u0425\u0442\u043e \u0434\u043e\u0432\u0448\u0435 \u0447\u0435\u043a\u0430\u0454 \u0437 \u043e\u0441\u0442\u0430\u043d\u043d\u044c\u043e\u0433\u043e \u043d\u0430\u0440\u044f\u0434\u0443
 * 6. \u0417\u0430\u0433\u0430\u043b\u044c\u043d\u0430 \u043a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c \u043d\u0430\u0440\u044f\u0434\u0456\u0432 (\u043d\u043e\u0440\u043c\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u043e \u0434\u043e \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0441\u0442\u0456)
 * 7. \u0417\u0432\u0430\u0436\u0435\u043d\u0435 \u043d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f + \u043a\u0430\u0440\u043c\u0430 (\u043d\u043e\u0440\u043c\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u043e)
 * 8. \u0420\u0430\u043d\u0434\u043e\u043c (\u0449\u043e\u0431 \u0443\u043d\u0438\u043a\u043d\u0443\u0442\u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0437\u043c\u0456\u0449\u0435\u043d\u043d\u044f)
 *
 * @param tempLoadOffset - \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u0430 \u043d\u0430\u0434\u0431\u0430\u0432\u043a\u0430 \u043d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f (\u0432\u0438\u043a\u043e\u0440\u0438\u0441\u0442\u043e\u0432\u0443\u0454\u0442\u044c\u0441\u044f \u0432 autoFillSchedule)
 */
const buildUserComparator = (
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  tempLoadOffset?: Record<number, number>
): ((a: User, b: User) => number) => {
  const dayIdx = new Date(dateStr).getDay();
  const weight = dayWeights[dayIdx] || 1.0;
  const compareTo = getPrevDateStr(dateStr);

  return (a: User, b: User): number => {
    if (!a.id || !b.id) return 0;

    const fromA = getUserCompareFrom(a, dateStr, schedule);
    const fromB = getUserCompareFrom(b, dateStr, schedule);
    const offsetA = tempLoadOffset?.[a.id] ?? 0;
    const offsetB = tempLoadOffset?.[b.id] ?? 0;

    // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 0: \u0410\u0433\u0440\u0435\u0441\u0438\u0432\u043d\u0435 \u0431\u0430\u043b\u0430\u043d\u0441\u0443\u0432\u0430\u043d\u043d\u044f (override)
    if (options.considerLoad && options.aggressiveLoadBalancing) {
      const threshold = Math.max(0, options.aggressiveLoadBalancingThreshold ?? 0.2);
      const loadA = calculateUserLoad(a.id, schedule, dayWeights, fromA) + offsetA + (a.debt || 0);
      const loadB = calculateUserLoad(b.id, schedule, dayWeights, fromB) + offsetB + (b.debt || 0);
      const forced = getAggressiveBalanceDecision(loadA, loadB, threshold);
      if (forced !== 0) return forced;
    }

    // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 1: \u0425\u0442\u043e \u0432\u0438\u043d\u0435\u043d \u0441\u0430\u043c\u0435 \u0446\u0435\u0439 \u0434\u0435\u043d\u044c \u0442\u0438\u0436\u043d\u044f
    if (options.respectOwedDays) {
      const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
      const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
      if (oweA !== oweB) return oweB - oweA;
    }

    // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 2: \u0428\u0432\u0438\u0434\u0448\u0435 \u043f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f \u0431\u043e\u0440\u0433\u0443
    if (options.prioritizeFasterDebtRepayment) {
      const repayA = getDebtRepaymentScore(a, dayIdx, weight);
      const repayB = getDebtRepaymentScore(b, dayIdx, weight);
      if (repayA !== repayB) return repayB - repayA;
    }

    if (options.considerLoad) {
      // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 3: \u0420\u0456\u0432\u043d\u043e\u043c\u0456\u0440\u043d\u0438\u0439 \u0440\u043e\u0437\u043f\u043e\u0434\u0456\u043b \u043f\u043e \u0434\u043d\u044f\u0445 \u0442\u0438\u0436\u043d\u044f (\u043d\u043e\u0440\u043c\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u043e \u0434\u043e \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e\u0441\u0442\u0456)
      const dowA = countUserDaysOfWeek(a.id, schedule, fromA)[dayIdx] || 0;
      const dowB = countUserDaysOfWeek(b.id, schedule, fromB)[dayIdx] || 0;
      const dowAvailA = Math.max(1, countAvailableDaysInWindow(a, fromA, compareTo, dayIdx));
      const dowAvailB = Math.max(1, countAvailableDaysInWindow(b, fromB, compareTo, dayIdx));
      const dowRateA = dowA / dowAvailA;
      const dowRateB = dowB / dowAvailB;
      if (!floatEq(dowRateA, dowRateB)) return dowRateA - dowRateB;

      // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 4: \u041c\u0435\u043d\u0448\u0435 \u043d\u0430\u0440\u044f\u0434\u0456\u0432 \u0432 \u043f\u043e\u0442\u043e\u0447\u043d\u043e\u043c\u0443 \u0442\u0438\u0436\u043d\u0456
      const week = getWeekWindow(dateStr);
      const weekA = countUserAssignmentsInRange(a.id, schedule, week.from, week.to);
      const weekB = countUserAssignmentsInRange(b.id, schedule, week.from, week.to);
      if (weekA !== weekB) return weekA - weekB;

      // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 5: \u0425\u0442\u043e \u0434\u043e\u0432\u0448\u0435 \u0447\u0435\u043a\u0430\u0454 \u0437 \u043e\u0441\u0442\u0430\u043d\u043d\u044c\u043e\u0433\u043e \u043d\u0430\u0440\u044f\u0434\u0443
      const waitA = daysSinceLastAssignment(a.id, schedule, dateStr);
      const waitB = daysSinceLastAssignment(b.id, schedule, dateStr);
      if (waitA !== waitB) return waitB - waitA;

      // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 6: \u0417\u0430\u0433\u0430\u043b\u044c\u043d\u0430 \u043a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c \u043d\u0430\u0440\u044f\u0434\u0456\u0432 (\u043d\u043e\u0440\u043c\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u043e)
      const totalA = countUserAssignments(a.id, schedule, fromA) + offsetA;
      const totalB = countUserAssignments(b.id, schedule, fromB) + offsetB;
      const availA = Math.max(1, countAvailableDaysInWindow(a, fromA, compareTo));
      const availB = Math.max(1, countAvailableDaysInWindow(b, fromB, compareTo));
      const totalRateA = totalA / availA;
      const totalRateB = totalB / availB;
      if (!floatEq(totalRateA, totalRateB)) return totalRateA - totalRateB;

      // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 7: \u0417\u0432\u0430\u0436\u0435\u043d\u0435 \u043d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f + \u043a\u0430\u0440\u043c\u0430
      const loadA = calculateUserLoad(a.id, schedule, dayWeights, fromA) + offsetA + (a.debt || 0);
      const loadB = calculateUserLoad(b.id, schedule, dayWeights, fromB) + offsetB + (b.debt || 0);
      const loadDiff = loadA / availA - loadB / availB;
      if (!floatEq(loadDiff, 0)) return loadDiff;
    }

    // \u041f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442 8: \u0420\u0430\u043d\u0434\u043e\u043c (\u0443\u043d\u0438\u043a\u0430\u0454\u043c\u043e \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0437\u043c\u0456\u0449\u0435\u043d\u043d\u044f)
    return Math.random() - 0.5;
  };
};

// \u2500\u2500\u2500 \u0414\u043e\u043f\u043e\u043c\u0456\u0436\u043d\u0456: \u0444\u0456\u043b\u044c\u0442\u0440\u0430\u0446\u0456\u044f \u043f\u0443\u043b\u0443 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/** \u0412\u0438\u0434\u0430\u043b\u0438\u0442\u0438 \u0437 \u043f\u0443\u043b\u0443 \u0442\u0438\u0445, \u0445\u0442\u043e \u0447\u0435\u0440\u0433\u0443\u0432\u0430\u0432 \u043d\u0435\u0449\u043e\u0434\u0430\u0432\u043d\u043e (\u0434\u043d\u0456 \u0432\u0456\u0434\u043f\u043e\u0447\u0438\u043d\u043a\u0443) */
const filterByRestDays = (
  pool: User[],
  dateStr: string,
  minRest: number,
  tempSchedule: Record<string, ScheduleEntry>
): User[] => {
  const recentUserIds = new Set<number>();
  for (let i = 1; i <= minRest; i++) {
    const checkDate = new Date(dateStr);
    checkDate.setDate(checkDate.getDate() - i);
    const rawId = tempSchedule[toLocalISO(checkDate)]?.userId;
    if (rawId) {
      const ids = Array.isArray(rawId) ? rawId : [rawId];
      ids.forEach((id) => recentUserIds.add(id));
    }
  }
  if (recentUserIds.size === 0) return pool;
  const filtered = pool.filter((u) => !recentUserIds.has(u.id!));
  return filtered.length > 0 ? filtered : pool; // fallback: \u043a\u0440\u0430\u0449\u0435 \u043f\u043e\u0441\u0442\u0430\u0432\u0438\u0442\u0438, \u043d\u0456\u0436 \u043f\u0443\u0441\u0442\u0456\u0439 \u0434\u0435\u043d\u044c
};

/** \u0412\u0438\u0434\u0430\u043b\u0438\u0442\u0438 \u0437 \u043f\u0443\u043b\u0443 \u0442\u0438\u0445, \u0445\u0442\u043e \u0432\u0436\u0435 \u043f\u0435\u0440\u0435\u0432\u0438\u0449\u0438\u0432 \u043b\u0456\u043c\u0456\u0442 \u043d\u0430 \u0442\u0438\u0436\u043d\u0456 */
const filterByWeeklyCap = (
  pool: User[],
  allUsers: User[],
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  options: AutoScheduleOptions
): User[] => {
  const week = getWeekWindow(dateStr);
  const weekDates = getDatesInRange(week.from, week.to);
  if (!shouldEnforceOneDutyPerWeek(allUsers, schedule, weekDates)) return pool;

  const filtered = pool.filter((u) => {
    if (!u.id) return false;
    const assignedInWeek = countUserAssignmentsInRange(u.id, schedule, week.from, week.to);
    return assignedInWeek < getWeeklyAssignmentCap(u, options);
  });
  return filtered.length > 0 ? filtered : pool;
};

/**
 * Automatically fill schedule gaps
 */
export const autoFillSchedule = async (
  targetDates: string[],
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay = 1,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS
): Promise<ScheduleEntry[]> => {
  const updates: ScheduleEntry[] = [];
  const tempSchedule = { ...schedule };

  // Track temporary load offsets
  const tempLoadOffset: Record<number, number> = {};
  users.forEach((u) => {
    if (u.id) tempLoadOffset[u.id] = 0;
  });

  const todayStr = toLocalISO(new Date());

  for (const dateStr of targetDates) {
    // Skip past dates
    if (dateStr < todayStr) continue;

    const existingEntry = tempSchedule[dateStr];
    const existingIds = toAssignedUserIds(existingEntry?.userId);

    // Skip locked or manual entries that are already fully staffed
    if (
      (existingEntry?.isLocked || isManualType(existingEntry)) &&
      existingIds.length >= Math.max(1, dutiesPerDay)
    ) {
      continue;
    }

    const weight = dayWeights[new Date(dateStr).getDay()] || 1.0;

    // Доступні для авто-розкладу бійці
    let pool = users.filter(
      (u) =>
        u.isActive && !u.isExtra && !u.excludeFromAuto && isUserAvailable(u, dateStr, tempSchedule)
    );

    // Спільний компаратор (з тимчасовим offset навантаження)
    const compare = buildUserComparator(dateStr, tempSchedule, dayWeights, options, tempLoadOffset);
    pool.sort(compare);

    // Фільтри: дні відпочинку та ліміт на тиждень
    if (options.avoidConsecutiveDays) {
      pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
    }
    if (options.limitOneDutyPerWeekWhenSevenPlus) {
      pool = filterByWeeklyCap(pool, users, dateStr, tempSchedule, options);
    }

    // Призначити найкращих кандидатів до dutiesPerDay
    const selectedIds: number[] = [...existingIds];
    const slotsToFill = Math.max(0, Math.max(1, dutiesPerDay) - selectedIds.length);
    for (let slot = 0; slot < slotsToFill; slot++) {
      const slotPool = pool.filter((u) => u.id && !selectedIds.includes(u.id));
      if (slotPool.length === 0) break;
      slotPool.sort(compare);
      const selected = slotPool[0];
      if (!selected?.id) break;
      selectedIds.push(selected.id);
      tempLoadOffset[selected.id] += weight;
    }

    if (selectedIds.length > 0) {
      const entry: ScheduleEntry = {
        date: dateStr,
        userId: selectedIds.length === 1 ? selectedIds[0] : selectedIds,
        type: isManualType(existingEntry) ? existingEntry!.type : 'auto',
        isLocked: existingEntry?.isLocked || false,
      };
      const prevIds = toAssignedUserIds(existingEntry?.userId);
      const changed =
        prevIds.length !== selectedIds.length ||
        prevIds.some((id) => !selectedIds.includes(id)) ||
        !existingEntry;
      if (changed) {
        updates.push(entry);
        tempSchedule[dateStr] = entry;
      }
    } else {
      // No available users - mark as critical
      updates.push({
        date: dateStr,
        userId: null,
        type: 'critical',
      });
    }
  }

  // ── Post-balancing pass ──────────────────────────────────────────────
  // After greedy fill, reduce load variance by reassigning auto entries
  // from overloaded users to underloaded users (respecting all constraints).
  if (options.considerLoad && targetDates.length > 0) {
    const autoPool = users.filter((u) => u.id && u.isActive && !u.isExtra && !u.excludeFromAuto);
    const latestDate = targetDates[targetDates.length - 1];

    const getLoadRate = (u: User): number => {
      const from = getUserCompareFrom(u, latestDate, tempSchedule);
      const load = calculateUserLoad(u.id!, tempSchedule, dayWeights, from) + (u.debt || 0);
      const avail = Math.max(1, countAvailableDaysInWindow(u, from, latestDate));
      return load / avail;
    };

    for (let iter = 0; iter < MAX_REBALANCE_ITERATIONS; iter++) {
      // Compute normalized load for each pool member
      const loads = autoPool.map((u) => ({ user: u, rate: getLoadRate(u) }));
      loads.sort((a, b) => b.rate - a.rate);
      const over = loads[0];
      const under = loads[loads.length - 1];

      if (!over || !under || over.user.id === under.user.id) break;
      if (over.rate - under.rate < REBALANCE_THRESHOLD) break;

      // Find an auto entry assigned to overloaded user that underloaded user can take
      let reassigned = false;
      for (const dateStr of targetDates) {
        if (dateStr < todayStr) continue;
        const entry = tempSchedule[dateStr];
        if (!entry || entry.isLocked || isManualType(entry)) continue;

        const ids = toAssignedUserIds(entry.userId);
        if (!ids.includes(over.user.id!)) continue;
        if (ids.includes(under.user.id!)) continue;

        // Check underloaded user availability
        if (!isUserAvailable(under.user, dateStr, tempSchedule)) continue;

        // Check rest-day constraints (both directions)
        if (options.avoidConsecutiveDays) {
          const minRest = options.minRestDays || 1;
          let restViolation = false;
          for (let i = 1; i <= minRest; i++) {
            const before = new Date(dateStr);
            before.setDate(before.getDate() - i);
            const after = new Date(dateStr);
            after.setDate(after.getDate() + i);
            if (
              toAssignedUserIds(tempSchedule[toLocalISO(before)]?.userId).includes(
                under.user.id!
              ) ||
              toAssignedUserIds(tempSchedule[toLocalISO(after)]?.userId).includes(under.user.id!)
            ) {
              restViolation = true;
              break;
            }
          }
          if (restViolation) continue;
        }

        // Check weekly cap for underloaded user
        if (options.limitOneDutyPerWeekWhenSevenPlus) {
          const week = getWeekWindow(dateStr);
          const weekDates = getDatesInRange(week.from, week.to);
          if (shouldEnforceOneDutyPerWeek(users, tempSchedule, weekDates)) {
            const inWeek = countUserAssignmentsInRange(
              under.user.id!,
              tempSchedule,
              week.from,
              week.to
            );
            const cap = getWeeklyAssignmentCap(under.user, options);
            if (inWeek >= cap) continue;
          }
        }

        // Reassign: replace overloaded user with underloaded user on this date
        const newIds = ids.map((id) => (id === over.user.id! ? under.user.id! : id));
        const newEntry: ScheduleEntry = {
          ...entry,
          userId: newIds.length === 1 ? newIds[0] : newIds,
        };
        tempSchedule[dateStr] = newEntry;

        const updateIdx = updates.findIndex((u) => u.date === dateStr);
        if (updateIdx >= 0) {
          updates[updateIdx] = newEntry;
        } else {
          updates.push(newEntry);
        }

        reassigned = true;
        break; // one reassignment per iteration, then re-evaluate loads
      }

      if (!reassigned) break;
    }
  }

  return updates;
};

/**
 * Зберегти авто-розклад та погасити борги (owedDays + карма).
 */
export const saveAutoSchedule = async (
  entries: ScheduleEntry[],
  dayWeights: DayWeights
): Promise<void> => {
  await db.transaction('rw', db.schedule, db.users, async () => {
    for (const entry of entries) {
      await db.schedule.put(entry);

      if (entry.userId) {
        const userIds = Array.isArray(entry.userId) ? entry.userId : [entry.userId];
        const dayIdx = new Date(entry.date).getDay();
        const weight = dayWeights[dayIdx] || 1.0;

        for (const userId of userIds) {
          await repayOwedDay(userId, dayIdx, weight);
        }
      }
    }
  });
};

/**
 * Get free users for a specific date
 */
export const getFreeUsersForDate = (
  dateStr: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS
): User[] => {
  const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));

  // Доступні бійці (не призначені, не Extra, не excludeFromAuto)
  let candidatePool = users.filter(
    (u) =>
      !u.isExtra &&
      !u.excludeFromAuto &&
      !assignedOnDate.has(u.id!) &&
      isUserAvailable(u, dateStr, schedule)
  );

  // Ліміт на тиждень
  if (options.limitOneDutyPerWeekWhenSevenPlus) {
    candidatePool = filterByWeeklyCap(candidatePool, users, dateStr, schedule, options);
  }

  // Сортуємо за спільним пріоритетним компаратором
  return candidatePool.sort(buildUserComparator(dateStr, schedule, dayWeights, options));
};

/**
 * Recalculate schedule from a specific date
 */
export const recalculateScheduleFrom = async (
  startDate: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay = 1,
  options?: AutoScheduleOptions
): Promise<void> => {
  const todayStr = toLocalISO(new Date());
  const start = startDate < todayStr ? todayStr : startDate;

  // Get all dates to recalculate
  const allDates = Object.keys(schedule).sort();
  const lastDate = allDates[allDates.length - 1];

  if (!lastDate || start > lastDate) return;

  const datesToRegen: string[] = [];
  const d = new Date(start);
  const endD = new Date(lastDate);

  while (d <= endD) {
    const iso = toLocalISO(d);
    // Keep locked entries and manual entries (only recalculate auto entries)
    if (!schedule[iso] || (!schedule[iso].isLocked && !isManualType(schedule[iso]))) {
      datesToRegen.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }

  // Delete unlocked entries
  await db.schedule.bulkDelete(datesToRegen);

  // Build a fresh schedule copy without the deleted entries so autoFillSchedule
  // sees those dates as empty and actually assigns users to them.
  // Without this, the stale in-memory schedule would make autoFillSchedule think
  // the deleted slots are already filled (slotsToFill = 0) and skip them entirely.
  const freshSchedule = { ...schedule };
  for (const date of datesToRegen) {
    delete freshSchedule[date];
  }

  // Regenerate
  const updates = await autoFillSchedule(
    datesToRegen,
    users,
    freshSchedule,
    dayWeights,
    dutiesPerDay,
    options
  );
  await saveAutoSchedule(updates, dayWeights);
};

/**
 * Calculate optimal assignment for a date
 */
export const calculateOptimalAssignment = (
  dateStr: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS
): User | null => {
  let available = users.filter((u) => u.isActive && isUserAvailable(u, dateStr, schedule));
  if (available.length === 0) return null;

  // Ліміт на тиждень
  if (options.limitOneDutyPerWeekWhenSevenPlus) {
    available = filterByWeeklyCap(available, users, dateStr, schedule, options);
  }

  // Сортуємо за спільним пріоритетним компаратором
  available.sort(buildUserComparator(dateStr, schedule, dayWeights, options));
  return available[0];
};
