import Dexie, { type EntityTable } from 'dexie';
import type { User, ScheduleEntry, AuditLogEntry, AppStateEntry } from '../types';
import { getActiveWorkspaceId, getDbName } from '../services/workspaceService';

type VartaDB = Dexie & {
  users: EntityTable<User, 'id'>;
  schedule: EntityTable<ScheduleEntry, 'date'>;
  auditLog: EntityTable<AuditLogEntry, 'id'>;
  appState: EntityTable<AppStateEntry, 'key'>;
};

const STORES_V9 = {
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays, isExtra, dateAddedToAuto, excludeFromAuto, isPersonnel',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
};

export function createDatabase(name: string): VartaDB {
  const d = new Dexie(name) as VartaDB;

  // Single version declaration — all migrations collapsed into latest schema
  d.version(7).stores(STORES_V9);
  d.version(8).stores(STORES_V9);
  d.version(9).stores(STORES_V9);
  d.version(10).stores(STORES_V9);

  return d;
}

// Current active database instance
let db: VartaDB = createDatabase(getDbName(getActiveWorkspaceId()));

/**
 * Switch to a different workspace database.
 * Closes the current DB and opens the new one.
 */
export async function switchDatabase(workspaceId: string): Promise<void> {
  db.close();
  db = createDatabase(getDbName(workspaceId));
  await db.open();
}

export { db };
