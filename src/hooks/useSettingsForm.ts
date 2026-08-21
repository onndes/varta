// src/hooks/useSettingsForm.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import type {
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  User,
  ScheduleEntry,
  BirthdayBlockOpts,
} from '../types';
import type { WeightApplyMode } from '../components/settings/LogicTabPanel';
import type { DatabaseStats } from '../services/performanceService';
import * as performanceService from '../services/performanceService';
import { toLocalISO } from '../utils/dateUtils';
import { getFirstDutyDate } from '../utils/assignment';
import { recalculateScheduleFrom } from '../services/autoScheduler';
import * as userService from '../services/userService';
import { useDialog } from '../components/useDialog';

/** All props required by the settings form — mirrors SettingsViewProps. */
export interface UseSettingsFormProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  signatories: Signatories;
  dutiesPerDay: number;
  autoScheduleOptions: AutoScheduleOptions;
  printMaxRows: number;
  printDutyTableShowAllUsers: boolean;
  printSkipFullyAbsent: boolean;
  ignoreHistoryInLogic: boolean;
  uiScale: number;
  dowHistoryWeeks: number;
  dowHistoryMode: 'numbers' | 'dots';
  onSave: (w: DayWeights) => Promise<void>;
  onSaveSignatories: (s: Signatories) => Promise<void>;
  onSaveDutiesPerDay: (count: number) => Promise<void>;
  onSaveAutoScheduleOptions: (opts: AutoScheduleOptions) => Promise<void>;
  onSavePrintMaxRows: (value: number) => Promise<void>;
  onSavePrintDutyTableShowAllUsers: (value: boolean) => Promise<void>;
  onSavePrintSkipFullyAbsent: (value: boolean) => Promise<void>;
  onSaveIgnoreHistoryInLogic: (value: boolean) => Promise<void>;
  onSaveUiScale: (value: number) => Promise<void>;
  onSaveDowHistoryWeeks: (value: number) => Promise<void>;
  onSaveDowHistoryMode: (value: 'numbers' | 'dots') => Promise<void>;
  birthdayBlockOpts: BirthdayBlockOpts;
  onSaveBirthdayBlockOpts: (opts: BirthdayBlockOpts) => Promise<void>;
  refreshData: () => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

/**
 * Manages all editable form state for SettingsView.
 * Handles dirty-change detection, save orchestration,
 * first-duty-date bulk sync, and DB maintenance modal.
 */
