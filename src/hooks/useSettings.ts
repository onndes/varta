// src/hooks/useSettings.ts

import { useState, useEffect, useCallback } from 'react';
import type { DayWeights, Signatories } from '../types';
import * as settingsService from '../services/settingsService';

/**
 * Custom hook for managing application settings
 */
export const useSettings = () => {
  const [dayWeights, setDayWeights] = useState<DayWeights>({});
  const [signatories, setSignatories] = useState<Signatories>({
    approverPos: '',
    approverRank: '',
    approverName: '',
    creatorRank: '',
    creatorName: '',
  });
  const [cascadeStartDate, setCascadeStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [weights, sigs, cascadeDate] = await Promise.all([
        settingsService.getDayWeights(),
        settingsService.getSignatories(),
        settingsService.getCascadeStartDate(),
      ]);

      setDayWeights(weights);
      setSignatories(sigs);
      setCascadeStartDate(cascadeDate);
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

  // Initial load
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    dayWeights,
    signatories,
    cascadeStartDate,
    loading,
    error,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    updateCascadeTrigger,
    clearCascadeTrigger,
    resetAllSettings,
  };
};
