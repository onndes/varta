// src/services/exportService.ts

import { db, createDatabase, switchDatabase } from '../db/db';
import type { DayWeights, Signatories, AutoScheduleOptions } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import {
  getWorkspaces,
  saveWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  getDbName,
} from './workspaceService';
import type { Workspace } from './workspaceService';

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
  autoScheduleOptions?: { key: string; value: AutoScheduleOptions };
  maxDebt?: number;
  dutiesPerDay?: number;
}

export interface MultiWorkspaceExportData {
  version: 8;
  timestamp: string;
  activeWorkspaceId: string;
  workspaces: Workspace[];
  databases: Record<string, ExportData>;
}

const CURRENT_BACKUP_VERSION = 7;
const BACKUP_VERSION_MULTI = 8;
const SUPPORTED_BACKUP_VERSIONS = new Set([6, CURRENT_BACKUP_VERSION, BACKUP_VERSION_MULTI]);

const isValidTimestamp = (value: string): boolean => {
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
};

/** Type guard for multi-workspace format */
export const isMultiWorkspaceExport = (data: unknown): data is MultiWorkspaceExportData => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.version === BACKUP_VERSION_MULTI;
};

/** Read all data from a specific database by name (opens a temporary connection) */
const readDbData = async (dbName: string): Promise<ExportData> => {
  const tempDb = createDatabase(dbName);
  try {
    await tempDb.open();
    const [
      users,
      schedule,
      auditLog,
      dayWeightsRec,
      signatoriesRec,
      autoOptsRec,
      maxDebtRec,
      dutiesPerDayRec,
    ] = await Promise.all([
      tempDb.users.toArray(),
      tempDb.schedule.toArray(),
      tempDb.auditLog.toArray(),
      tempDb.appState.get('dayWeights'),
      tempDb.appState.get('signatories'),
      tempDb.appState.get('autoScheduleOptions'),
      tempDb.appState.get('maxDebt'),
      tempDb.appState.get('dutiesPerDay'),
    ]);
    return {
      version: CURRENT_BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      users,
      schedule,
      auditLog,
      dayWeights: dayWeightsRec as { key: string; value: DayWeights } | undefined,
      signatories: signatoriesRec as { key: string; value: Signatories } | undefined,
      autoScheduleOptions: autoOptsRec as { key: string; value: AutoScheduleOptions } | undefined,
      maxDebt: maxDebtRec ? (maxDebtRec.value as number) : undefined,
      dutiesPerDay: dutiesPerDayRec ? (dutiesPerDayRec.value as number) : undefined,
    };
  } finally {
    tempDb.close();
  }
};

/** Write ExportData into a specific database by name (opens a temporary connection) */
const writeDbData = async (dbName: string, data: ExportData): Promise<void> => {
  const tempDb = createDatabase(dbName);
  try {
    await tempDb.open();
    await tempDb.transaction(
      'rw',
      tempDb.users,
      tempDb.schedule,
      tempDb.auditLog,
      tempDb.appState,
      async () => {
        await tempDb.users.clear();
        await tempDb.schedule.clear();
        await tempDb.auditLog.clear();
        await tempDb.users.bulkAdd(data.users as never[]);
        await tempDb.schedule.bulkAdd(data.schedule as never[]);
        if (Array.isArray(data.auditLog)) {
          await tempDb.auditLog.bulkAdd(data.auditLog as never[]);
        }
        if (data.dayWeights)
          await tempDb.appState.put({ key: 'dayWeights', value: data.dayWeights.value });
        if (data.signatories)
          await tempDb.appState.put({ key: 'signatories', value: data.signatories.value });
        if (data.autoScheduleOptions)
          await tempDb.appState.put({
            key: 'autoScheduleOptions',
            value: data.autoScheduleOptions.value,
          });
        if (data.maxDebt != null)
          await tempDb.appState.put({ key: 'maxDebt', value: data.maxDebt });
        if (data.dutiesPerDay != null)
          await tempDb.appState.put({ key: 'dutiesPerDay', value: data.dutiesPerDay });
        await tempDb.appState.put({ key: 'needsExport', value: false });
        await tempDb.appState.put({
          key: 'lastExportTimestamp',
          value: new Date().toISOString(),
        });
      }
    );
  } finally {
    tempDb.close();
  }
};

/**
 * Import all workspaces from a v8 multi-workspace backup.
 * Restores workspace metadata and data for each workspace,
 * then switches the active DB to the saved active workspace.
 */
