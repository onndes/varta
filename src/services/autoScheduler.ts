// src/services/autoScheduler.ts

import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { isUserAvailable } from './userService';
import { calculateUserLoad, countUserDaysOfWeek, countUserAssignments } from './scheduleService';

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

    // Get available users (exclude isExtra and excludeFromAuto users from automatic scheduling)
    let pool = users.filter(
      (u) =>
        u.isActive && !u.isExtra && !u.excludeFromAuto && isUserAvailable(u, dateStr, tempSchedule)
    );

    // Sort by priority (ladder + fairness algorithm)
    pool.sort((a, b) => {
      if (!a.id || !b.id) return 0;

      // Priority 1: Owed Days (debt for specific day of week)
      if (options.respectOwedDays) {
        const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
        const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
        if (oweA !== oweB) return oweB - oweA;
      }

      if (options.considerLoad) {
        // Priority 2: Day-of-week balance ("ladder" principle)
        // Prefer user who has fewer assignments on THIS specific day of week
        const dowA = countUserDaysOfWeek(a.id, tempSchedule)[dayIdx] || 0;
        const dowB = countUserDaysOfWeek(b.id, tempSchedule)[dayIdx] || 0;
        if (dowA !== dowB) return dowA - dowB;

        // Priority 3: Total assignment count (overall fairness)
        const totalA = countUserAssignments(a.id, tempSchedule) + tempLoadOffset[a.id];
        const totalB = countUserAssignments(b.id, tempSchedule) + tempLoadOffset[b.id];
        if (totalA !== totalB) return totalA - totalB;

        // Priority 4: Weighted load + debt (fine-grained balance)
        const loadA =
          calculateUserLoad(a.id, tempSchedule, dayWeights) + tempLoadOffset[a.id] + (a.debt || 0);
        const loadB =
          calculateUserLoad(b.id, tempSchedule, dayWeights) + tempLoadOffset[b.id] + (b.debt || 0);
        return loadA - loadB;
      }

      return 0;
    });

    // Avoid consecutive days: filter out users who were on duty yesterday (rest day)
    if (options.avoidConsecutiveDays) {
      const prevDate = new Date(dateStr);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevUserId = tempSchedule[toLocalISO(prevDate)]?.userId;

      if (prevUserId) {
        const filtered = pool.filter((u) => u.id !== prevUserId);
        // Only use filtered list if it's not empty (avoid leaving day unassigned)
        if (filtered.length > 0) {
          pool = filtered;
        }
      }
    }

    // Assign selected user (best from filtered pool)
    const selected = pool[0];
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
 * Save auto-generated schedule and update owed days + karma.
 * Karma restores towards 0 only when an owedDay is repaid (same day-of-week).
 */
export const saveAutoSchedule = async (
  entries: ScheduleEntry[],
  dayWeights: DayWeights
): Promise<void> => {
  await db.transaction('rw', db.schedule, db.users, async () => {
    for (const entry of entries) {
      await db.schedule.put(entry);

      if (entry.userId) {
        // Handle both single userId and array of userIds (for multiple duties per day)
        const userIds = Array.isArray(entry.userId) ? entry.userId : [entry.userId];

        for (const userId of userIds) {
          const user = await db.users.get(userId);
          if (!user) continue;

          const dayIdx = new Date(entry.date).getDay();

          // If user owes THIS day of week — repay it and restore karma
          if (user.owedDays && user.owedDays[dayIdx] > 0) {
            user.owedDays[dayIdx]--;
            await db.users.update(user.id!, { owedDays: user.owedDays });

            // Restore karma by the weight of this day (owed day repaid)
            if (user.debt < 0) {
              const weight = dayWeights[dayIdx] || 1.0;
              const newDebt = Math.min(0, Number((user.debt + weight).toFixed(2)));
              await db.users.update(user.id!, { debt: newDebt });
            }
          }
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

  // Filter available users and sort by priority (ladder + fairness)
  // Exclude isExtra and excludeFromAuto users from automatic scheduling
  return users
    .filter(
      (u) =>
        !u.isExtra &&
        !u.excludeFromAuto &&
        !assignedIds.has(u.id!) &&
        isUserAvailable(u, dateStr, schedule)
    )
    .sort((a, b) => {
      // Priority 1: Owed Days
      const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
      const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
      if (oweA !== oweB) return oweB - oweA;

      // Priority 2: Day-of-week balance ("ladder")
      const dowA = countUserDaysOfWeek(a.id!, schedule)[dayIndex] || 0;
      const dowB = countUserDaysOfWeek(b.id!, schedule)[dayIndex] || 0;
      if (dowA !== dowB) return dowA - dowB;

      // Priority 3: Total assignments
      const totalA = countUserAssignments(a.id!, schedule);
      const totalB = countUserAssignments(b.id!, schedule);
      if (totalA !== totalB) return totalA - totalB;

      // Priority 4: Effective load
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
  await saveAutoSchedule(updates, dayWeights);
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

  // Sort by priority (ladder + fairness)
  available.sort((a, b) => {
    if (!a.id || !b.id) return 0;

    const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
    const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
    if (oweA !== oweB) return oweB - oweA;

    // Day-of-week balance
    const dowA = countUserDaysOfWeek(a.id, schedule)[dayIdx] || 0;
    const dowB = countUserDaysOfWeek(b.id, schedule)[dayIdx] || 0;
    if (dowA !== dowB) return dowA - dowB;

    // Total assignments
    const totalA = countUserAssignments(a.id, schedule);
    const totalB = countUserAssignments(b.id, schedule);
    if (totalA !== totalB) return totalA - totalB;

    const loadA = calculateUserLoad(a.id, schedule, dayWeights) + (a.debt || 0);
    const loadB = calculateUserLoad(b.id, schedule, dayWeights) + (b.debt || 0);
    return loadA - loadB;
  });

  return available[0];
};