export const useSettingsForm = ({
  users,
  schedule,
  dayWeights,
  signatories,
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
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
  onSaveAutoScheduleOptions,
  onSavePrintMaxRows,
  onSavePrintDutyTableShowAllUsers,
  onSavePrintSkipFullyAbsent,
  onSaveIgnoreHistoryInLogic,
  onSaveUiScale,
  onSaveDowHistoryWeeks,
  onSaveDowHistoryMode,
  onSaveBirthdayBlockOpts,
  refreshData,
  updateCascadeTrigger,
  logAction,
}: UseSettingsFormProps) => {
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);
  const [perDay, setPerDay] = useState<number>(dutiesPerDay);
  const [autoOpts, setAutoOpts] = useState<AutoScheduleOptions>(autoScheduleOptions);
  const [maxRows, setMaxRows] = useState<number>(printMaxRows);
  const [printAllUsers, setPrintAllUsers] = useState<boolean>(printDutyTableShowAllUsers);
  const [skipAbsent, setSkipAbsent] = useState<boolean>(printSkipFullyAbsent);
  const [ignoreHistory, setIgnoreHistory] = useState<boolean>(ignoreHistoryInLogic);
  const [scale, setScale] = useState<number>(uiScale);
  const [histWeeks, setHistWeeks] = useState<number>(dowHistoryWeeks);
  const [histMode, setHistMode] = useState<'numbers' | 'dots'>(dowHistoryMode);
  const [birthdayOpts, setBirthdayOpts] = useState<BirthdayBlockOpts>(birthdayBlockOpts);
  const [isSaving, setIsSaving] = useState(false);
  const [weightApplyMode, setWeightApplyMode] = useState<WeightApplyMode>('next-only');
  const [weightApplyDate, setWeightApplyDate] = useState(() => toLocalISO(new Date()));

  // DB maintenance modal state
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [maintenanceNeeded, setMaintenanceNeeded] = useState(false);

  // Sync local state when props change (workspace switch or external update)
  useEffect(() => {
    setWeights(dayWeights);
  }, [dayWeights]);
  useEffect(() => {
    setSigs(signatories);
  }, [signatories]);
  useEffect(() => {
    setPerDay(dutiesPerDay);
  }, [dutiesPerDay]);
  useEffect(() => {
    setAutoOpts(autoScheduleOptions);
  }, [autoScheduleOptions]);
  useEffect(() => {
    setMaxRows(printMaxRows);
  }, [printMaxRows]);
  useEffect(() => {
    setPrintAllUsers(printDutyTableShowAllUsers);
  }, [printDutyTableShowAllUsers]);
  useEffect(() => {
    setSkipAbsent(printSkipFullyAbsent);
  }, [printSkipFullyAbsent]);
  useEffect(() => {
    setIgnoreHistory(ignoreHistoryInLogic);
  }, [ignoreHistoryInLogic]);
  useEffect(() => {
    setScale(uiScale);
  }, [uiScale]);
  useEffect(() => {
    setHistWeeks(dowHistoryWeeks);
  }, [dowHistoryWeeks]);
  useEffect(() => {
    setHistMode(dowHistoryMode);
  }, [dowHistoryMode]);
  useEffect(() => {
    setBirthdayOpts(birthdayBlockOpts);
  }, [birthdayBlockOpts]);

  const { showAlert, showConfirm } = useDialog();

  // Dirty-change flags — used for the "unsaved changes" indicator and selective saves
  const weightsChanged = useMemo(
    () => JSON.stringify(weights) !== JSON.stringify(dayWeights),
    [weights, dayWeights]
  );
  const signatoriesChanged = useMemo(
    () => JSON.stringify(sigs) !== JSON.stringify(signatories),
    [sigs, signatories]
  );
  const autoOptionsChanged = useMemo(
    () => JSON.stringify(autoOpts) !== JSON.stringify(autoScheduleOptions),
    [autoOpts, autoScheduleOptions]
  );
  const logicAutoOptionsChanged =
    autoOpts.avoidConsecutiveDays !== autoScheduleOptions.avoidConsecutiveDays ||
    autoOpts.minRestDays !== autoScheduleOptions.minRestDays ||
    autoOpts.limitOneDutyPerWeekWhenSevenPlus !==
      autoScheduleOptions.limitOneDutyPerWeekWhenSevenPlus ||
    autoOpts.forceUseAllWhenFew !== autoScheduleOptions.forceUseAllWhenFew;
  const experimentalAutoOptionsChanged =
    autoOpts.evenWeeklyDistribution !== autoScheduleOptions.evenWeeklyDistribution ||
    autoOpts.considerLoad !== autoScheduleOptions.considerLoad ||
    autoOpts.aggressiveLoadBalancing !== autoScheduleOptions.aggressiveLoadBalancing ||
    autoOpts.aggressiveLoadBalancingThreshold !==
      autoScheduleOptions.aggressiveLoadBalancingThreshold ||
    !!autoOpts.useExperimentalStatsView !== !!autoScheduleOptions.useExperimentalStatsView;
  const dutiesChanged = perDay !== dutiesPerDay;
  const maxRowsChanged = maxRows !== printMaxRows;
  const printAllUsersChanged = printAllUsers !== printDutyTableShowAllUsers;
  const skipAbsentChanged = skipAbsent !== printSkipFullyAbsent;
  const ignoreHistoryChanged = ignoreHistory !== ignoreHistoryInLogic;
  const scaleChanged = scale !== uiScale;
  const histWeeksChanged = histWeeks !== dowHistoryWeeks;
  const histModeChanged = histMode !== dowHistoryMode;
  const birthdayOptsChanged = JSON.stringify(birthdayOpts) !== JSON.stringify(birthdayBlockOpts);
  const hasUnsavedChanges =
    weightsChanged ||
    signatoriesChanged ||
    dutiesChanged ||
    autoOptionsChanged ||
    maxRowsChanged ||
    printAllUsersChanged ||
    skipAbsentChanged ||
    ignoreHistoryChanged ||
    scaleChanged ||
    histWeeksChanged ||
    histModeChanged ||
    birthdayOptsChanged;
  const dirtySections = {
    logic: weightsChanged || dutiesChanged || logicAutoOptionsChanged || ignoreHistoryChanged,
    print: signatoriesChanged || maxRowsChanged || printAllUsersChanged || skipAbsentChanged,
    interface: scaleChanged || histWeeksChanged || histModeChanged || birthdayOptsChanged,
    experimental: experimentalAutoOptionsChanged,
  };

  /** Persist all changed settings sections and refresh app data. */
  const handleSaveSettings = useCallback(async () => {
    if (!hasUnsavedChanges) {
      await showAlert('Немає змін для збереження');
      return;
    }
    const sections: string[] = [];
    setIsSaving(true);
    try {
      if (weightsChanged) {
        await onSave(weights);
        sections.push('вага днів');

        // Recalculate schedule with new weights if requested
        if (weightApplyMode === 'recalculate-all' || weightApplyMode === 'recalculate-from') {
          let startDate: string;
          if (weightApplyMode === 'recalculate-all') {
            const allDates = Object.keys(schedule).sort();
            startDate = allDates[0] || toLocalISO(new Date());
          } else {
            startDate = weightApplyDate;
          }
          await recalculateScheduleFrom(
            startDate,
            users,
            schedule,
            weights,
            dutiesPerDay,
            autoScheduleOptions,
            ignoreHistoryInLogic
          );
          sections.push(
            weightApplyMode === 'recalculate-all'
              ? 'перерахунок усього графіку'
              : `перерахунок з ${weightApplyDate}`
          );
        }
      }
      if (dutiesChanged) {
        await onSaveDutiesPerDay(perDay);
        sections.push('чергові на добу');
      }
      if (autoOptionsChanged) {
        await onSaveAutoScheduleOptions(autoOpts);
        sections.push('алгоритм автозаповнення');
      }
      if (ignoreHistoryChanged) {
        await onSaveIgnoreHistoryInLogic(ignoreHistory);
        sections.push('режим історії');
      }
      if (scaleChanged) {
        await onSaveUiScale(scale);
        sections.push('масштаб інтерфейсу');
      }
      if (histWeeksChanged) {
        await onSaveDowHistoryWeeks(histWeeks);
        sections.push('індикатор повторів');
      }
      if (histModeChanged) {
        await onSaveDowHistoryMode(histMode);
        if (!histWeeksChanged) sections.push('індикатор повторів');
      }
      if (birthdayOptsChanged) {
        await onSaveBirthdayBlockOpts(birthdayOpts);
        sections.push('блокування дня народження');
      }
      if (signatoriesChanged) {
        await onSaveSignatories(sigs);
        sections.push('підписи та заголовок');
      }
      if (maxRowsChanged) {
        await onSavePrintMaxRows(maxRows);
        sections.push('параметри друку');
      }
      if (printAllUsersChanged) {
        await onSavePrintDutyTableShowAllUsers(printAllUsers);
        if (!maxRowsChanged) {
          sections.push('параметри друку');
        }
      }
      if (skipAbsentChanged) {
        await onSavePrintSkipFullyAbsent(skipAbsent);
        if (!maxRowsChanged && !printAllUsersChanged) {
          sections.push('параметри друку');
        }
      }
      setWeightApplyMode('next-only');
      await refreshData();
      await logAction('SETTINGS', `Збережено налаштування: ${sections.join(', ')}`);
      await showAlert('Налаштування збережено');
    } finally {
      setIsSaving(false);
    }
  }, [
    autoOptionsChanged,
    autoOpts,
    dutiesChanged,
    hasUnsavedChanges,
    ignoreHistory,
    ignoreHistoryChanged,
    logAction,
    maxRows,
    maxRowsChanged,
    onSavePrintDutyTableShowAllUsers,
    onSavePrintSkipFullyAbsent,
    skipAbsent,
    skipAbsentChanged,
    onSave,
    onSaveAutoScheduleOptions,
    onSaveDutiesPerDay,
    onSaveIgnoreHistoryInLogic,
    onSavePrintMaxRows,
    onSaveSignatories,
    onSaveUiScale,
    onSaveDowHistoryWeeks,
    onSaveDowHistoryMode,
    onSaveBirthdayBlockOpts,
    autoScheduleOptions,
    dutiesPerDay,
    ignoreHistoryInLogic,
    perDay,
    printAllUsers,
    printAllUsersChanged,
    refreshData,
    schedule,
    scale,
    scaleChanged,
    histWeeks,
    histWeeksChanged,
    histMode,
    histModeChanged,
    birthdayOpts,
    birthdayOptsChanged,
    showAlert,
    signatoriesChanged,
    sigs,
    users,
    weightApplyDate,
    weightApplyMode,
    weights,
    weightsChanged,
  ]);

  /** Bulk-set each user's "active since" date to their first duty date in the schedule. */
  const applyFirstDutyDates = useCallback(async () => {
    if (!(await showConfirm('Проставити "З дати" як перше чергування для всіх?'))) return;
    let changed = 0;
    for (const u of users) {
      if (!u.id) continue;
      const firstDuty = getFirstDutyDate(schedule, u.id);
      if (!firstDuty || u.dateAddedToAuto === firstDuty) continue;
      await userService.updateUser(u.id, { dateAddedToAuto: firstDuty });
      changed += 1;
    }
    if (changed === 0) {
      await showAlert('Немає змін');
      return;
    }
    await updateCascadeTrigger(toLocalISO(new Date()));
    await logAction('BULK_EDIT', `З дати = перше чергування (${changed} ос.)`);
    await refreshData();
    await showAlert(`Готово: оновлено ${changed}`);
  }, [logAction, refreshData, schedule, showAlert, showConfirm, updateCascadeTrigger, users]);

  /** Load DB stats and open the maintenance modal. */
  const handleOpenDbModal = useCallback(async () => {
    const stats = await performanceService.getDatabaseStats();
    const needs = await performanceService.checkMaintenanceNeeded();
    setDbStats(stats);
    setMaintenanceNeeded(needs);
    setShowDbModal(true);
  }, []);

  /** Run DB maintenance after confirmation, then reload stats. */
  const handleMaintenance = useCallback(async () => {
    const confirmed = await showConfirm(
      'Видалити старі дані (графіки старше 1 року, логи старше 6 місяців)?\n\nРекомендується робити експорт перед очищенням!'
    );
    if (!confirmed) return;
    const results = await performanceService.performMaintenance();
    await showAlert(
      `Очищено:\n• Логів: ${results.logsDeleted}\n• Старих графіків: ${results.oldSchedulesDeleted}`
    );
    await logAction(
      'MAINTENANCE',
      `Видалено логів: ${results.logsDeleted}, графіків: ${results.oldSchedulesDeleted}`
    );
    const stats = await performanceService.getDatabaseStats();
    const needs = await performanceService.checkMaintenanceNeeded();
    setDbStats(stats);
    setMaintenanceNeeded(needs);
  }, [logAction, showAlert, showConfirm]);

  return {
    weights,
    setWeights,
    sigs,
    setSigs,
    perDay,
    setPerDay,
    autoOpts,
    setAutoOpts,
    maxRows,
    setMaxRows,
    printAllUsers,
    setPrintAllUsers,
    skipAbsent,
    setSkipAbsent,
    ignoreHistory,
    setIgnoreHistory,
    scale,
    setScale,
    histWeeks,
    setHistWeeks,
    histMode,
    setHistMode,
    birthdayOpts,
    setBirthdayOpts,
    isSaving,
    hasUnsavedChanges,
    dirtySections,
    handleSaveSettings,
    applyFirstDutyDates,
    showDbModal,
    setShowDbModal,
    dbStats,
    maintenanceNeeded,
    handleOpenDbModal,
    handleMaintenance,
    weightApplyMode,
    setWeightApplyMode,
    weightApplyDate,
    setWeightApplyDate,
    weightsChanged,
  };
};
