import type { ScheduleEntry } from '../types';

export const toAssignedUserIds = (
  userId: ScheduleEntry['userId'] | undefined | null
): number[] => {
  if (!userId) return [];
  return Array.isArray(userId) ? userId : [userId];
};

export const isAssignedInEntry = (entry: ScheduleEntry | null | undefined, userId: number): boolean => {
  if (!entry) return false;
  return toAssignedUserIds(entry.userId).includes(userId);
};

export const getAssignedCount = (entry: ScheduleEntry | null | undefined): number => {
  if (!entry) return 0;
  return toAssignedUserIds(entry.userId).length;
};
