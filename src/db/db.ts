import Dexie, { type EntityTable } from 'dexie';
import type { User, ScheduleEntry, AuditLogEntry, AppStateEntry } from '../types';
import { getActiveWorkspaceId, getDbName } from '../services/workspaceService';
import { getBlockedDaysPeriods } from '../utils/userBlockedDays';
import { getExcludeFromAutoPeriods } from '../utils/userExcludeFromAuto';

type VartaDB = Dexie & {
  users: EntityTable<User, 'id'>;
  schedule: EntityTable<ScheduleEntry, 'date'>;
  auditLog: EntityTable<AuditLogEntry, 'id'>;
  appState: EntityTable<AppStateEntry, 'key'>;
};

const STORES_V9 = {
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays, isExtra, dateAddedToAuto, excludeFromAuto, isPersonnel, isDutyMember',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
};

const STORES_V12 = {
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays, isExtra, dateAddedToAuto, excludeFromAuto, isPersonnel, isDutyMember, blockedDaysPeriods, excludeFromAutoPeriods2',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
};

const STORES_V13 = {
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, restBeforeStatus, restAfterStatus, blockedDays, isExtra, dateAddedToAuto, excludeFromAuto, isPersonnel, isDutyMember, blockedDaysPeriods, excludeFromAutoPeriods2',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
};

const STORES_V14 = {
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, restBeforeStatus, restAfterStatus, blockedDays, isExtra, dateAddedToAuto, excludeFromAuto, isPersonnel, isDutyMember, blockedDaysPeriods, excludeFromAutoPeriods2, statsHiddenBefore',
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
  d.version(11).stores(STORES_V9);
  d.version(12)
    .stores(STORES_V12)
    .upgrade(async (tx) => {
      await tx
        .table('users')
        .toCollection()
        .modify((user: User) => {
          // Migrate blocked days to period array
          if (!user.blockedDaysPeriods || user.blockedDaysPeriods.length === 0) {
            const periods = getBlockedDaysPeriods(user);
            if (periods.length > 0) {
              user.blockedDaysPeriods = periods;
            }
          }
          // Clear legacy flat blocked-days fields
          delete user.blockedDays;
          delete user.blockedDaysFrom;
          delete user.blockedDaysTo;
          delete user.blockedDaysComment;

          // Migrate exclude-from-auto to period array
          if (!user.excludeFromAutoPeriods2 || user.excludeFromAutoPeriods2.length === 0) {
            const periods = getExcludeFromAutoPeriods(user);
            if (periods.length > 0) {
              user.excludeFromAutoPeriods2 = periods;
            }
          }
          // Clear legacy exclude fields
          delete user.excludeFromAuto;
          delete user.excludedFromAutoPeriods;
        });
    });

  // v13 — karma/debt system removed: drop the debt and owedDays fields
  d.version(13)
    .stores(STORES_V13)
    .upgrade(async (tx) => {
      await tx
        .table('users')
        .toCollection()
        .modify((user: Record<string, unknown>) => {
          delete user.debt;
          delete user.owedDays;
        });
    });

  // v14 — per-user stats reset: soft cutoff date for duty accounting
  d.version(14).stores(STORES_V14);

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
