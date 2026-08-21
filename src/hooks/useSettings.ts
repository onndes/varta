// src/hooks/useSettings.ts

import { useState, useEffect, useCallback } from 'react';
import type {
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  AppTheme,
  BirthdayBlockOpts,
} from '../types';
import * as settingsService from '../services/settingsService';
import { setBirthdayBlockConfig } from '../services/userService';
import {
  DEFAULT_AUTO_SCHEDULE_OPTIONS,
  DEFAULT_PRINT_MAX_ROWS,
  DEFAULT_PRINT_DUTY_TABLE_SHOW_ALL_USERS,
  DEFAULT_PRINT_SKIP_FULLY_ABSENT,
  DEFAULT_SIGNATORIES,
  DEFAULT_DOW_HISTORY_WEEKS,
  DEFAULT_DOW_HISTORY_MODE,
  DEFAULT_BIRTHDAY_BLOCK_OPTS,
} from '../utils/constants';

/**
 * Custom hook for managing application settings
 */
export const useSettings = () => {
  const [dayWeights, setDayWeights] = useState<DayWeights>({});
  const [signatories, setSignatories] = useState<Signatories>({ ...DEFAULT_SIGNATORIES });
  const [cascadeStartDate, setCascadeStartDate] = useState<string | null>(null);
  const [dutiesPerDay, setDutiesPerDay] = useState<number>(1);
  const [autoScheduleOptions, setAutoScheduleOptions] = useState<AutoScheduleOptions>(
    DEFAULT_AUTO_SCHEDULE_OPTIONS
  );
  const [printMaxRows, setPrintMaxRows] = useState<number>(DEFAULT_PRINT_MAX_ROWS);
  const [printDutyTableShowAllUsers, setPrintDutyTableShowAllUsers] = useState<boolean>(
    DEFAULT_PRINT_DUTY_TABLE_SHOW_ALL_USERS
  );
  const [printSkipFullyAbsent, setPrintSkipFullyAbsent] = useState<boolean>(
    DEFAULT_PRINT_SKIP_FULLY_ABSENT
  );
  const [ignoreHistoryInLogic, setIgnoreHistoryInLogic] = useState(false);
  const [uiScale, setUiScale] = useState(100);
  const [dowHistoryWeeks, setDowHistoryWeeks] = useState(DEFAULT_DOW_HISTORY_WEEKS);
  const [dowHistoryMode, setDowHistoryMode] = useState<'numbers' | 'dots'>(
    DEFAULT_DOW_HISTORY_MODE
  );
  const [birthdayBlockOpts, setBirthdayBlockOpts] = useState<BirthdayBlockOpts>(
    DEFAULT_BIRTHDAY_BLOCK_OPTS
  );
  const [showDevBanner, setShowDevBanner] = useState(true);
  const [devBannerDismissedOn, setDevBannerDismissedOn] = useState<string | null>(null);
  const [devBannerSnoozeUntil, setDevBannerSnoozeUntil] = useState<string | null>(null);
  const [showDevToolsMenu, setShowDevToolsMenu] = useState(false);
  const [showExperimentalSettings, setShowExperimentalSettings] = useState(false);
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper: create a save callback that persists via service, updates local state, and handles errors
  const makeSaver =
    <T>(
      serviceFn: (value: T) => Promise<void>,
      setter: React.Dispatch<React.SetStateAction<T>>,
      errorMsg: string,
      afterSave?: (value: T) => void
    ) =>
    async (value: T) => {
      try {
        await serviceFn(value);
        setter(value);
        afterSave?.(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : errorMsg);
        throw err;
      }
    };

  // Load all settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [
        weights,
        sigs,
        cascadeDate,
        perDay,
        autoOpts,
        maxRows,
        printAllUsers,
        printSkipAbsent,
        ignoreHistory,
        savedUiScale,
        savedDowHistoryWeeks,
        savedDowHistoryMode,
        savedBirthdayBlockOpts,
        savedTheme,
        savedShowDevBanner,
        savedDevBannerDismissedOn,
        savedDevBannerSnoozeUntil,
        savedShowDevToolsMenu,
        savedShowExperimentalSettings,
      ] = await Promise.all([
        settingsService.getDayWeights(),
        settingsService.getSignatories(),
        settingsService.getCascadeStartDate(),
        settingsService.getDutiesPerDay(),
        settingsService.getAutoScheduleOptions(),
        settingsService.getPrintMaxRows(),
        settingsService.getPrintDutyTableShowAllUsers(),
        settingsService.getPrintSkipFullyAbsent(),
        settingsService.getIgnoreHistoryInLogic(),
        settingsService.getUiScale(),
        settingsService.getDowHistoryWeeks(),
        settingsService.getDowHistoryMode(),
        settingsService.getBirthdayBlockOpts(),
        settingsService.getTheme(),
        settingsService.getShowDevBanner(),
        settingsService.getDevBannerDismissedOn(),
        settingsService.getDevBannerSnoozeUntil(),
        settingsService.getShowDevToolsMenu(),
        settingsService.getShowExperimentalSettings(),
      ]);

      setDayWeights(weights);
      setSignatories(sigs);
      setCascadeStartDate(cascadeDate);
      setDutiesPerDay(perDay);
      setAutoScheduleOptions(autoOpts);
      setPrintMaxRows(maxRows);
      setPrintDutyTableShowAllUsers(printAllUsers);
      setPrintSkipFullyAbsent(printSkipAbsent);
      setIgnoreHistoryInLogic(ignoreHistory);
      setUiScale(savedUiScale);
      setDowHistoryWeeks(savedDowHistoryWeeks);
      setDowHistoryMode(savedDowHistoryMode);
      setBirthdayBlockOpts(savedBirthdayBlockOpts);
      setBirthdayBlockConfig(savedBirthdayBlockOpts);
      const validThemes: AppTheme[] = ['light', 'dark'];
      setTheme(validThemes.includes(savedTheme as AppTheme) ? (savedTheme as AppTheme) : 'dark');
      setShowDevBanner(savedShowDevBanner);
      setDevBannerDismissedOn(savedDevBannerDismissedOn);
      setDevBannerSnoozeUntil(savedDevBannerSnoozeUntil);
      setShowDevToolsMenu(savedShowDevToolsMenu);
      setShowExperimentalSettings(savedShowExperimentalSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Save callbacks
  const saveDayWeights = makeSaver(
    settingsService.saveDayWeights,
    setDayWeights,
    'Failed to save day weights'
  );
  const saveSignatories = makeSaver(
    settingsService.saveSignatories,
    setSignatories,
    'Failed to save signatories'
  );
  const saveAutoScheduleOptions = makeSaver(
    settingsService.saveAutoScheduleOptions,
    setAutoScheduleOptions,
    'Failed to save auto-schedule options'
  );
  const saveDutiesPerDay = makeSaver(
    settingsService.saveDutiesPerDay,
    setDutiesPerDay,
    'Failed to save duties per day'
  );
  const savePrintMaxRows = makeSaver(
    settingsService.savePrintMaxRows,
    setPrintMaxRows,
    'Failed to save print max rows'
  );
  const savePrintDutyTableShowAllUsers = makeSaver(
    settingsService.savePrintDutyTableShowAllUsers,
    setPrintDutyTableShowAllUsers,
    'Failed to save print duty-table mode'
  );
  const savePrintSkipFullyAbsent = makeSaver(
    settingsService.savePrintSkipFullyAbsent,
    setPrintSkipFullyAbsent,
    'Failed to save print skip-absent mode'
  );
  const saveIgnoreHistoryInLogic = makeSaver(
    settingsService.saveIgnoreHistoryInLogic,
    setIgnoreHistoryInLogic,
    'Failed to save ignore history setting'
  );
  const saveUiScale = makeSaver(settingsService.saveUiScale, setUiScale, 'Failed to save UI scale');
  const saveDowHistoryWeeks = makeSaver(
    settingsService.saveDowHistoryWeeks,
    setDowHistoryWeeks,
    'Failed to save DOW history weeks'
  );
  const saveDowHistoryMode = makeSaver(
    settingsService.saveDowHistoryMode,
    setDowHistoryMode,
    'Failed to save DOW history mode'
  );
  const saveTheme = makeSaver(settingsService.saveTheme, setTheme, 'Failed to save theme');
  const saveBirthdayBlockOpts = makeSaver(
    settingsService.saveBirthdayBlockOpts,
    setBirthdayBlockOpts,
    'Failed to save birthday block opts',
    setBirthdayBlockConfig
  );
  const saveShowDevBanner = async (value: boolean) => {
    try {
      await settingsService.saveShowDevBanner(value);
      setShowDevBanner(value);
      if (value) {
        await Promise.all([
          settingsService.saveDevBannerDismissedOn(null),
          settingsService.saveDevBannerSnoozeUntil(null),
        ]);
        setDevBannerDismissedOn(null);
        setDevBannerSnoozeUntil(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dev banner setting');
      throw err;
    }
  };
  const saveDevBannerDismissedOn = makeSaver(
    settingsService.saveDevBannerDismissedOn,
    setDevBannerDismissedOn,
    'Failed to save dev banner dismissed date'
  );
  const saveDevBannerSnoozeUntil = makeSaver(
    settingsService.saveDevBannerSnoozeUntil,
    setDevBannerSnoozeUntil,
    'Failed to save dev banner snooze date'
  );
  const saveShowDevToolsMenu = makeSaver(
    settingsService.saveShowDevToolsMenu,
    setShowDevToolsMenu,
    'Failed to save Dev menu setting'
  );
  const saveShowExperimentalSettings = makeSaver(
    settingsService.saveShowExperimentalSettings,
    setShowExperimentalSettings,
    'Failed to save experimental settings visibility'
  );

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
    dutiesPerDay,
    autoScheduleOptions,
    printMaxRows,
    printDutyTableShowAllUsers,
    printSkipFullyAbsent,
    ignoreHistoryInLogic,
    uiScale,
    dowHistoryWeeks,
    dowHistoryMode,
    birthdayBlockOpts,
    showDevBanner,
    devBannerDismissedOn,
    devBannerSnoozeUntil,
    showDevToolsMenu,
    showExperimentalSettings,
    theme,
    loading,
    error,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    saveDutiesPerDay,
    savePrintMaxRows,
    savePrintDutyTableShowAllUsers,
    savePrintSkipFullyAbsent,
    saveIgnoreHistoryInLogic,
    saveUiScale,
    saveDowHistoryWeeks,
    saveDowHistoryMode,
    saveBirthdayBlockOpts,
    saveShowDevBanner,
    saveDevBannerDismissedOn,
    saveDevBannerSnoozeUntil,
    saveShowDevToolsMenu,
    saveShowExperimentalSettings,
    saveTheme,
    saveAutoScheduleOptions,
    updateCascadeTrigger,
    clearCascadeTrigger,
    resetAllSettings,
  };
};
