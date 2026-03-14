// src/hooks/useSettingsForm.ts
import { useState, useEffect, useMemo, useCallback } from 'react';
import type { DayWeights, Signatories, AutoScheduleOptions, User, ScheduleEntry } from '../types';
import type { DatabaseStats } from '../services/performanceService';
import * as performanceService from '../services/performanceService';
import { toLocalISO } from '../utils/dateUtils';
import { getFirstDutyDate } from '../utils/assignment';
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
  maxDebt: number;
  printMaxRows: number;
  printDutyTableShowAllUsers: boolean;
  ignoreHistoryInLogic: boolean;
  uiScale: number;
  onSave: (w: DayWeights) => Promise<void>;
  onSaveSignatories: (s: Signatories) => Promise<void>;
  onSaveDutiesPerDay: (count: number) => Promise<void>;
  onSaveAutoScheduleOptions: (opts: AutoScheduleOptions) => Promise<void>;
  onSaveMaxDebt: (value: number) => Promise<void>;
  onSavePrintMaxRows: (value: number) => Promise<void>;
  onSavePrintDutyTableShowAllUsers: (value: boolean) => Promise<void>;
  onSaveIgnoreHistoryInLogic: (value: boolean) => Promise<void>;
  onSaveUiScale: (value: number) => Promise<void>;
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
  maxDebt,
  printMaxRows,
  printDutyTableShowAllUsers,
  ignoreHistoryInLogic,
  uiScale,
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
  onSaveAutoScheduleOptions,
  onSaveMaxDebt,
  onSavePrintMaxRows,
  onSavePrintDutyTableShowAllUsers,
  onSaveIgnoreHistoryInLogic,
  onSaveUiScale,
  refreshData,
  updateCascadeTrigger,
  logAction,
}: UseSettingsFormProps) => {
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);
  const [perDay, setPerDay] = useState<number>(dutiesPerDay);
  const [autoOpts, setAutoOpts] = useState<AutoScheduleOptions>(autoScheduleOptions);
  const [debt, setDebt] = useState<number>(maxDebt);
  const [maxRows, setMaxRows] = useState<number>(printMaxRows);
  const [printAllUsers, setPrintAllUsers] = useState<boolean>(printDutyTableShowAllUsers);
  const [ignoreHistory, setIgnoreHistory] = useState<boolean>(ignoreHistoryInLogic);
  const [scale, setScale] = useState<number>(uiScale);
  const [isSaving, setIsSaving] = useState(false);

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
    setDebt(maxDebt);
  }, [maxDebt]);
  useEffect(() => {
    setMaxRows(printMaxRows);
  }, [printMaxRows]);
  useEffect(() => {
    setPrintAllUsers(printDutyTableShowAllUsers);
  }, [printDutyTableShowAllUsers]);
  useEffect(() => {
    setIgnoreHistory(ignoreHistoryInLogic);
  }, [ignoreHistoryInLogic]);
  useEffect(() => {
    setScale(uiScale);
  }, [uiScale]);

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
  const dutiesChanged = perDay !== dutiesPerDay;
  const debtChanged = debt !== maxDebt;
  const maxRowsChanged = maxRows !== printMaxRows;
  const printAllUsersChanged = printAllUsers !== printDutyTableShowAllUsers;
  const ignoreHistoryChanged = ignoreHistory !== ignoreHistoryInLogic;
  const scaleChanged = scale !== uiScale;
  const hasUnsavedChanges =
    weightsChanged ||
    signatoriesChanged ||
    dutiesChanged ||
    autoOptionsChanged ||
    debtChanged ||
    maxRowsChanged ||
    printAllUsersChanged ||
    ignoreHistoryChanged ||
    scaleChanged;

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
      }
      if (dutiesChanged) {
        await onSaveDutiesPerDay(perDay);
        sections.push('чергові на добу');
      }
      if (autoOptionsChanged) {
        await onSaveAutoScheduleOptions(autoOpts);
        sections.push('алгоритм автозаповнення');
      }
      if (debtChanged) {
        await onSaveMaxDebt(debt);
        sections.push('ліміт боргу');
      }
      if (ignoreHistoryChanged) {
        await onSaveIgnoreHistoryInLogic(ignoreHistory);
        sections.push('режим історії');
      }
      if (scaleChanged) {
        await onSaveUiScale(scale);
        sections.push('масштаб інтерфейсу');
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
      await refreshData();
      await logAction('SETTINGS', `Збережено налаштування: ${sections.join(', ')}`);
      await showAlert('Налаштування збережено');
    } finally {
      setIsSaving(false);
    }
  }, [
    autoOptionsChanged,
    autoOpts,
    debt,
    debtChanged,
    dutiesChanged,
    hasUnsavedChanges,
    ignoreHistory,
    ignoreHistoryChanged,
    logAction,
    maxRows,
    maxRowsChanged,
    onSavePrintDutyTableShowAllUsers,
    onSave,
    onSaveAutoScheduleOptions,
    onSaveDutiesPerDay,
    onSaveIgnoreHistoryInLogic,
    onSaveMaxDebt,
    onSavePrintMaxRows,
    onSaveSignatories,
    onSaveUiScale,
    perDay,
    printAllUsers,
    printAllUsersChanged,
    refreshData,
    scale,
    scaleChanged,
    showAlert,
    signatoriesChanged,
    sigs,
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
    const stats = await performanceService.getDatabaseStats();
    const needs = await performanceService.checkMaintenanceNeeded();
    setDbStats(stats);
    setMaintenanceNeeded(needs);
  }, [showAlert, showConfirm]);

  return {
    weights,
    setWeights,
    sigs,
    setSigs,
    perDay,
    setPerDay,
    autoOpts,
    setAutoOpts,
    debt,
    setDebt,
    maxRows,
    setMaxRows,
    printAllUsers,
    setPrintAllUsers,
    ignoreHistory,
    setIgnoreHistory,
    scale,
    setScale,
    isSaving,
    hasUnsavedChanges,
    handleSaveSettings,
    applyFirstDutyDates,
    showDbModal,
    setShowDbModal,
    dbStats,
    maintenanceNeeded,
    handleOpenDbModal,
    handleMaintenance,
  };
};
