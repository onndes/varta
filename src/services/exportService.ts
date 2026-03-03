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
import { saveTextFile } from '../utils/platform';

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
  printMaxRows?: number;
  ignoreHistoryInLogic?: boolean;
  theme?: string;
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

const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const isValidTimestamp = (value: string): boolean => {
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
  return isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
};

/** Type guard for multi-workspace format */
export const isMultiWorkspaceExport = (data: unknown): data is MultiWorkspaceExportData => {
  if (!data || typeof data !== 'object') return false;
  return (data as Record<string, unknown>).version === BACKUP_VERSION_MULTI;
};

// ── Спільні хелпери: читання / запис БД ───────────────────────────────

/** Зчитати всі дані з БД-хендла (db або тимчасовий) */
const readDataFromDb = async (targetDb: typeof db): Promise<ExportData> => {
  const [
    users,
    schedule,
    auditLog,
    dayWeightsRec,
    signatoriesRec,
    autoOptsRec,
    maxDebtRec,
    dutiesPerDayRec,
    printMaxRowsRec,
    ignoreHistoryRec,
    themeRec,
  ] = await Promise.all([
    targetDb.users.toArray(),
    targetDb.schedule.toArray(),
    targetDb.auditLog.toArray(),
    targetDb.appState.get('dayWeights'),
    targetDb.appState.get('signatories'),
    targetDb.appState.get('autoScheduleOptions'),
    targetDb.appState.get('maxDebt'),
    targetDb.appState.get('dutiesPerDay'),
    targetDb.appState.get('printMaxRows'),
    targetDb.appState.get('ignoreHistoryInLogic'),
    targetDb.appState.get('theme'),
  ]);
  return {
    version: CURRENT_BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    users,
    schedule,
    auditLog,
    dayWeights: dayWeightsRec as ExportData['dayWeights'],
    signatories: signatoriesRec as ExportData['signatories'],
    autoScheduleOptions: autoOptsRec as ExportData['autoScheduleOptions'],
    maxDebt: maxDebtRec ? (maxDebtRec.value as number) : undefined,
    dutiesPerDay: dutiesPerDayRec ? (dutiesPerDayRec.value as number) : undefined,
    printMaxRows: printMaxRowsRec ? (printMaxRowsRec.value as number) : undefined,
    ignoreHistoryInLogic: ignoreHistoryRec ? (ignoreHistoryRec.value as boolean) : undefined,
    theme: themeRec ? (themeRec.value as string) : undefined,
  };
};

/** Відновити ExportData в БД-хендл (db або тимчасовий). Очищає таблиці перед записом. */
const restoreDataToDb = async (targetDb: typeof db, data: ExportData): Promise<void> => {
  await targetDb.transaction(
    'rw',
    targetDb.users,
    targetDb.schedule,
    targetDb.auditLog,
    targetDb.appState,
    async () => {
      // Очистити таблиці
      await targetDb.users.clear();
      await targetDb.schedule.clear();
      await targetDb.auditLog.clear();

      // Записати дані
      await targetDb.users.bulkAdd(data.users as never[]);
      await targetDb.schedule.bulkAdd(data.schedule as never[]);
      if (Array.isArray(data.auditLog)) {
        await targetDb.auditLog.bulkAdd(data.auditLog as never[]);
      }

      // Налаштування
      if (data.dayWeights)
        await targetDb.appState.put({ key: 'dayWeights', value: data.dayWeights.value });
      if (data.signatories)
        await targetDb.appState.put({ key: 'signatories', value: data.signatories.value });
      if (data.autoScheduleOptions)
        await targetDb.appState.put({
          key: 'autoScheduleOptions',
          value: data.autoScheduleOptions.value,
        });
      if (data.maxDebt != null)
        await targetDb.appState.put({ key: 'maxDebt', value: data.maxDebt });
      if (data.dutiesPerDay != null)
        await targetDb.appState.put({ key: 'dutiesPerDay', value: data.dutiesPerDay });
      if (data.printMaxRows != null)
        await targetDb.appState.put({ key: 'printMaxRows', value: data.printMaxRows });
      if (data.ignoreHistoryInLogic != null)
        await targetDb.appState.put({
          key: 'ignoreHistoryInLogic',
          value: data.ignoreHistoryInLogic,
        });
      // Theme is a device preference — restore only if present in backup
      if (data.theme) await targetDb.appState.put({ key: 'theme', value: data.theme });

      // Прапорці
      await targetDb.appState.put({ key: 'needsExport', value: false });
      await targetDb.appState.put({
        key: 'lastExportTimestamp',
        value: new Date().toISOString(),
      });
    }
  );
};

