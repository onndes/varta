// src/hooks/useExport.ts

import { useState, useEffect, useCallback } from 'react';
import * as exportService from '../services/exportService';

/**
 * Custom hook for import/export operations
 */
export const useExport = () => {
  const [needsExport, setNeedsExport] = useState(false);
  const [lastExportDate, setLastExportDate] = useState<Date | null>(null);
  const [isBackupNeeded, setIsBackupNeeded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check export status
  const checkExportStatus = useCallback(async () => {
    try {
      const [hasChanges, lastDate, backupNeeded] = await Promise.all([
        exportService.hasUnsavedChanges(),
        exportService.getLastExportDate(),
        exportService.isBackupNeeded(3),
      ]);

      setNeedsExport(hasChanges);
      setLastExportDate(lastDate);
      setIsBackupNeeded(backupNeeded);
    } catch (err) {
      console.error('Error checking export status:', err);
    }
  }, []);

  // Export data to JSON
  const exportData = useCallback(async () => {
    try {
      setIsProcessing(true);
      setError(null);

      await exportService.downloadBackup();
      await checkExportStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export data');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [checkExportStatus]);

  // Import data from file
  const importData = useCallback(
    async (file: File) => {
      try {
        setIsProcessing(true);
        setError(null);

        await exportService.uploadBackup(file);
        await checkExportStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import data');
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [checkExportStatus]
  );

  // Get export data (without downloading)
  const getExportData = useCallback(async () => {
    try {
      return await exportService.exportData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get export data');
      throw err;
    }
  }, []);

  // Mark as needs export
  const markAsNeedsExport = useCallback(async () => {
    try {
      await exportService.markAsNeedsExport();
      setNeedsExport(true);
    } catch (err) {
      console.error('Error marking as needs export:', err);
    }
  }, []);

  // Clear needs export flag
  const clearNeedsExport = useCallback(async () => {
    try {
      await exportService.clearNeedsExport();
      setNeedsExport(false);
    } catch (err) {
      console.error('Error clearing needs export:', err);
    }
  }, []);

  // Validate import data
  const validateImportData = useCallback((data: unknown) => {
    return exportService.validateExportData(data);
  }, []);

  // Get days since last export
  const getDaysSinceLastExport = useCallback(() => {
    if (!lastExportDate) return null;
    const now = new Date();
    const diff = now.getTime() - lastExportDate.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [lastExportDate]);

  // Initial check
  useEffect(() => {
    checkExportStatus();
  }, [checkExportStatus]);

  return {
    needsExport,
    lastExportDate,
    isBackupNeeded,
    isProcessing,
    error,
    exportData,
    importData,
    getExportData,
    markAsNeedsExport,
    clearNeedsExport,
    validateImportData,
    getDaysSinceLastExport,
    checkExportStatus,
  };
};
