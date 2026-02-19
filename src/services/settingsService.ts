// src/services/settingsService.ts

import { db } from '../db/db';
import type { DayWeights, Signatories } from '../types';
import {
  DEFAULT_DAY_WEIGHTS,
  DEFAULT_SIGNATORIES,
  DEFAULT_DUTIES_PER_DAY,
} from '../utils/constants';

/**
 * Service for application settings
 */

/**
 * Get day weights
 */
export const getDayWeights = async (): Promise<DayWeights> => {
  const record = await db.appState.get('dayWeights');
  if (!record) return DEFAULT_DAY_WEIGHTS;

  // Handle JSON string values
  let value = record.value;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return DEFAULT_DAY_WEIGHTS;
    }
  }

  return value as DayWeights;
};

/**
 * Save day weights
 */
export const saveDayWeights = async (weights: DayWeights): Promise<void> => {
  await db.appState.put({ key: 'dayWeights', value: weights });
};

/**
 * Get signatories
 */
export const getSignatories = async (): Promise<Signatories> => {
  const record = await db.appState.get('signatories');
  if (!record) return DEFAULT_SIGNATORIES;

  // Handle JSON string values
  let value = record.value;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return DEFAULT_SIGNATORIES;
    }
  }

  return value as Signatories;
};

/**
 * Save signatories
 */
export const saveSignatories = async (signatories: Signatories): Promise<void> => {
  await db.appState.put({ key: 'signatories', value: signatories });
};

/**
 * Get cascade start date
 */
export const getCascadeStartDate = async (): Promise<string | null> => {
  const record = await db.appState.get('cascadeStartDate');
  return record ? (record.value as string) : null;
};

/**
 * Update cascade trigger date
 */
export const updateCascadeTrigger = async (date: string): Promise<void> => {
  if (!date) return;

  const current = await db.appState.get('cascadeStartDate');
  let newDate = date;

  if (current && current.value) {
    const currentDate = current.value as string;
    if (date < currentDate) {
      newDate = date;
    } else {
      newDate = currentDate;
    }
  }

  await db.appState.put({ key: 'cascadeStartDate', value: newDate });
};

/**
 * Clear cascade trigger
 */
export const clearCascadeTrigger = async (): Promise<void> => {
  await db.appState.put({ key: 'cascadeStartDate', value: null });
};

/**
 * Get app setting by key
 */
export const getAppSetting = async <
  T extends DayWeights | Signatories | string | number | boolean | null,
>(
  key: string,
  defaultValue: T
): Promise<T> => {
  const record = await db.appState.get(key);
  if (!record) return defaultValue;

  // Handle JSON string values and type conversions
  const value = record.value;
  if (typeof value === 'string') {
    // Try to parse as number if defaultValue is a number
    if (typeof defaultValue === 'number') {
      const num = Number(value);
      if (!isNaN(num)) return num as T;
    }
  }

  return value as T;
};

/**
 * Save app setting
 */
export const saveAppSetting = async (
  key: string,
  value: DayWeights | Signatories | string | number | boolean | null
): Promise<void> => {
  await db.appState.put({ key, value });
};

/**
 * Reset all settings to defaults
 */
export const resetAllSettings = async (): Promise<void> => {
  await db.appState.put({ key: 'dayWeights', value: DEFAULT_DAY_WEIGHTS });
  await db.appState.put({ key: 'signatories', value: DEFAULT_SIGNATORIES });
  await db.appState.put({ key: 'cascadeStartDate', value: null });
  await db.appState.put({ key: 'dutiesPerDay', value: DEFAULT_DUTIES_PER_DAY });
};

/**
 * Get duties per day setting
 */
export const getDutiesPerDay = async (): Promise<number> => {
  return await getAppSetting('dutiesPerDay', DEFAULT_DUTIES_PER_DAY);
};

/**
 * Save duties per day setting
 */
export const saveDutiesPerDay = async (count: number): Promise<void> => {
  await saveAppSetting('dutiesPerDay', count);
};
