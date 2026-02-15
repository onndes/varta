// src/services/auditService.ts

import { db } from '../db/db';
import type { AuditLogEntry } from '../types';
import { markAsNeedsExport } from './exportService';

/**
 * Service for audit logging
 */

/**
 * Log an action
 */
export const logAction = async (action: string, details: string): Promise<void> => {
  await db.auditLog.add({
    timestamp: new Date(),
    action,
    details,
  });
  await markAsNeedsExport();
};

/**
 * Get all audit logs
 */
export const getAllLogs = async (): Promise<AuditLogEntry[]> => {
  return await db.auditLog.toArray();
};

/**
 * Get recent logs
 */
export const getRecentLogs = async (limit = 50): Promise<AuditLogEntry[]> => {
  const logs = await db.auditLog.orderBy('timestamp').reverse().limit(limit).toArray();
  return logs;
};

/**
 * Get logs by date range
 */
export const getLogsByDateRange = async (
  startDate: Date,
  endDate: Date
): Promise<AuditLogEntry[]> => {
  const logs = await db.auditLog.toArray();
  return logs.filter((log) => log.timestamp >= startDate && log.timestamp <= endDate);
};

/**
 * Get logs by action type
 */
export const getLogsByAction = async (action: string): Promise<AuditLogEntry[]> => {
  const logs = await db.auditLog.toArray();
  return logs.filter((log) => log.action === action);
};

/**
 * Clear old logs
 */
export const clearOldLogs = async (daysToKeep = 90): Promise<void> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const logs = await db.auditLog.toArray();
  const idsToDelete = logs.filter((log) => log.timestamp < cutoffDate).map((log) => log.id!);

  if (idsToDelete.length > 0) {
    await db.auditLog.bulkDelete(idsToDelete);
  }
};

/**
 * Clear all logs
 */
export const clearAllLogs = async (): Promise<void> => {
  await db.auditLog.clear();
};

/**
 * Get log statistics
 */
export const getLogStats = async () => {
  const logs = await db.auditLog.toArray();

  const actionCounts: Record<string, number> = {};
  logs.forEach((log) => {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
  });

  return {
    total: logs.length,
    actionCounts,
    firstLog: logs.length > 0 ? logs[0].timestamp : null,
    lastLog: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
  };
};
