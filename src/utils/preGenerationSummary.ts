// src/utils/preGenerationSummary.ts
// Pure helpers for the pre-generation confirmation modal: collects everything
// the operator should review before auto-filling a date window — status
// periods, exclude-from-auto periods, blocked weekdays, and weeks where the
// eligible pool is too small to cover dutiesPerDay × 7 slots.
import type { User, ScheduleEntry, UserAbsenceStatus } from '../types';
import { getStatusPeriodsInRange } from './userStatus';
import { isExcludedFromAutoOnDate } from './userExcludeFromAuto';
import { getBlockedDaysPeriods, isDateBlockedByPeriod } from './userBlockedDays';
import { getEligibleUsersForWeek, getWeekWindow } from '../services/autoScheduler/helpers';
import { getWeeklyDutyTarget, isStaffDuty } from './staffDuty';

export interface StatusOverlapInfo {
  userName: string;
  status: UserAbsenceStatus;
  from?: string;
  to?: string;
}

export interface ExcludedUserInfo {
  userName: string;
  /** Window dates on which the user is excluded from auto-distribution. */
  dates: string[];
  /** True when the exclusion covers every date of the window. */
  coversWholeWindow: boolean;
}

export interface BlockedDaysInfo {
  userName: string;
  /** ISO weekdays (1=Mon…7=Sun) blocked inside the window. */
  dows: number[];
  /** Window dates blocked for this user. */
  dates: string[];
}

export interface LowPoolWeekInfo {
  weekFrom: string;
  weekTo: string;
  eligibleCount: number;
  requiredCount: number;
  /** Скільки нарядів тиждень реально покриває з урахуванням норм штатних чергових. */
  weeklyCapacity: number;
  /** Скільки з доступних — штатні чергові (вони закривають по 2–4 наряди). */
  staffCount: number;
}

export interface PreGenerationSummary {
  windowFrom: string;
  windowTo: string;
  statusOverlaps: StatusOverlapInfo[];
  excludedUsers: ExcludedUserInfo[];
  blockedUsers: BlockedDaysInfo[];
  lowPoolWeeks: LowPoolWeekInfo[];
  hasWarnings: boolean;
}

const toIsoDow = (jsDow: number): number => (jsDow === 0 ? 7 : jsDow);

/** Users whose statuses/exclusions/blocks matter for auto-generation. */
const isRelevantUser = (u: User): boolean => Boolean(u.id && u.isActive && !u.isExtra);

export const buildPreGenerationSummary = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dates: string[],
  dutiesPerDay: number
): PreGenerationSummary => {
  const sortedDates = [...dates].sort();
  const windowFrom = sortedDates[0] ?? '';
  const windowTo = sortedDates[sortedDates.length - 1] ?? '';
  const relevantUsers = users.filter(isRelevantUser);

  // (1) Status periods (VACATION / TRIP / SICK / ABSENT) overlapping the window
  const statusOverlaps: StatusOverlapInfo[] = [];
  for (const user of relevantUsers) {
    for (const period of getStatusPeriodsInRange(user, windowFrom, windowTo)) {
      statusOverlaps.push({
        userName: user.name,
        status: period.status,
        from: period.from,
        to: period.to,
      });
    }
  }

  // (2) Exclude-from-auto periods active on any window date
  const excludedUsers: ExcludedUserInfo[] = [];
  for (const user of relevantUsers) {
    const excludedDates = sortedDates.filter((d) => isExcludedFromAutoOnDate(user, d));
    if (excludedDates.length > 0) {
      excludedUsers.push({
        userName: user.name,
        dates: excludedDates,
        coversWholeWindow: excludedDates.length === sortedDates.length,
      });
    }
  }

  // (3) Blocked weekdays active in the window
  const blockedUsers: BlockedDaysInfo[] = [];
  for (const user of relevantUsers) {
    if (getBlockedDaysPeriods(user).length === 0) continue;
    const blockedDates = sortedDates.filter((d) => isDateBlockedByPeriod(user, d));
    if (blockedDates.length === 0) continue;
    const dows = [...new Set(blockedDates.map((d) => toIsoDow(new Date(d).getDay())))].sort(
      (a, b) => a - b
    );
    blockedUsers.push({ userName: user.name, dows, dates: blockedDates });
  }

  // (4) Weeks where the eligible pool cannot cover dutiesPerDay × 7 slots.
  //     Місткість рахується за тижневими нормами: звичайний боєць закриває 1 наряд,
  //     штатний черговий — свої 2–4, інакше попередження спрацьовує хибно.
  const requiredCount = dutiesPerDay * 7;
  const lowPoolWeeks: LowPoolWeekInfo[] = [];
  const seenWeeks = new Set<string>();
  for (const date of sortedDates) {
    const week = getWeekWindow(date);
    if (seenWeeks.has(week.from)) continue;
    seenWeeks.add(week.from);
    const eligible = getEligibleUsersForWeek(users, schedule, date);
    const weeklyCapacity = eligible.reduce((sum, u) => sum + getWeeklyDutyTarget(u), 0);
    if (weeklyCapacity < requiredCount) {
      lowPoolWeeks.push({
        weekFrom: week.from,
        weekTo: week.to,
        eligibleCount: eligible.length,
        requiredCount,
        weeklyCapacity,
        staffCount: eligible.filter(isStaffDuty).length,
      });
    }
  }

  return {
    windowFrom,
    windowTo,
    statusOverlaps,
    excludedUsers,
    blockedUsers,
    lowPoolWeeks,
    hasWarnings:
      statusOverlaps.length > 0 ||
      excludedUsers.length > 0 ||
      blockedUsers.length > 0 ||
      lowPoolWeeks.length > 0,
  };
};
