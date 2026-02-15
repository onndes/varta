// src/services/settingsService.ts

import { db } from '../db/db';
import type { DayWeights, Signatories } from '../types';
import { DEFAULT_DAY_WEIGHTS, DEFAULT_SIGNATORIES } from '../utils/constants';

/**
 * Service for application settings
 */

/**
 * Get day weights
 */
export const getDayWeights = async (): Promise<DayWeights> => {
  const record = await db.appState.get('dayWeights');
  return record ? (record.value as DayWeights) : DEFAULT_DAY_WEIGHTS;
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
  return record ? (record.value as Signatories) : DEFAULT_SIGNATORIES;
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
export const getAppSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  const record = await db.appState.get(key);
  return record ? (record.value as T) : defaultValue;
};

/**
 * Save app setting
 */
export const saveAppSetting = async <T>(key: string, value: T): Promise<void> => {
  await db.appState.put({ key, value });
};

/**
 * Reset all settings to defaults
 */
export const resetAllSettings = async (): Promise<void> => {
  await db.appState.put({ key: 'dayWeights', value: DEFAULT_DAY_WEIGHTS });
  await db.appState.put({ key: 'signatories', value: DEFAULT_SIGNATORIES });
  await db.appState.put({ key: 'cascadeStartDate', value: null });
};
