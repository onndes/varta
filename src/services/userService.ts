// src/services/userService.ts

import { db } from '../db/db';
import type { User, ScheduleEntry } from '../types';
import { MAX_DEBT } from '../utils/constants';

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
 * Delete user
 */
export const deleteUser = async (id: number): Promise<void> => {
  await db.users.delete(id);
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
    if (user.blockedDays.includes(dayOfWeek)) return false;
  }

  if (user.status === 'ACTIVE') {
    // Still need to check rest day after duty if schedule provided
    if (schedule && user.id) {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevEntry = schedule[prevDateStr];
      if (prevEntry?.userId === user.id) return false; // Rest day after duty
    }
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
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      if (dateStr === dayBeforeStr) return false;
    }

    // Check rest day after status
    if (user.restAfterStatus && user.statusTo) {
      const endDate = new Date(user.statusTo);
      const nextDay = new Date(endDate);
      nextDay.setDate(endDate.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      if (dateStr === nextDayStr) return false;
    }

    // Check rest day after last duty (if schedule provided)
    if (schedule && user.id) {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];
      const prevEntry = schedule[prevDateStr];
      if (prevEntry?.userId === user.id) return false; // Rest day after duty
    }

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

    // Check day before status
    if (user.statusFrom) {
      const dayBefore = new Date(user.statusFrom);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];
      if (dateStr === dayBeforeStr) return 'PRE_STATUS_DAY';
    }

    // Check rest day after
    if (user.restAfterStatus && user.statusTo) {
      const endDate = new Date(user.statusTo);
      const nextDay = new Date(endDate);
      nextDay.setDate(endDate.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
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
