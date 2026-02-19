import Dexie, { type EntityTable } from 'dexie';
import type { User, ScheduleEntry, AuditLogEntry, AppStateEntry } from '../types';

// Наследуем класс от Dexie
const db = new Dexie('DutySchedulerDB_v4') as Dexie & {
  users: EntityTable<User, 'id'>;
  schedule: EntityTable<ScheduleEntry, 'date'>; // date - первичный ключ
  auditLog: EntityTable<AuditLogEntry, 'id'>;
  appState: EntityTable<AppStateEntry, 'key'>;
};

// Версия 7 - added restBeforeStatus, blockedDays
db.version(7).stores({
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
});

// Версия 8 - added isExtra, dateAddedToAuto to users
db.version(8).stores({
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays, isExtra, dateAddedToAuto',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
});

export { db };
