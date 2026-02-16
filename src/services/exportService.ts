// src/services/exportService.ts

import { db } from '../db/db';
import type { DayWeights, Signatories } from '../types';
import { toLocalISO } from '../utils/dateUtils';

/**
 * Service for import/export operations
 */

export interface ExportData {
  version: number;
  timestamp: string;
  users: unknown[];
  schedule: unknown[];
  auditLog?: unknown[];
  dayWeights?: { key: string; value: DayWeights };
  signatories?: { key: string; value: Signatories };
}

const CURRENT_BACKUP_VERSION = 6;
const SUPPORTED_BACKUP_VERSIONS = new Set([CURRENT_BACKUP_VERSION]);

const isValidTimestamp = (value: string): boolean => {
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
};

/**
 * Export all data to JSON
 */
export const exportData = async (): Promise<ExportData> => {
  const dayWeightsRec = await db.appState.get('dayWeights');
  const signatoriesRec = await db.appState.get('signatories');

  const data: ExportData = {
    version: CURRENT_BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    users: await db.users.toArray(),
    schedule: await db.schedule.toArray(),
    auditLog: await db.auditLog.toArray(),
    dayWeights: dayWeightsRec as { key: string; value: DayWeights } | undefined,
    signatories: signatoriesRec as { key: string; value: Signatories } | undefined,
  };

  return data;
};

/**
 * Import data from JSON
 */
export const importData = async (data: ExportData): Promise<void> => {
  await db.transaction('rw', db.users, db.schedule, db.auditLog, db.appState, async () => {
    // Clear existing data
    await db.users.clear();
    await db.schedule.clear();
    await db.auditLog.clear();

    // Import new data
    await db.users.bulkAdd(data.users as never[]);
    await db.schedule.bulkAdd(data.schedule as never[]);
    if (Array.isArray(data.auditLog)) {
      await db.auditLog.bulkAdd(data.auditLog as never[]);
    }

    // Import settings
    if (data.dayWeights) {
      await db.appState.put({ key: 'dayWeights', value: data.dayWeights.value });
    }
    if (data.signatories) {
      await db.appState.put({ key: 'signatories', value: data.signatories.value });
    }

    // Reset flags
    await db.appState.put({ key: 'needsExport', value: false });
    await db.appState.put({ key: 'cascadeStartDate', value: null });
    await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
  });
};

/**
 * Download data as JSON file
 */
export const downloadBackup = async (): Promise<void> => {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `VARTA_BACKUP_${toLocalISO(new Date())}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Mark as exported
  await db.appState.put({ key: 'needsExport', value: false });
  await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
};

/**
 * Upload backup from file
 */
export const uploadBackup = async (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const result = e.target?.result as string;
        const parsed = JSON.parse(result) as unknown;
        if (!validateExportData(parsed)) {
          throw new Error('Некоректний формат backup-файлу');
        }

        const data = parsed as ExportData;
        await importData(data);
        resolve();
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

/**
 * Check if backup is needed
 */
export const isBackupNeeded = async (daysThreshold = 3): Promise<boolean> => {
  const lastExport = await db.appState.get('lastExportTimestamp');

  if (!lastExport || !lastExport.value) return true;

  const lastExportDate = new Date(lastExport.value as string);
  const daysSinceExport = Math.abs(
    (new Date().getTime() - lastExportDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return daysSinceExport > daysThreshold;
};

/**
 * Check if there are unsaved changes
 */
export const hasUnsavedChanges = async (): Promise<boolean> => {
  const dirtyState = await db.appState.get('needsExport');
  return !!dirtyState?.value;
};

/**
 * Mark data as needing export
 */
export const markAsNeedsExport = async (): Promise<void> => {
  await db.appState.put({ key: 'needsExport', value: true });
};

/**
 * Clear needs export flag
 */
export const clearNeedsExport = async (): Promise<void> => {
  await db.appState.put({ key: 'needsExport', value: false });
  await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
};

/**
 * Get last export timestamp
 */
export const getLastExportDate = async (): Promise<Date | null> => {
  const record = await db.appState.get('lastExportTimestamp');
  if (record && record.value) {
    return new Date(record.value as string);
  }
  return null;
};

/**
 * Validate export data structure
 */
export const validateExportData = (data: unknown): data is ExportData => {
  if (!data || typeof data !== 'object') return false;

  const d = data as Partial<ExportData>;

  return !!(
    typeof d.version === 'number' &&
    SUPPORTED_BACKUP_VERSIONS.has(d.version) &&
    typeof d.timestamp === 'string' &&
    isValidTimestamp(d.timestamp) &&
    Array.isArray(d.users) &&
    Array.isArray(d.schedule) &&
    (typeof d.auditLog === 'undefined' || Array.isArray(d.auditLog))
  );
};
