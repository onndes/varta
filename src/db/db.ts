import Dexie, { type EntityTable } from 'dexie';
import type { User, ScheduleEntry, AuditLogEntry, AppStateEntry } from '../types';

// Наследуем класс от Dexie
const db = new Dexie('DutySchedulerDB_v4') as Dexie & {
  users: EntityTable<User, 'id'>;
  schedule: EntityTable<ScheduleEntry, 'date'>; // date - первичный ключ
  auditLog: EntityTable<AuditLogEntry, 'id'>;
  appState: EntityTable<AppStateEntry, 'key'>;
};

// Определяем схему (версия 7 - added restBeforeStatus, blockedDays)
db.version(7).stores({
  users:
    '++id, name, rank, status, statusFrom, statusTo, isActive, note, debt, restBeforeStatus, restAfterStatus, blockedDays, owedDays',
  schedule: 'date, userId, type, isLocked',
  auditLog: '++id, timestamp, action',
  appState: 'key, value',
});

export { db };
