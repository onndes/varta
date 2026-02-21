import type { ScheduleEntry } from '../types';

/** Привести userId (число, масив або null) до масиву ID */
export const toAssignedUserIds = (userId: ScheduleEntry['userId'] | undefined | null): number[] => {
  if (!userId) return [];
  return Array.isArray(userId) ? userId : [userId];
};

/** Чи призначений конкретний боєць у записі розкладу */
export const isAssignedInEntry = (
  entry: ScheduleEntry | null | undefined,
  userId: number
): boolean => {
  if (!entry) return false;
  return toAssignedUserIds(entry.userId).includes(userId);
};

/** Кількість призначених бійців у записі */
export const getAssignedCount = (entry: ScheduleEntry | null | undefined): number => {
  if (!entry) return 0;
  return toAssignedUserIds(entry.userId).length;
};

/** Чи є тип запису «ручним» (manual, replace, swap — не авто) */
export const isManualType = (entry: ScheduleEntry | null | undefined): boolean => {
  if (!entry) return false;
  return entry.type === 'manual' || entry.type === 'replace' || entry.type === 'swap';
};
