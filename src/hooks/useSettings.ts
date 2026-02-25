// src/hooks/useSettings.ts

import { useState, useEffect, useCallback } from 'react';
import type { DayWeights, Signatories, AutoScheduleOptions } from '../types';
import * as settingsService from '../services/settingsService';
import {
  DEFAULT_AUTO_SCHEDULE_OPTIONS,
  DEFAULT_MAX_DEBT,
  DEFAULT_PRINT_MAX_ROWS,
} from '../utils/constants';

/**
 * Custom hook for managing application settings
 */
export const useSettings = () => {
  const [dayWeights, setDayWeights] = useState<DayWeights>({});
  const [signatories, setSignatories] = useState<Signatories>({
    approverPos: '',
    approverRank: '',
    approverName: '',
    creatorPos: '',
    creatorRank: '',
    creatorName: '',
    scheduleTitle: '',
    scheduleSubtitle: '',
    scheduleLine3: '',
  });
  const [cascadeStartDate, setCascadeStartDate] = useState<string | null>(null);
  const [dutiesPerDay, setDutiesPerDay] = useState<number>(1);
  const [autoScheduleOptions, setAutoScheduleOptions] = useState<AutoScheduleOptions>(
    DEFAULT_AUTO_SCHEDULE_OPTIONS
  );
  const [maxDebt, setMaxDebt] = useState<number>(DEFAULT_MAX_DEBT);
  const [printMaxRows, setPrintMaxRows] = useState<number>(DEFAULT_PRINT_MAX_ROWS);
  const [ignoreHistoryInLogic, setIgnoreHistoryInLogic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [weights, sigs, cascadeDate, perDay, autoOpts, debt, maxRows, ignoreHistory] =
        await Promise.all([
          settingsService.getDayWeights(),
          settingsService.getSignatories(),
          settingsService.getCascadeStartDate(),
          settingsService.getDutiesPerDay(),
          settingsService.getAutoScheduleOptions(),
          settingsService.getMaxDebt(),
          settingsService.getPrintMaxRows(),
          settingsService.getIgnoreHistoryInLogic(),
        ]);

      setDayWeights(weights);
      setSignatories(sigs);
      setCascadeStartDate(cascadeDate);
      setDutiesPerDay(perDay);
      setAutoScheduleOptions(autoOpts);
      setMaxDebt(debt);
      setPrintMaxRows(maxRows);
      setIgnoreHistoryInLogic(ignoreHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save day weights
  const saveDayWeights = useCallback(async (weights: DayWeights) => {
    try {
      await settingsService.saveDayWeights(weights);
      setDayWeights(weights);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save day weights');
      throw err;
    }
  }, []);

  // Save signatories
  const saveSignatories = useCallback(async (sigs: Signatories) => {
    try {
      await settingsService.saveSignatories(sigs);
      setSignatories(sigs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save signatories');
      throw err;
    }
  }, []);

  // Save auto-schedule options
  const saveAutoScheduleOptions = useCallback(async (opts: AutoScheduleOptions) => {
    try {
      await settingsService.saveAutoScheduleOptions(opts);
      setAutoScheduleOptions(opts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save auto-schedule options');
      throw err;
    }
  }, []);

  // Save max debt
  const saveMaxDebt = useCallback(async (value: number) => {
    try {
      await settingsService.saveMaxDebt(value);
      setMaxDebt(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save max debt');
      throw err;
    }
  }, []);

  // Update cascade trigger
  const updateCascadeTrigger = useCallback(
    async (date: string) => {
      try {
        await settingsService.updateCascadeTrigger(date);
        await loadSettings();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update cascade trigger');
        throw err;
      }
    },
    [loadSettings]
  );

  // Clear cascade trigger
  const clearCascadeTrigger = useCallback(async () => {
    try {
      await settingsService.clearCascadeTrigger();
      setCascadeStartDate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cascade trigger');
      throw err;
    }
  }, []);

  // Reset all settings to defaults
  const resetAllSettings = useCallback(async () => {
    try {
      await settingsService.resetAllSettings();
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset settings');
      throw err;
    }
  }, [loadSettings]);

  // Save duties per day
  const saveDutiesPerDay = useCallback(async (count: number) => {
    try {
      await settingsService.saveDutiesPerDay(count);
      setDutiesPerDay(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save duties per day');
      throw err;
    }
  }, []);

  // Save print max rows
  const savePrintMaxRows = useCallback(async (value: number) => {
    try {
      await settingsService.savePrintMaxRows(value);
      setPrintMaxRows(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save print max rows');
      throw err;
    }
  }, []);

  // Save ignoreHistoryInLogic
  const saveIgnoreHistoryInLogic = useCallback(async (value: boolean) => {
    try {
      await settingsService.saveIgnoreHistoryInLogic(value);
      setIgnoreHistoryInLogic(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save ignore history setting');
      throw err;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    dayWeights,
    signatories,
    cascadeStartDate,
    dutiesPerDay,
    autoScheduleOptions,
    maxDebt,
    printMaxRows,
    ignoreHistoryInLogic,
    loading,
    error,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    saveDutiesPerDay,
    savePrintMaxRows,
    saveIgnoreHistoryInLogic,
    saveAutoScheduleOptions,
    saveMaxDebt,
    updateCascadeTrigger,
    clearCascadeTrigger,
    resetAllSettings,
  };
};
