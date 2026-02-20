// src/services/scheduleService.ts

import { db } from '../db/db';
import type { ScheduleEntry, User, DayWeights } from '../types';
import * as userService from './userService';
import { toAssignedUserIds } from '../utils/assignment';

/**
 * Service for managing schedule
 */

/**
 * Get all schedule entries
 */
export const getAllSchedule = async (): Promise<Record<string, ScheduleEntry>> => {
  const array = await db.schedule.toArray();
  const obj: Record<string, ScheduleEntry> = {};
  array.forEach((item) => (obj[item.date] = item));
  return obj;
};

/**
 * Get schedule entry by date
 */
export const getScheduleByDate = async (date: string): Promise<ScheduleEntry | undefined> => {
  return await db.schedule.get(date);
};

/**
 * Create or update schedule entry
 */
export const saveScheduleEntry = async (entry: ScheduleEntry): Promise<string> => {
  return await db.schedule.put(entry);
};

/**
 * Delete schedule entry
 */
export const deleteScheduleEntry = async (date: string): Promise<void> => {
  await db.schedule.delete(date);
};

/**
 * Remove assignment with optional karma handling.
 * reason='request' → karma decreases + owedDays for that day-of-week incremented
 * reason='work' → no karma change (official reason)
 */
export const removeAssignmentWithDebt = async (
  date: string,
  reason: 'request' | 'work',
  dayWeights: DayWeights,
  targetUserId?: number
): Promise<void> => {
  await db.transaction('rw', db.schedule, db.users, async () => {
    const entry = await db.schedule.get(date);
    if (!entry || !entry.userId) return;
    const assignedIds = toAssignedUserIds(entry.userId);
    if (assignedIds.length === 0) return;

    const removedIds =
      typeof targetUserId === 'number'
        ? assignedIds.filter((id) => id === targetUserId)
        : [assignedIds[0]];
    if (removedIds.length === 0) return;

    if (reason === 'request') {
      const dayIdx = new Date(date).getDay();
      const weight = dayWeights[dayIdx] || 1.0;
      for (const userId of removedIds) {
        // Karma goes negative (general fairness)
        await userService.updateUserDebt(userId, -weight);
        // Must repay THIS specific day of week
        await userService.updateOwedDays(userId, dayIdx, 1);
      }
    }

    const remaining = assignedIds.filter((id) => !removedIds.includes(id));
    if (remaining.length === 0) {
      await db.schedule.delete(date);
    } else {
      await db.schedule.put({
        ...entry,
        userId: remaining.length === 1 ? remaining[0] : remaining,
      });
    }
  });
};

/**
 * Bulk delete schedule entries
 */
export const bulkDeleteSchedule = async (dates: string[]): Promise<void> => {
  await db.schedule.bulkDelete(dates);
};

/**
 * Bulk save schedule entries
 */
export const bulkSaveSchedule = async (entries: ScheduleEntry[]): Promise<void> => {
  await db.schedule.bulkPut(entries);
};

/**
 * Get schedule entries for a user
 */
export const getUserSchedule = async (userId: number): Promise<ScheduleEntry[]> => {
  return (await db.schedule.toArray()).filter((entry) => isAssignedTo(entry, userId));
};

/**
 * Get schedule entries for a date range
 */
export const getScheduleRange = async (
  startDate: string,
  endDate: string
): Promise<ScheduleEntry[]> => {
  return (await db.schedule.toArray()).filter(
    (entry) => entry.date >= startDate && entry.date <= endDate
  );
};

/**
 * Calculate total load for a user
 */
/**
 * Helper: check if a schedule entry is assigned to a given userId
 * (handles both single number and number[] userId)
 */
const isAssignedTo = (entry: ScheduleEntry, userId: number): boolean => {
  if (Array.isArray(entry.userId)) return entry.userId.includes(userId);
  return entry.userId === userId;
};

export const calculateUserLoad = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  fromDate?: string
): number => {
  const assignments = Object.values(schedule).filter(
    (s) => isAssignedTo(s, userId) && (!fromDate || s.date >= fromDate)
  );
  let load = 0;
  assignments.forEach((s) => {
    const day = new Date(s.date).getDay();
    load += dayWeights[day] || 1.0;
  });
  return load;
};

/**
 * Count how many times a user is assigned to each day of the week
 */
