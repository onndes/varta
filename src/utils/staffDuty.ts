// src/utils/staffDuty.ts — «Штатний черговий»: чергування є основною задачею бійця.
import type { User } from '../types';

/** Скільки нарядів на тиждень бере штатний черговий за замовчуванням. */
export const DEFAULT_STAFF_WEEKLY_TARGET = 3;

/** Дозволений діапазон тижневої норми штатного чергового. */
export const STAFF_WEEKLY_TARGET_MIN = 2;
export const STAFF_WEEKLY_TARGET_MAX = 4;

/**
 * Мінімальний відпочинок для штатного чергового: 1 день.
 * Дозволяє «через добу», але ніколи не два наряди поспіль.
 */
export const STAFF_MIN_REST_DAYS = 1;

export const isStaffDuty = (user: User): boolean => !!user.isStaffDuty;

/**
 * Тижнева норма нарядів: у штатного — власна (2–4), у решти — 1.
 * Використовується і як ліміт («більше не ставити»), і як база для
 * порівняння «хто далі від своєї норми».
 */
export const getWeeklyDutyTarget = (user: User): number => {
  if (!isStaffDuty(user)) return 1;
  const raw = user.staffWeeklyTarget ?? DEFAULT_STAFF_WEEKLY_TARGET;
  return Math.min(STAFF_WEEKLY_TARGET_MAX, Math.max(STAFF_WEEKLY_TARGET_MIN, Math.round(raw)));
};

/** Мінімальний відпочинок для конкретного бійця з урахуванням штатної ролі. */
export const getEffectiveMinRestDays = (user: User, minRestDays: number): number =>
  isStaffDuty(user) ? Math.min(minRestDays, STAFF_MIN_REST_DAYS) : minRestDays;
