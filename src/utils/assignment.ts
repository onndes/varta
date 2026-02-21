import type { ScheduleEntry } from '../types';

export const toAssignedUserIds = (userId: ScheduleEntry['userId'] | undefined | null): number[] => {
  if (!userId) return [];
  return Array.isArray(userId) ? userId : [userId];
};

export const isAssignedInEntry = (
  entry: ScheduleEntry | null | undefined,
  userId: number
): boolean => {
  if (!entry) return false;
  return toAssignedUserIds(entry.userId).includes(userId);
};

export const getAssignedCount = (entry: ScheduleEntry | null | undefined): number => {
  if (!entry) return 0;
  return toAssignedUserIds(entry.userId).length;
};

/** Check if entry type is a manual/admin action (manual, replace, swap) */
export const isManualType = (entry: ScheduleEntry | null | undefined): boolean => {
  if (!entry) return false;
  return entry.type === 'manual' || entry.type === 'replace' || entry.type === 'swap';
};
