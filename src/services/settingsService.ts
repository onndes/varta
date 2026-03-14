// src/services/settingsService.ts

import { db } from '../db/db';
import type { DayWeights, Signatories, AutoScheduleOptions } from '../types';
import {
  DEFAULT_DAY_WEIGHTS,
  DEFAULT_SIGNATORIES,
  DEFAULT_DUTIES_PER_DAY,
  DEFAULT_AUTO_SCHEDULE_OPTIONS,
  DEFAULT_MAX_DEBT,
  DEFAULT_PRINT_MAX_ROWS,
  DEFAULT_PRINT_DUTY_TABLE_SHOW_ALL_USERS,
} from '../utils/constants';

/**
 * Service for application settings
 */

// ── Загальні хелпери ──────────────────────────────────────────────────

/** Зчитати JSON-значення з appState, повернути defaultValue при помилці */
const getJsonSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  const record = await db.appState.get(key);
  if (!record) return defaultValue;
  let value = record.value;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return defaultValue;
    }
  }
  return (value ?? defaultValue) as T;
};

/** Зберегти значення в appState */
const saveSetting = async (
  key: string,
  value: DayWeights | Signatories | AutoScheduleOptions | string | number | boolean | null
): Promise<void> => {
  await db.appState.put({ key, value });
};

// ── Day weights ───────────────────────────────────────────────────────

export const getDayWeights = async (): Promise<DayWeights> =>
  getJsonSetting('dayWeights', DEFAULT_DAY_WEIGHTS);

export const saveDayWeights = async (weights: DayWeights): Promise<void> =>
  saveSetting('dayWeights', weights);

// ── Signatories ───────────────────────────────────────────────────────

export const getSignatories = async (): Promise<Signatories> => {
  const partial = await getJsonSetting<Partial<Signatories>>('signatories', {});
  return { ...DEFAULT_SIGNATORIES, ...partial };
};

export const saveSignatories = async (signatories: Signatories): Promise<void> =>
  saveSetting('signatories', signatories);

// ── Auto-schedule options ─────────────────────────────────────────────

export const getAutoScheduleOptions = async (): Promise<AutoScheduleOptions> => {
  const partial = await getJsonSetting<Partial<AutoScheduleOptions>>('autoScheduleOptions', {});
  return { ...DEFAULT_AUTO_SCHEDULE_OPTIONS, ...partial };
};

export const saveAutoScheduleOptions = async (opts: AutoScheduleOptions): Promise<void> =>
  saveSetting('autoScheduleOptions', opts);

// ── Print settings ────────────────────────────────────────────────────

export const getPrintMaxRows = async (): Promise<number> =>
  getJsonSetting('printMaxRows', DEFAULT_PRINT_MAX_ROWS);

export const savePrintMaxRows = async (value: number): Promise<void> =>
  saveSetting('printMaxRows', value);

export const getPrintDutyTableShowAllUsers = async (): Promise<boolean> =>
  getJsonSetting('printDutyTableShowAllUsers', DEFAULT_PRINT_DUTY_TABLE_SHOW_ALL_USERS);

export const savePrintDutyTableShowAllUsers = async (value: boolean): Promise<void> =>
  saveSetting('printDutyTableShowAllUsers', value);

// ── Scalar settings ───────────────────────────────────────────────────

export const getMaxDebt = async (): Promise<number> => getJsonSetting('maxDebt', DEFAULT_MAX_DEBT);

export const saveMaxDebt = async (value: number): Promise<void> => saveSetting('maxDebt', value);

export const getDutiesPerDay = async (): Promise<number> =>
  getJsonSetting('dutiesPerDay', DEFAULT_DUTIES_PER_DAY);

export const saveDutiesPerDay = async (count: number): Promise<void> =>
  saveSetting('dutiesPerDay', count);

// ── Ignore history in logic ───────────────────────────────────────

export const getIgnoreHistoryInLogic = async (): Promise<boolean> =>
  getJsonSetting('ignoreHistoryInLogic', false);

export const saveIgnoreHistoryInLogic = async (value: boolean): Promise<void> =>
  saveSetting('ignoreHistoryInLogic', value);

// ── UI scale ───────────────────────────────────────────────────────────

export const getUiScale = async (): Promise<number> => getJsonSetting('uiScale', 100);

export const saveUiScale = async (value: number): Promise<void> => saveSetting('uiScale', value);

// ── Theme ─────────────────────────────────────────────────────────

const THEME_LS_KEY = 'varta-theme';

export const getTheme = async (): Promise<string> => {
  // Prefer DB value (workspace-specific), then sync to localStorage for pre-apply in index.html
  const dbTheme = await getJsonSetting('theme', '');
  if (dbTheme === 'light' || dbTheme === 'dark') {
    localStorage.setItem(THEME_LS_KEY, dbTheme);
    return dbTheme;
  }

  const lsVal = localStorage.getItem(THEME_LS_KEY);
  if (lsVal === 'light' || lsVal === 'dark') return lsVal;
  return 'light';
};

export const saveTheme = async (theme: string): Promise<void> => {
  // Write to localStorage first so index.html inline-script can read it immediately on next load
  localStorage.setItem(THEME_LS_KEY, theme);
  return saveSetting('theme', theme);
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

// ── Cascade trigger ───────────────────────────────────────────────────

// ── Reset ─────────────────────────────────────────────────────────────

export const resetAllSettings = async (): Promise<void> => {
  await saveSetting('dayWeights', DEFAULT_DAY_WEIGHTS);
  await saveSetting('signatories', DEFAULT_SIGNATORIES);
  await saveSetting('cascadeStartDate', null);
  await saveSetting('dutiesPerDay', DEFAULT_DUTIES_PER_DAY);
  await saveSetting('autoScheduleOptions', DEFAULT_AUTO_SCHEDULE_OPTIONS);
  await saveSetting('maxDebt', DEFAULT_MAX_DEBT);
  await saveSetting('printMaxRows', DEFAULT_PRINT_MAX_ROWS);
  await saveSetting('printDutyTableShowAllUsers', DEFAULT_PRINT_DUTY_TABLE_SHOW_ALL_USERS);
  await saveSetting('ignoreHistoryInLogic', false);
  await saveSetting('uiScale', 100);
  // theme is intentionally NOT reset — user preference
};
