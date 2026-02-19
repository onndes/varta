// src/services/userService.ts

import { db } from '../db/db';
import type { User, ScheduleEntry } from '../types';
import { MAX_DEBT } from '../utils/constants';
import { toLocalISO } from '../utils/dateUtils';

/**
 * Service for managing users
 */

/**
 * Get all users
 */
export const getAllUsers = async (): Promise<User[]> => {
  return await db.users.toArray();
};

/**
 * Get user by ID
 */
export const getUserById = async (id: number): Promise<User | undefined> => {
  return await db.users.get(id);
};

/**
 * Create new user
 */
export const createUser = async (user: Omit<User, 'id'>): Promise<number | undefined> => {
  return await db.users.add(user);
};

/**
 * Update user
 */
export const updateUser = async (id: number, updates: Partial<User>): Promise<number> => {
  return await db.users.update(id, updates);
};

/**
 * Delete user and clean up their future schedule entries
 */
export const deleteUser = async (id: number): Promise<string[]> => {
  // Find and remove future schedule entries for this user
  const todayStr = toLocalISO(new Date());
  const allSchedule = await db.schedule.toArray();
  const orphanedDates = allSchedule
    .filter((entry) => {
      const userId = Array.isArray(entry.userId) ? entry.userId : [entry.userId];
      return userId.includes(id) && entry.date >= todayStr;
    })
    .map((entry) => entry.date);

  if (orphanedDates.length > 0) {
    await db.schedule.bulkDelete(orphanedDates);
  }

  await db.users.delete(id);
  return orphanedDates;
};

/**
 * Reset user debt (karma) to 0
 */
export const resetUserDebt = async (id: number): Promise<void> => {
  await db.users.update(id, { debt: 0 });
};

/**
 * Update user debt/karma (capped at -MAX_DEBT..0 range for negative, uncapped for positive)
 * Negative = soldier owes system (was removed by request)
 * Positive = soldier helped out (manually assigned to harder day)
 */
export const updateUserDebt = async (id: number, amount: number): Promise<void> => {
  const user = await db.users.get(id);
  if (user) {
    const rawDebt = Number(((user.debt || 0) + amount).toFixed(2));
    const newDebt = Math.max(-MAX_DEBT, rawDebt);
    await db.users.update(id, { debt: newDebt });
  }
};

/**
 * Update owed days for user
 */
export const updateOwedDays = async (
  id: number,
  dayIndex: number,
  increment: number
): Promise<void> => {
  const user = await db.users.get(id);
  if (user) {
    const owedDays = user.owedDays || {};
    owedDays[dayIndex] = (owedDays[dayIndex] || 0) + increment;
    await db.users.update(id, { owedDays });
  }
};

/**
 * Check if user is available on a specific date
 * Now also checks for rest day after previous duty
 */
export const isUserAvailable = (
  user: User,
  dateStr: string,
  schedule?: Record<string, ScheduleEntry>
): boolean => {
  if (!user.isActive) return false;

  // Check if day of week is blocked
  if (user.blockedDays && user.blockedDays.length > 0) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const dayIdx = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to 1=Mon...7=Sun
    if (user.blockedDays.includes(dayIdx)) return false;
  }

  // Helper: check if previous day was assigned to this user (rest day after duty)
  const isPrevDayAssigned = (): boolean => {
    if (!schedule || !user.id) return false;
    const prevDate = new Date(dateStr);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevEntry = schedule[toLocalISO(prevDate)];
    if (!prevEntry?.userId) return false;
    return Array.isArray(prevEntry.userId)
      ? prevEntry.userId.includes(user.id)
      : prevEntry.userId === user.id;
  };

  if (user.status === 'ACTIVE') {
    // Still need to check rest day after duty if schedule provided
    if (isPrevDayAssigned()) return false;
    return true;
  }

  if (user.statusFrom || user.statusTo) {
    const from = user.statusFrom || '0000-01-01';
    const to = user.statusTo || '9999-12-31';

    if (dateStr >= from && dateStr <= to) return false;

    // Check day before status ONLY if restBeforeStatus flag is set
    if (user.restBeforeStatus && user.statusFrom) {
      const dayBefore = new Date(user.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = toLocalISO(dayBefore);
      if (dateStr === dayBeforeStr) return false;
    }

    // Check rest day after status
    if (user.restAfterStatus && user.statusTo) {
      const endDate = new Date(user.statusTo);
      const nextDay = new Date(endDate);
      nextDay.setDate(endDate.getDate() + 1);
      const nextDayStr = toLocalISO(nextDay);
      if (dateStr === nextDayStr) return false;
    }

    // Check rest day after last duty (if schedule provided)
    if (isPrevDayAssigned()) return false;

    return true;
  }

  return false;
};

/**
 * Get user availability status
 */
export const getUserAvailabilityStatus = (
  user: User,
  dateStr: string
): 'AVAILABLE' | 'UNAVAILABLE' | 'STATUS_BUSY' | 'PRE_STATUS_DAY' | 'REST_DAY' => {
  if (!user.isActive) return 'UNAVAILABLE';
  if (user.status === 'ACTIVE') return 'AVAILABLE';

  if (user.statusFrom || user.statusTo) {
    const from = user.statusFrom || '0000-01-01';
    const to = user.statusTo || '9999-12-31';

    if (dateStr >= from && dateStr <= to) return 'STATUS_BUSY';

    // Check day before status ONLY if restBeforeStatus flag is set
    if (user.restBeforeStatus && user.statusFrom) {
      const dayBefore = new Date(user.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = toLocalISO(dayBefore);
      if (dateStr === dayBeforeStr) return 'PRE_STATUS_DAY';
    }

    // Check rest day after
    if (user.restAfterStatus && user.statusTo) {
      const endDate = new Date(user.statusTo);
      const nextDay = new Date(endDate);
      nextDay.setDate(endDate.getDate() + 1);
      const nextDayStr = toLocalISO(nextDay);
      if (dateStr === nextDayStr) return 'REST_DAY';
    }

    return 'AVAILABLE';
  }

  return 'UNAVAILABLE';
};

/**
 * Bulk create users
 */
export const bulkCreateUsers = async (users: Omit<User, 'id'>[]): Promise<void> => {
  await db.users.bulkAdd(users);
};

/**
 * Clear all users
 */
export const clearAllUsers = async (): Promise<void> => {
  await db.users.clear();
};
