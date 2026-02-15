// src/services/autoScheduler.ts

import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { isUserAvailable } from './userService';
import { calculateUserLoad } from './scheduleService';

/**
 * Service for automatic schedule generation
 */

interface AutoScheduleOptions {
  avoidConsecutiveDays?: boolean;
  respectOwedDays?: boolean;
  considerLoad?: boolean;
}

/**
 * Automatically fill schedule gaps
 */
export const autoFillSchedule = async (
  targetDates: string[],
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions = {
    avoidConsecutiveDays: true,
    respectOwedDays: true,
    considerLoad: true,
  }
): Promise<ScheduleEntry[]> => {
  const updates: ScheduleEntry[] = [];
  const tempSchedule = { ...schedule };

  // Remove target dates from temp schedule
  targetDates.forEach((d) => delete tempSchedule[d]);

  // Track temporary load offsets
  const tempLoadOffset: Record<number, number> = {};
  users.forEach((u) => {
    if (u.id) tempLoadOffset[u.id] = 0;
  });

  const todayStr = toLocalISO(new Date());

  for (const dateStr of targetDates) {
    // Skip past dates
    if (dateStr < todayStr) continue;

    // Skip locked entries
    if (schedule[dateStr]?.isLocked) {
      tempSchedule[dateStr] = schedule[dateStr];
      continue;
    }

    const dayIdx = new Date(dateStr).getDay();
    const weight = dayWeights[dayIdx] || 1.0;

    // Get available users
    const pool = users.filter((u) => u.isActive && isUserAvailable(u, dateStr));

    // Sort by priority
    pool.sort((a, b) => {
      if (!a.id || !b.id) return 0;

      // Priority 1: Owed Days (debt for specific day)
      if (options.respectOwedDays) {
        const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
        const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
        if (oweA !== oweB) return oweB - oweA;
      }

      // Priority 2: Total load + karma
      if (options.considerLoad) {
        const loadA = calculateUserLoad(a.id, tempSchedule, dayWeights) + tempLoadOffset[a.id];
        const loadB = calculateUserLoad(b.id, tempSchedule, dayWeights) + tempLoadOffset[b.id];
        return loadA - loadB;
      }

      return 0;
    });

    // Avoid consecutive days if enabled
    let selected = pool[0];
    if (options.avoidConsecutiveDays && selected) {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevUser = tempSchedule[toLocalISO(prevDate)]?.userId;

      if (selected.id === prevUser && pool.length > 1) {
        selected = pool[1];
      }
    }

    // Assign selected user
    if (selected && selected.id) {
      const entry: ScheduleEntry = {
        date: dateStr,
        userId: selected.id,
        type: 'auto',
      };
      updates.push(entry);
      tempSchedule[dateStr] = entry;
      tempLoadOffset[selected.id] += weight;
    } else {
      // No available users - mark as critical
      updates.push({
        date: dateStr,
        userId: null,
        type: 'critical',
      });
    }
  }

  return updates;
};

/**
 * Save auto-generated schedule and update owed days
 */
export const saveAutoSchedule = async (entries: ScheduleEntry[]): Promise<void> => {
  await db.transaction('rw', db.schedule, db.users, async () => {
    for (const entry of entries) {
      await db.schedule.put(entry);

      // Update owed days if user was assigned
      if (entry.userId) {
        const user = await db.users.get(entry.userId);
        const dayIdx = new Date(entry.date).getDay();

        if (user && user.owedDays && user.owedDays[dayIdx] > 0) {
          user.owedDays[dayIdx]--;
          await db.users.update(user.id!, { owedDays: user.owedDays });
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
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): User[] => {
  const dayIndex = new Date(dateStr).getDay();

  // Get IDs of users already assigned this week
  const assignedIds = new Set(weekDates.map((d) => schedule[d]?.userId).filter((id) => id));

  // Filter available users and sort by priority
  return users
    .filter((u) => !assignedIds.has(u.id!) && isUserAvailable(u, dateStr))
    .sort((a, b) => {
      // Priority 1: Owed Days
      const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
      const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
      if (oweA !== oweB) return oweB - oweA;

      // Priority 2: Effective load
      const loadA = calculateUserLoad(a.id!, schedule, dayWeights) + (a.debt || 0);
      const loadB = calculateUserLoad(b.id!, schedule, dayWeights) + (b.debt || 0);
      return loadA - loadB;
    });
};

/**
 * Recalculate schedule from a specific date
 */
export const recalculateScheduleFrom = async (
  startDate: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
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
    if (!schedule[iso] || !schedule[iso].isLocked) {
      datesToRegen.push(iso);
    }
    d.setDate(d.getDate() + 1);
  }

  // Delete unlocked entries
  await db.schedule.bulkDelete(datesToRegen);

  // Regenerate
  const updates = await autoFillSchedule(datesToRegen, users, schedule, dayWeights);
  await saveAutoSchedule(updates);
};

/**
 * Calculate optimal assignment for a date
 */
export const calculateOptimalAssignment = (
  dateStr: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights
): User | null => {
  const dayIdx = new Date(dateStr).getDay();
  const available = users.filter((u) => u.isActive && isUserAvailable(u, dateStr));

  if (available.length === 0) return null;

  // Sort by priority
  available.sort((a, b) => {
    if (!a.id || !b.id) return 0;

    const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
    const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
    if (oweA !== oweB) return oweB - oweA;

    const loadA = calculateUserLoad(a.id, schedule, dayWeights) + (a.debt || 0);
    const loadB = calculateUserLoad(b.id, schedule, dayWeights) + (b.debt || 0);
    return loadA - loadB;
  });

  return available[0];
};
