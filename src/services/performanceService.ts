// src/services/performanceService.ts

import { db } from '../db/db';
import { clearOldLogs } from './auditService';
import { toLocalISO } from '../utils/dateUtils';

/**
 * Service for maintaining database performance
 */

/**
 * Cleanup old data to keep database size manageable
 */
export const performMaintenance = async (): Promise<{
  logsDeleted: number;
  oldSchedulesDeleted: number;
}> => {
  const results = {
    logsDeleted: 0,
    oldSchedulesDeleted: 0,
  };

  // 1. Clear audit logs older than 180 days (6 months)
  const logsBefore = await db.auditLog.count();
  await clearOldLogs(180);
  const logsAfter = await db.auditLog.count();
  results.logsDeleted = logsBefore - logsAfter;

  // 2. Clear schedule entries older than 1 year
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = toLocalISO(oneYearAgo);

  const allSchedule = await db.schedule.toArray();
  const oldScheduleIds = allSchedule
    .filter((entry) => entry.date < oneYearAgoStr)
    .map((entry) => entry.date);

  if (oldScheduleIds.length > 0) {
    await db.schedule.bulkDelete(oldScheduleIds);
    results.oldSchedulesDeleted = oldScheduleIds.length;
  }

  return results;
};

export interface DatabaseStats {
  counts: {
    users: number;
    schedule: number;
    auditLog: number;
  };
  estimatedSizeKB: {
    users: number;
    schedule: number;
    auditLog: number;
    total: number;
  };
}

/**
 * Get database statistics
 */
export const getDatabaseStats = async (): Promise<DatabaseStats> => {
  const [usersCount, scheduleCount, auditLogCount] = await Promise.all([
    db.users.count(),
    db.schedule.count(),
    db.auditLog.count(),
  ]);

  // Estimate size (rough)
  const estimatedSize = {
    users: usersCount * 0.5, // ~500 bytes per user
    schedule: scheduleCount * 0.1, // ~100 bytes per entry
    auditLog: auditLogCount * 0.2, // ~200 bytes per log
    total: usersCount * 0.5 + scheduleCount * 0.1 + auditLogCount * 0.2,
  };

  return {
    counts: {
      users: usersCount,
      schedule: scheduleCount,
      auditLog: auditLogCount,
    },
    estimatedSizeKB: estimatedSize,
  };
};

/**
 * Check if maintenance is needed
 */
export const checkMaintenanceNeeded = async (): Promise<boolean> => {
  const auditCount = await db.auditLog.count();
  const scheduleCount = await db.schedule.count();

  // Maintenance needed if:
  // - More than 5000 audit logs
  // - More than 2000 schedule entries (>5 years for 1 person)
  return auditCount > 5000 || scheduleCount > 2000;
};

/**
 * Get oldest entries dates
 */
export const getDataRange = async () => {
  const allSchedule = await db.schedule.toArray();
  const allLogs = await db.auditLog.toArray();

  const dates = allSchedule.map((s) => s.date).sort();
  const logDates = allLogs.map((l) => l.timestamp).sort();

  return {
    schedule: {
      oldest: dates[0] || null,
      newest: dates[dates.length - 1] || null,
      count: dates.length,
    },
    auditLog: {
      oldest: logDates[0] || null,
      newest: logDates[logDates.length - 1] || null,
      count: logDates.length,
    },
  };
};
