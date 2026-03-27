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

/** Чи є тип запису «ручним» (manual, replace, swap, history, import, force — не авто) */
export const isManualType = (entry: ScheduleEntry | null | undefined): boolean => {
  if (!entry) return false;
  return (
    entry.type === 'manual' ||
    entry.type === 'replace' ||
    entry.type === 'swap' ||
    entry.type === 'history' ||
    entry.type === 'import' ||
    entry.type === 'force'
  );
};

/** Чи є запис історичним / імпортованим */
export const isHistoryType = (entry: ScheduleEntry | null | undefined): boolean => {
  if (!entry) return false;
  return entry.type === 'history' || entry.type === 'import';
};

/** Фільтрувати розклад для логіки (прибрати історію/імпорт якщо ignoreHistory) */
export const getLogicSchedule = (
  schedule: Record<string, ScheduleEntry>,
  ignoreHistory: boolean
): Record<string, ScheduleEntry> => {
  if (!ignoreHistory) return schedule;
  const filtered: Record<string, ScheduleEntry> = {};
  for (const [date, entry] of Object.entries(schedule)) {
    if (!isHistoryType(entry)) {
      filtered[date] = entry;
    }
  }
  return filtered;
};

/** Найперша дата чергування для конкретного бійця (будь-який тип запису) */
export const getFirstDutyDate = (
  schedule: Record<string, ScheduleEntry>,
  userId: number
): string | undefined => {
  const dates = Object.entries(schedule)
    .filter(([, entry]) => isAssignedInEntry(entry, userId))
    .map(([date]) => date)
    .sort();
  return dates[0];
};
