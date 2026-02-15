// src/services/scheduleService.ts

import { db } from '../db/db';
import type { ScheduleEntry, User, DayWeights } from '../types';
import * as userService from './userService';

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
 * reason='request' → karma decreases by day weight (soldier asked to be removed — owes system)
 * reason='work' → no karma change (official reason)
 */
export const removeAssignmentWithDebt = async (
  date: string,
  reason: 'request' | 'work',
  dayWeights: DayWeights
): Promise<void> => {
  const entry = await db.schedule.get(date);
  if (!entry || !entry.userId) return;

  if (reason === 'request') {
    const dayIdx = new Date(date).getDay();
    const weight = dayWeights[dayIdx] || 1.0;
    await userService.updateUserDebt(entry.userId, -weight); // karma goes negative
  }

  await db.schedule.delete(date);
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
  return (await db.schedule.toArray()).filter((entry) => entry.userId === userId);
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
export const calculateUserLoad = (
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): number => {
  const assignments = Object.values(schedule).filter((s) => s.userId === userId);
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
  schedule: Record<string, ScheduleEntry>
): Record<number, number> => {
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  Object.values(schedule).forEach((s) => {
    if (s.userId === userId) {
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
  schedule: Record<string, ScheduleEntry>
): number => {
  return Object.values(schedule).filter((s) => s.userId === userId).length;
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

    const user = users.find((u) => u.id === entry.userId);
    if (!user) return;

    // Import availability check from userService
    if (!user.isActive) {
      conflicts.push(date);
      return;
    }

    if (user.status === 'ACTIVE') return;

    if (user.statusFrom || user.statusTo) {
      const from = user.statusFrom || '0000-01-01';
      const to = user.statusTo || '9999-12-31';

      if (date >= from && date <= to) {
        conflicts.push(date);
      }
    }
  });

  return conflicts;
};

/**
 * Find gaps in schedule (dates without assignments)
 */
export const findScheduleGaps = (
  schedule: Record<string, ScheduleEntry>,
  dates: string[]
): string[] => {
  return dates.filter((d) => !schedule[d]);
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
