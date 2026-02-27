// src/services/autoScheduler/scheduler.ts
// Головний алгоритм авто-розкладу: жадібне заповнення + пост-балансування

import type { User, ScheduleEntry, DayWeights, AutoScheduleOptions } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { isUserAvailable } from '../userService';
import { calculateUserLoad } from '../scheduleService';
import { toAssignedUserIds, isManualType, getLogicSchedule } from '../../utils/assignment';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../../utils/constants';
import {
  MAX_REBALANCE_ITERATIONS,
  REBALANCE_THRESHOLD,
  buildEarliestHistoryMap,
  getWeekWindow,
  getDatesInRange,
  shouldEnforceOneDutyPerWeek,
  countUserAssignmentsInRange,
  getWeeklyAssignmentCap,
  countAvailableDaysInWindow,
  getUserCompareFrom,
} from './helpers';
import {
  buildUserComparator,
  filterByRestDays,
  filterByIncompatiblePairs,
  filterByWeeklyCap,
} from './comparator';

/**
 * Автоматичне заповнення прогалин у графіку.
 *
 * 1. Жадібний прохід по датах: для кожної дати обирає найкращого кандидата.
 * 2. Пост-балансування: зменшує дисперсію навантаження шляхом перепризначень.
 */
export const autoFillSchedule = async (
  targetDates: string[],
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  dayWeights: DayWeights,
  dutiesPerDay = 1,
  options: AutoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  ignoreHistoryInLogic = false
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

    // Загальна кількість доступних бійців (для визначення «мало людей»)
    const totalEligibleCount = users.filter(
      (u) => u.isActive && !u.isExtra && !u.excludeFromAuto
    ).length;

    // Спільний компаратор (з тимчасовим offset навантаження)
    // For fairness calcs, exclude history entries when ignoreHistoryInLogic is on
    const fairnessSched = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
    const compare = buildUserComparator(
      dateStr,
      tempSchedule,
      dayWeights,
      options,
      tempLoadOffset,
      fairnessSched,
      totalEligibleCount
    );
    pool.sort(compare);

    // Фільтри: дні відпочинку, несумісність та ліміт на тиждень
    if (options.avoidConsecutiveDays) {
      pool = filterByRestDays(pool, dateStr, options.minRestDays || 1, tempSchedule);
    }
    pool = filterByIncompatiblePairs(pool, users, dateStr, tempSchedule);
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
  // from overloaded users to less-loaded users (respecting all constraints).
  if (options.considerLoad && targetDates.length > 0) {
    postBalancePass(
      updates,
      tempSchedule,
      users,
      targetDates,
      dayWeights,
      options,
      ignoreHistoryInLogic
    );
  }

  return updates;
};

// ─── Post-balancing (внутрішня) ────────────────────────────────────

function postBalancePass(
  updates: ScheduleEntry[],
  tempSchedule: Record<string, ScheduleEntry>,
  users: User[],
  targetDates: string[],
  dayWeights: DayWeights,
  options: AutoScheduleOptions,
  ignoreHistoryInLogic: boolean
): void {
  const autoPool = users.filter((u) => u.id && u.isActive && !u.isExtra && !u.excludeFromAuto);
  const todayStr = toLocalISO(new Date());
  const latestDate = targetDates[targetDates.length - 1];

  const fairnessTempSched = getLogicSchedule(tempSchedule, ignoreHistoryInLogic);
  const earliestHistoryByUser = buildEarliestHistoryMap(fairnessTempSched);
  const getLoadRate = (u: User): number => {
    const from = getUserCompareFrom(u, latestDate, fairnessTempSched, earliestHistoryByUser);
    const load = calculateUserLoad(u.id!, fairnessTempSched, dayWeights, from) + (u.debt || 0);
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

    // Find an auto entry assigned to overloaded user that less-loaded user can take
    let reassigned = false;
    for (const dateStr of targetDates) {
      if (dateStr < todayStr) continue;
      const entry = tempSchedule[dateStr];
      if (!entry || entry.isLocked || isManualType(entry)) continue;

      const ids = toAssignedUserIds(entry.userId);
      if (!ids.includes(over.user.id!)) continue;
      if (ids.includes(under.user.id!)) continue;

      // Check less-loaded user availability
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
            toAssignedUserIds(tempSchedule[toLocalISO(before)]?.userId).includes(under.user.id!) ||
            toAssignedUserIds(tempSchedule[toLocalISO(after)]?.userId).includes(under.user.id!)
          ) {
            restViolation = true;
            break;
          }
        }
        if (restViolation) continue;
      }

      // Check incompatible pairs for less-loaded user
      {
        const checkPool = filterByIncompatiblePairs([under.user], users, dateStr, tempSchedule);
        if (checkPool.length === 0 || checkPool[0].id !== under.user.id) continue;
      }

      // Check weekly cap for less-loaded user
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

      // Reassign: replace overloaded user with less-loaded user on this date
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
