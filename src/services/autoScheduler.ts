// src/services/autoScheduler.ts

import { db } from '../db/db';
import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { getPoolCommonFrom } from '../utils/fairness';
import { isUserAvailable } from './userService';
import { calculateUserLoad, countUserDaysOfWeek, countUserAssignments } from './scheduleService';

/**
 * Service for automatic schedule generation
 */

const getScheduleStart = (
  schedule: Record<string, ScheduleEntry>,
  fallbackDate: string
): string => {
  const dates = Object.keys(schedule).sort();
  return dates[0] || fallbackDate;
};

const getPrevDateStr = (dateStr: string): string => {
  const prev = new Date(dateStr);
  prev.setDate(prev.getDate() - 1);
  return toLocalISO(prev);
};

const isHardUnavailable = (user: User, dateStr: string): boolean => {
  if (!user.isActive) return true;
  if (user.status === 'VACATION' || user.status === 'TRIP' || user.status === 'SICK') {
    const from = user.statusFrom || '0000-01-01';
    const to = user.statusTo || '9999-12-31';
    if (dateStr >= from && dateStr <= to) return true;
  }
  return false;
};

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
    if ((dayIdx === undefined || cursor.getDay() === dayIdx) && !isHardUnavailable(user, iso)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
};

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
    minRestDays: 1,
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

    // Compute pool-wide baseline date: assignments before the newest member joined are ignored
    const poolCommonFrom = getPoolCommonFrom(pool, dateStr);
    const compareFrom = poolCommonFrom || getScheduleStart(tempSchedule, dateStr);
    const compareTo = getPrevDateStr(dateStr);

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
        // Priority 2: Day-of-week balance normalized by availability in this weekday.
        const dowA = countUserDaysOfWeek(a.id, tempSchedule, compareFrom)[dayIdx] || 0;
        const dowB = countUserDaysOfWeek(b.id, tempSchedule, compareFrom)[dayIdx] || 0;
        const dowAvailA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo, dayIdx));
        const dowAvailB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo, dayIdx));
        const dowRateA = dowA / dowAvailA;
        const dowRateB = dowB / dowAvailB;
        if (dowRateA !== dowRateB) return dowRateA - dowRateB;

        // Priority 3: Total assignment count normalized by availability in window.
        const totalA =
          countUserAssignments(a.id, tempSchedule, compareFrom) + tempLoadOffset[a.id];
        const totalB =
          countUserAssignments(b.id, tempSchedule, compareFrom) + tempLoadOffset[b.id];
        const availA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo));
        const availB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo));
        const totalRateA = totalA / availA;
        const totalRateB = totalB / availB;
        if (totalRateA !== totalRateB) return totalRateA - totalRateB;

        // Priority 4: Weighted load normalized by availability + debt (fine-grained balance)
        const loadA =
          calculateUserLoad(a.id, tempSchedule, dayWeights, compareFrom) +
          tempLoadOffset[a.id] +
          (a.debt || 0);
        const loadB =
          calculateUserLoad(b.id, tempSchedule, dayWeights, compareFrom) +
          tempLoadOffset[b.id] +
          (b.debt || 0);
        return loadA / availA - loadB / availB;
      }

      return 0;
    });

    // Avoid consecutive days: filter out users who were on duty in the last N days (rest period)
    // minRestDays: 1 = no consecutive (check yesterday), 2 = one day gap (check last 2 days), etc.
    if (options.avoidConsecutiveDays) {
      const minRest = options.minRestDays || 1;
      
      // Collect userIds assigned in the last N days
      const recentUserIds = new Set<number>();
      for (let i = 1; i <= minRest; i++) {
        const checkDate = new Date(dateStr);
        checkDate.setDate(checkDate.getDate() - i);
        const rawId = tempSchedule[toLocalISO(checkDate)]?.userId;
        if (rawId) {
          const ids = Array.isArray(rawId) ? rawId : [rawId];
          ids.forEach(id => recentUserIds.add(id));
        }
      }

      if (recentUserIds.size > 0) {
        const filtered = pool.filter((u) => !recentUserIds.has(u.id!));
        // Only use filtered list if it's not empty (fallback to original pool if no one available)
        if (filtered.length > 0) {
          pool = filtered;
        }
        // If filtered is empty, keep original pool - this means we can't respect minRestDays
        // but at least the day will be filled
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
  const filtered = users.filter(
    (u) =>
      !u.isExtra &&
      !u.excludeFromAuto &&
      !assignedIds.has(u.id!) &&
      isUserAvailable(u, dateStr, schedule)
  );

  // Pool-wide baseline: ignore assignments before the newest pool member joined
  const poolCommonFrom = getPoolCommonFrom(filtered, dateStr);
  const compareFrom = poolCommonFrom || getScheduleStart(schedule, dateStr);
  const compareTo = getPrevDateStr(dateStr);

  return filtered.sort((a, b) => {
    // Priority 1: Owed Days
    const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
    const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
    if (oweA !== oweB) return oweB - oweA;

    // Priority 2: Day-of-week balance ("ladder"), availability-normalized
    const dowA = countUserDaysOfWeek(a.id!, schedule, compareFrom)[dayIndex] || 0;
    const dowB = countUserDaysOfWeek(b.id!, schedule, compareFrom)[dayIndex] || 0;
    const dowAvailA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo, dayIndex));
    const dowAvailB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo, dayIndex));
    const dowRateA = dowA / dowAvailA;
    const dowRateB = dowB / dowAvailB;
    if (dowRateA !== dowRateB) return dowRateA - dowRateB;

    // Priority 3: Total assignments normalized by availability
    const totalA = countUserAssignments(a.id!, schedule, compareFrom);
    const totalB = countUserAssignments(b.id!, schedule, compareFrom);
    const availA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo));
    const availB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo));
    const totalRateA = totalA / availA;
    const totalRateB = totalB / availB;
    if (totalRateA !== totalRateB) return totalRateA - totalRateB;

    // Priority 4: Effective load normalized by availability
    const loadA = calculateUserLoad(a.id!, schedule, dayWeights, compareFrom) + (a.debt || 0);
    const loadB = calculateUserLoad(b.id!, schedule, dayWeights, compareFrom) + (b.debt || 0);
    return loadA / availA - loadB / availB;
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
    // Keep locked entries and manual entries (only recalculate auto entries)
    if (!schedule[iso] || (!schedule[iso].isLocked && schedule[iso].type !== 'manual')) {
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
  const available = users.filter((u) => u.isActive && isUserAvailable(u, dateStr, schedule));

  if (available.length === 0) return null;

  // Pool-wide baseline: ignore assignments before the newest member joined
  const poolCommonFrom = getPoolCommonFrom(available, dateStr);
  const compareFrom = poolCommonFrom || getScheduleStart(schedule, dateStr);
  const compareTo = getPrevDateStr(dateStr);

  // Sort by priority (ladder + fairness)
  available.sort((a, b) => {
    if (!a.id || !b.id) return 0;

    const oweA = (a.owedDays && a.owedDays[dayIdx]) || 0;
    const oweB = (b.owedDays && b.owedDays[dayIdx]) || 0;
    if (oweA !== oweB) return oweB - oweA;

    // Day-of-week balance normalized by availability
    const dowA = countUserDaysOfWeek(a.id, schedule, compareFrom)[dayIdx] || 0;
    const dowB = countUserDaysOfWeek(b.id, schedule, compareFrom)[dayIdx] || 0;
    const dowAvailA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo, dayIdx));
    const dowAvailB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo, dayIdx));
    const dowRateA = dowA / dowAvailA;
    const dowRateB = dowB / dowAvailB;
    if (dowRateA !== dowRateB) return dowRateA - dowRateB;

    // Total assignments normalized by availability
    const totalA = countUserAssignments(a.id, schedule, compareFrom);
    const totalB = countUserAssignments(b.id, schedule, compareFrom);
    const availA = Math.max(1, countAvailableDaysInWindow(a, compareFrom, compareTo));
    const availB = Math.max(1, countAvailableDaysInWindow(b, compareFrom, compareTo));
    const totalRateA = totalA / availA;
    const totalRateB = totalB / availB;
    if (totalRateA !== totalRateB) return totalRateA - totalRateB;

    const loadA = calculateUserLoad(a.id, schedule, dayWeights, compareFrom) + (a.debt || 0);
    const loadB = calculateUserLoad(b.id, schedule, dayWeights, compareFrom) + (b.debt || 0);
    return loadA / availA - loadB / availB;
  });

  return available[0];
};