const importAllWorkspaces = async (data: MultiWorkspaceExportData): Promise<void> => {
  // Restore workspace list in localStorage
  saveWorkspaces(data.workspaces);
  setActiveWorkspaceId(data.activeWorkspaceId);

  // Restore each database
  for (const ws of data.workspaces) {
    const dbData = data.databases[ws.id];
    if (!dbData) continue;
    await writeDbData(getDbName(ws.id), dbData);
  }

  // Switch the in-memory db singleton to the restored active workspace
  await switchDatabase(data.activeWorkspaceId);
};

/**
 * Export all data to JSON
 */
export const exportData = async (): Promise<ExportData> => {
  const dayWeightsRec = await db.appState.get('dayWeights');
  const signatoriesRec = await db.appState.get('signatories');
  const autoOptsRec = await db.appState.get('autoScheduleOptions');
  const maxDebtRec = await db.appState.get('maxDebt');
  const dutiesPerDayRec = await db.appState.get('dutiesPerDay');

  const data: ExportData = {
    version: CURRENT_BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    users: await db.users.toArray(),
    schedule: await db.schedule.toArray(),
    auditLog: await db.auditLog.toArray(),
    dayWeights: dayWeightsRec as { key: string; value: DayWeights } | undefined,
    signatories: signatoriesRec as { key: string; value: Signatories } | undefined,
    autoScheduleOptions: autoOptsRec as { key: string; value: AutoScheduleOptions } | undefined,
    maxDebt: maxDebtRec ? (maxDebtRec.value as number) : undefined,
    dutiesPerDay: dutiesPerDayRec ? (dutiesPerDayRec.value as number) : undefined,
  };

  return data;
};

/**
 * Import data from JSON
 */
const importData = async (data: ExportData): Promise<void> => {
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
    if (data.autoScheduleOptions) {
      await db.appState.put({ key: 'autoScheduleOptions', value: data.autoScheduleOptions.value });
    }
    if (data.maxDebt != null) {
      await db.appState.put({ key: 'maxDebt', value: data.maxDebt });
    }
    if (data.dutiesPerDay != null) {
      await db.appState.put({ key: 'dutiesPerDay', value: data.dutiesPerDay });
    }

    // Reset flags
    await db.appState.put({ key: 'needsExport', value: false });
    await db.appState.put({ key: 'cascadeStartDate', value: null });
    await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
  });
};

/**
 * Download data as JSON file.
 * If multiple workspaces exist, exports all of them (v8 format).
 * If only one workspace, exports it in v7 format (backward compatible).
 */
export const downloadBackup = async (): Promise<void> => {
  const workspaces = getWorkspaces();
  const dateStr = toLocalISO(new Date());
  let blob: Blob;
  let filename: string;

  if (workspaces.length > 1) {
    // Multi-workspace v8 format
    const activeId = getActiveWorkspaceId();
    const databases: Record<string, ExportData> = {};

    for (const ws of workspaces) {
      if (ws.id === activeId) {
        // Use existing db connection to avoid dual-open
        databases[ws.id] = await exportData();
      } else {
        databases[ws.id] = await readDbData(getDbName(ws.id));
      }
    }

    const multiData: MultiWorkspaceExportData = {
      version: BACKUP_VERSION_MULTI,
      timestamp: new Date().toISOString(),
      activeWorkspaceId: activeId,
      workspaces,
      databases,
    };
    blob = new Blob([JSON.stringify(multiData, null, 2)], { type: 'application/json' });
    filename = `VARTA_FULL_BACKUP_${dateStr}.json`;
  } else {
    // Single workspace — v7 format
    const data = await exportData();
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    filename = `VARTA_BACKUP_${dateStr}.json`;
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Mark active DB as exported
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

        if (isMultiWorkspaceExport(parsed)) {
          await importAllWorkspaces(parsed);
        } else {
          await importData(parsed as ExportData);
        }
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
 * Validate export data structure (supports v6/v7 single-workspace and v8 multi-workspace)
 */
export const validateExportData = (
  data: unknown
): data is ExportData | MultiWorkspaceExportData => {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;

  if (typeof d.version !== 'number') return false;
  if (!SUPPORTED_BACKUP_VERSIONS.has(d.version)) return false;
  if (typeof d.timestamp !== 'string' || !isValidTimestamp(d.timestamp)) return false;

  if (d.version === BACKUP_VERSION_MULTI) {
    // v8: must have workspaces array and databases object
    return (
      Array.isArray(d.workspaces) &&
      typeof d.databases === 'object' &&
      d.databases !== null &&
      typeof d.activeWorkspaceId === 'string'
    );
  }

  // v6/v7: must have users and schedule arrays
  return (
    Array.isArray(d.users) &&
    Array.isArray(d.schedule) &&
    (typeof d.auditLog === 'undefined' || Array.isArray(d.auditLog))
  );
};
