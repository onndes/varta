// src/utils/dateUtils.ts

/**
 * Utilities for working with dates
 */

/**
 * Convert Date to local ISO string (YYYY-MM-DD)
 */
export const toLocalISO = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

/**
 * Get ISO week number for a date
 */
export const getWeekNumber = (d: Date): number => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

/**
 * Get Monday of a specific week in a year
 */
export const getMondayOfWeek = (year: number, week: number): Date => {
  const d = new Date(year, 0, 4);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
};

/**
 * Get Monday of current week
 */
export const getCurrentMonday = (): Date => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

/**
 * Generate array of dates for a week starting from Monday
 */
export const getWeekDates = (monday: Date): string[] => {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(toLocalISO(d));
  }
  return dates;
};

/**
 * Check if date is in the past
 */
export const isPastDate = (dateStr: string): boolean => {
  return dateStr < toLocalISO(new Date());
};

/**
 * Check if date is today
 */
export const isToday = (dateStr: string): boolean => {
  return dateStr === toLocalISO(new Date());
};

/**
 * Add days to a date string
 */
export const addDays = (dateStr: string, days: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return toLocalISO(date);
};

/**
 * Format date for display
 */
export const formatDate = (dateStr: string, locale = 'uk-UA'): string => {
  return new Date(dateStr).toLocaleDateString(locale);
};

/**
 * Format date with day and month
 */
export const formatDateShort = (dateStr: string, locale = 'uk-UA'): string => {
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
};

/**
 * Get day of week index (0 = Sunday, 1 = Monday, ...)
 */
export const getDayOfWeek = (dateStr: string): number => {
  return new Date(dateStr).getDay();
};
