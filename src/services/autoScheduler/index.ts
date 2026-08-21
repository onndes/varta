// src/services/autoScheduler/index.ts
// Публічний API авто-розкладу: збереження, вільні бійці, перерахунок, оптимальне призначення

import { db } from '../../db/db';
import type {
  User,
  ScheduleEntry,
  DayWeights,
  AutoScheduleOptions,
  SchedulerProgressCallback,
} from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { isUserAvailable } from '../userService';
import { isExcludedFromAutoOnDate } from '../../utils/userExcludeFromAuto';
import { toAssignedUserIds, isManualType, getLogicSchedule } from '../../utils/assignment';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../../utils/constants';
import {
  buildUserComparator,
  filterByIncompatiblePairs,
  filterBySameWeekdayLastWeek,
  filterByWeeklyCap,
  filterForceUseAllWhenFew,
  filterEvenWeeklyDistribution,
} from './comparator';
import {
  countEligibleUsersForDate,
  countEligibleUsersForWeek,
  MIN_USERS_FOR_WEEKLY_LIMIT,
  applyForceOverrideAccounting,
} from './helpers';
import { autoFillSchedule } from './scheduler';

// Re-export головного алгоритму
export { autoFillSchedule } from './scheduler';
export { calculateUserFairnessIndex, computeUserLoadRate } from './helpers';

/**
 * Зберегти авто-розклад.
 */
export const saveAutoSchedule = async (entries: ScheduleEntry[]): Promise<void> => {
  await db.transaction('rw', db.schedule, async () => {
    for (const entry of entries) {
      await db.schedule.put(entry);
    }
  });
};

/**
 * Отримати вільних бійців для конкретної дати (відсортованих за пріоритетом).
 */
export const getFreeUsersForDate = (
  dateStr: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  ignoreHistoryInLogic = false
): User[] => {
  const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));
  const fairnessSched = applyForceOverrideAccounting(
    getLogicSchedule(schedule, ignoreHistoryInLogic),
    options,
    users
  );

  // Доступні бійці (не призначені, не Extra, не виключені з авто на цю дату)
  let candidatePool = users.filter(
    (u) =>
      !u.isExtra &&
      !isExcludedFromAutoOnDate(u, dateStr) &&
      !assignedOnDate.has(u.id!) &&
      isUserAvailable(u, dateStr, schedule)
  );
  const totalEligibleCount = countEligibleUsersForDate(users, schedule, dateStr);

  // Ліміт на тиждень
  if (options.limitOneDutyPerWeekWhenSevenPlus) {
    candidatePool = filterByWeeklyCap(candidatePool, users, dateStr, schedule);
  }
  candidatePool = filterByIncompatiblePairs(candidatePool, users, dateStr, schedule);
  candidatePool = filterBySameWeekdayLastWeek(
    candidatePool,
    dateStr,
    schedule,
    !options.evenWeeklyDistribution
  );

  // forceUseAllWhenFew: while any user has 0 duties this week,
  // only zero-assignment users are eligible candidates.
  const weekEligible = countEligibleUsersForWeek(users, schedule, dateStr);
  if (options.forceUseAllWhenFew && weekEligible <= MIN_USERS_FOR_WEEKLY_LIMIT) {
    candidatePool = filterForceUseAllWhenFew(candidatePool, dateStr, schedule);
  }
  if (options.evenWeeklyDistribution && weekEligible <= MIN_USERS_FOR_WEEKLY_LIMIT) {
    candidatePool = filterEvenWeeklyDistribution(candidatePool, dateStr, schedule);
  }

  // Сортуємо за спільним пріоритетним компаратором
  return candidatePool.sort(
    buildUserComparator(
      dateStr,
      schedule,
      dayWeights,
      options,
      undefined,
      fairnessSched,
      totalEligibleCount,
      candidatePool,
      users.filter(
        (u) => u.id && u.isActive && !u.isExtra && !isExcludedFromAutoOnDate(u, dateStr)
      )
    )
  );
};

/**
 * Перерахувати графік починаючи з конкретної дати.
 */
export const recalculateScheduleFrom = async (
  startDate: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay = 1,
  options?: AutoScheduleOptions,
  ignoreHistoryInLogic = false,
  onProgress?: SchedulerProgressCallback,
  abortSignal?: AbortSignal
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
    options,
    ignoreHistoryInLogic,
    onProgress,
    abortSignal
  );
  await saveAutoSchedule(updates);
};

/**
 * Знайти оптимального бійця для призначення на дату.
 */
export const calculateOptimalAssignment = (
  dateStr: string,
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  ignoreHistoryInLogic = false
): User | null => {
  let available = users.filter(
    (u) =>
      u.isActive &&
      !u.isExtra &&
      !isExcludedFromAutoOnDate(u, dateStr) &&
      isUserAvailable(u, dateStr, schedule)
  );
  if (available.length === 0) return null;
  const totalEligibleCount = countEligibleUsersForDate(users, schedule, dateStr);
  const fairnessSched = applyForceOverrideAccounting(
    getLogicSchedule(schedule, ignoreHistoryInLogic),
    options,
    users
  );

  // Ліміт на тиждень
  if (options.limitOneDutyPerWeekWhenSevenPlus) {
    available = filterByWeeklyCap(available, users, dateStr, schedule);
  }
  available = filterByIncompatiblePairs(available, users, dateStr, schedule);
  available = filterBySameWeekdayLastWeek(
    available,
    dateStr,
    schedule,
    !options.evenWeeklyDistribution
  );

  // forceUseAllWhenFew: while any user has 0 duties this week,
  // only zero-assignment users are eligible candidates.
  const weekEligibleOpt = countEligibleUsersForWeek(users, schedule, dateStr);
  if (options.forceUseAllWhenFew && weekEligibleOpt <= MIN_USERS_FOR_WEEKLY_LIMIT) {
    available = filterForceUseAllWhenFew(available, dateStr, schedule);
  }
  if (options.evenWeeklyDistribution && weekEligibleOpt <= MIN_USERS_FOR_WEEKLY_LIMIT) {
    available = filterEvenWeeklyDistribution(available, dateStr, schedule);
  }

  // Сортуємо за спільним пріоритетним компаратором
  available.sort(
    buildUserComparator(
      dateStr,
      schedule,
      dayWeights,
      options,
      undefined,
      fairnessSched,
      totalEligibleCount,
      available,
      users.filter(
        (u) => u.id && u.isActive && !u.isExtra && !isExcludedFromAutoOnDate(u, dateStr)
      )
    )
  );
  return available[0];
};