export const countUserDaysOfWeek = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  fromDate?: string
): Record<number, number> => {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  Object.values(schedule).forEach((s) => {
    if (isAssignedTo(s, userId) && (!fromDate || s.date >= fromDate)) {
      const day = new Date(s.date).getDay();
      counts[day]++;
    }
  });
  return counts;
};

/**
 * Count total assignments for a user
 */
export const countUserAssignments = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  fromDate?: string
): number => {
  return Object.values(schedule).filter(
    (s) => isAssignedTo(s, userId) && (!fromDate || s.date >= fromDate)
  ).length;
};

/**
 * Calculate effective load (real load + debt/karma)
 */
export const calculateEffectiveLoad = (
  user: User,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): number => {
  if (!user.id) return 0;
  const realLoad = calculateUserLoad(user.id, schedule, dayWeights);
  return realLoad + (user.debt || 0);
};

/**
 * Find conflicts in schedule (users assigned when unavailable)
 */
export const findScheduleConflicts = (
  schedule: Record<string, ScheduleEntry>,
  users: User[],
  startDate?: string
): string[] => {
  const conflicts: string[] = [];

  Object.entries(schedule).forEach(([date, entry]) => {
    if (startDate && date < startDate) return;
    if (!entry.userId) return;

    const userIds = toAssignedUserIds(entry.userId);
    const hasConflict = userIds.some((userId) => {
      const user = users.find((u) => u.id === userId);
      if (!user) return true;
      return !userService.isUserAvailable(user, date, schedule);
    });
    if (hasConflict) {
      conflicts.push(date);
    }
  });

  return conflicts;
};

/**
 * Find gaps in schedule (dates without assignments)
 */
export const findScheduleGaps = (
  schedule: Record<string, ScheduleEntry>,
  dates: string[],
  dutiesPerDay = 1
): string[] => {
  return dates.filter((d) => {
    const entry = schedule[d];
    if (!entry) return true;
    return toAssignedUserIds(entry.userId).length < dutiesPerDay;
  });
};

/**
 * Clear all schedule
 */
export const clearAllSchedule = async (): Promise<void> => {
  await db.schedule.clear();
};

/**
 * Get schedule statistics
 */
export const getScheduleStats = (
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
) => {
  const entries = Object.values(schedule);
  const total = entries.length;
  const manual = entries.filter((e) => e.type === 'manual').length;
  const auto = entries.filter((e) => e.type === 'auto').length;
  const critical = entries.filter((e) => e.type === 'critical').length;
  const locked = entries.filter((e) => e.isLocked).length;

  let totalLoad = 0;
  entries.forEach((e) => {
    const day = new Date(e.date).getDay();
    totalLoad += dayWeights[day] || 1.0;
  });

  return {
    total,
    manual,
    auto,
    critical,
    locked,
    totalLoad: totalLoad.toFixed(1),
  };
};

/**
 * Lock/unlock schedule entry
 */
export const toggleScheduleLock = async (date: string, locked: boolean): Promise<void> => {
  const entry = await db.schedule.get(date);
  if (entry) {
    await db.schedule.update(date, { isLocked: locked });
  }
};

/**
 * Get all locked dates
 */
export const getLockedDates = async (): Promise<string[]> => {
  const all = await db.schedule.toArray();
  return all.filter((e) => e.isLocked).map((e) => e.date);
};

/**
 * Calculate karma change when manually moving assignment from one day to another.
 * If moved to a harder day (higher weight) → positive karma (reward).
 * If moved to an easier day → negative karma (penalty).
 * Returns the karma delta to add to user's debt.
 */
export const calculateKarmaForTransfer = (
  fromDate: string,
  toDate: string,
  dayWeights: DayWeights
): number => {
  const fromDay = new Date(fromDate).getDay();
  const toDay = new Date(toDate).getDay();

  const fromWeight = dayWeights[fromDay] || 1.0;
  const toWeight = dayWeights[toDay] || 1.0;

  // Positive karma if taking on harder duty, negative if easier
  return Number((toWeight - fromWeight).toFixed(2));
};

/**
 * Apply karma when manually transferring a user from one date to another.
 * This should be called from UI when drag-and-drop or manual reassignment happens.
 */
export const applyKarmaForTransfer = async (
  userId: number,
  fromDate: string,
  toDate: string,
  dayWeights: DayWeights
): Promise<void> => {
  const karma = calculateKarmaForTransfer(fromDate, toDate, dayWeights);

  if (karma !== 0) {
    await userService.updateUserDebt(userId, karma);
  }
};
