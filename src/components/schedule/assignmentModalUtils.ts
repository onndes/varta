// src/components/schedule/assignmentModalUtils.ts
import type { ScheduleEntry } from '../../types';
import { toAssignedUserIds, isAssignedInEntry } from '../../utils/assignment';

/** Check if a user has a shift the day AFTER the target date. */
export const hasShiftNextDay = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextIso = nextDate.toISOString().split('T')[0];
  const entry = schedule[nextIso];
  return entry ? toAssignedUserIds(entry.userId).includes(userId) : false;
};

/** Get the user's last duty date strictly before the target date. */
export const getLastDutyDateBeforeTarget = (
  userId: number,
  targetDate: string,
  schedule: Record<string, ScheduleEntry>
): string | undefined => {
  const assignedDates = Object.keys(schedule)
    .filter((d) => d < targetDate && isAssignedInEntry(schedule[d], userId))
    .sort();
  if (assignedDates.length === 0) return undefined;
  return assignedDates[assignedDates.length - 1];
};

/** Get all week dates where a user is assigned (excluding the target date). */
export const getUserWeekDates = (
  userId: number,
  targetDate: string,
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>
): string[] =>
  weekDates.filter((wd) => {
    if (wd === targetDate) return false;
    const entry = schedule[wd];
    return entry ? toAssignedUserIds(entry.userId).includes(userId) : false;
  });

/** Column definition for the 7-day duty-count grid shown in each user row. */
export const WEEKDAY_COLUMNS = [
  { day: 1, label: 'Пн' },
  { day: 2, label: 'Вт' },
  { day: 3, label: 'Ср' },
  { day: 4, label: 'Чт' },
  { day: 5, label: 'Пт' },
  { day: 6, label: 'Сб' },
  { day: 0, label: 'Нд' },
] as const;

/** Pending action discriminated union used in confirmation flow. */
export type PendingAction =
  | { type: 'replace'; userId: number; penalize: boolean }
  | { type: 'swap'; userId: number; swapDate: string }
  | { type: 'remove'; reason: 'request' | 'work' };

/** Swap mode selected in the toolbar. */
export type SwapMode = 'replace' | 'swap' | 'remove';