// ── Операції з тимчасовою БД ──────────────────────────────────────────

/** Зчитати дані з окремої БД за іменем (відкриває тимчасове з'єднання) */
const readDbData = async (dbName: string): Promise<ExportData> => {
  const tempDb = createDatabase(dbName);
  try {
    await tempDb.open();
    return await readDataFromDb(tempDb);
  } finally {
    tempDb.close();
  }
};

/** Записати дані в окрему БД за іменем (відкриває тимчасове з'єднання) */
const writeDbData = async (dbName: string, data: ExportData): Promise<void> => {
  const tempDb = createDatabase(dbName);
  try {
    await tempDb.open();
    await restoreDataToDb(tempDb, data);
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
  const fallbackWorkspaceId = data.workspaces[0]?.id || 'default';
  const restoredActiveId = data.workspaces.some((ws) => ws.id === data.activeWorkspaceId)
    ? data.activeWorkspaceId
    : fallbackWorkspaceId;

  // Restore workspace list in localStorage
  saveWorkspaces(data.workspaces);
  setActiveWorkspaceId(restoredActiveId);

  // Restore each database
  for (const ws of data.workspaces) {
    const dbData = data.databases[ws.id];
    if (!dbData) continue;
    await writeDbData(getDbName(ws.id), dbData);
  }

  // Switch the in-memory db singleton to the restored active workspace
  await switchDatabase(restoredActiveId);
};

// ── Export / Import ───────────────────────────────────────────────────

/** Експортувати дані поточної БД */
export const exportData = async (): Promise<ExportData> => readDataFromDb(db);

/** Імпортувати дані в поточну БД (v6/v7 single-workspace формат) */
const importData = async (data: ExportData): Promise<void> => {
  await restoreDataToDb(db, data);
  // Додатково скидаємо cascade trigger (для поточного db)
  await db.appState.put({ key: 'cascadeStartDate', value: null });
};

/**
 * Download data as JSON file.
 * If multiple workspaces exist, exports all of them (v8 format).
 * If only one workspace, exports it in v7 format (backward compatible).
 */
export const downloadBackup = async (): Promise<void> => {
  const workspaces = getWorkspaces();
  const dateStr = toLocalISO(new Date());
  const activeId = getActiveWorkspaceId();
  const activeWorkspaceName = workspaces.find((w) => w.id === activeId)?.name || 'workspace';
  const workspaceNamePart = sanitizeFilenamePart(activeWorkspaceName) || 'workspace';
  let jsonContent: string;
  let filename: string;

  if (workspaces.length > 1) {
    // Multi-workspace v8 format
    const databases: Record<string, ExportData> = {};

    for (const ws of workspaces) {
      if (ws.id === activeId) {
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
    jsonContent = JSON.stringify(multiData, null, 2);
    filename = `VARTA_FULL_BACKUP_${workspaceNamePart}_${dateStr}.json`;
  } else {
    // Single workspace — v7 format
    const data = await exportData();
    jsonContent = JSON.stringify(data, null, 2);
    filename = `VARTA_BACKUP_${workspaceNamePart}_${dateStr}.json`;
  }

  // Use native Tauri dialog when available, otherwise browser download
  await saveTextFile(jsonContent, filename);

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
