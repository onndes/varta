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
  maxDebt: number;
  printMaxRows: number;
  printDutyTableShowAllUsers: boolean;
  ignoreHistoryInLogic: boolean;
  uiScale: number;
  dowHistoryWeeks: number;
  dowHistoryMode: 'numbers' | 'dots';
  onSave: (w: DayWeights) => Promise<void>;
  onSaveSignatories: (s: Signatories) => Promise<void>;
  onSaveDutiesPerDay: (count: number) => Promise<void>;
  onSaveAutoScheduleOptions: (opts: AutoScheduleOptions) => Promise<void>;
  onSaveMaxDebt: (value: number) => Promise<void>;
  onSavePrintMaxRows: (value: number) => Promise<void>;
  onSavePrintDutyTableShowAllUsers: (value: boolean) => Promise<void>;
  onSaveIgnoreHistoryInLogic: (value: boolean) => Promise<void>;
  onSaveUiScale: (value: number) => Promise<void>;
  onSaveDowHistoryWeeks: (value: number) => Promise<void>;
  onSaveDowHistoryMode: (value: 'numbers' | 'dots') => Promise<void>;
  birthdayBlockOpts: BirthdayBlockOpts;
  onSaveBirthdayBlockOpts: (opts: BirthdayBlockOpts) => Promise<void>;
  karmaOnManualChanges: boolean;
  onSaveKarmaOnManualChanges: (value: boolean) => Promise<void>;
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
  dowHistoryWeeks,
  dowHistoryMode,
  birthdayBlockOpts,
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
  onSaveAutoScheduleOptions,
  onSaveMaxDebt,
  onSavePrintMaxRows,
  onSavePrintDutyTableShowAllUsers,
  onSaveIgnoreHistoryInLogic,
  onSaveUiScale,
  onSaveDowHistoryWeeks,
  onSaveDowHistoryMode,
  onSaveBirthdayBlockOpts,
  karmaOnManualChanges,
  onSaveKarmaOnManualChanges,
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
  const [histWeeks, setHistWeeks] = useState<number>(dowHistoryWeeks);
  const [histMode, setHistMode] = useState<'numbers' | 'dots'>(dowHistoryMode);
  const [birthdayOpts, setBirthdayOpts] = useState<BirthdayBlockOpts>(birthdayBlockOpts);
  const [karmaManual, setKarmaManual] = useState(karmaOnManualChanges);
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
  useEffect(() => {
    setHistWeeks(dowHistoryWeeks);
  }, [dowHistoryWeeks]);
  useEffect(() => {
    setHistMode(dowHistoryMode);
  }, [dowHistoryMode]);
  useEffect(() => {
    setBirthdayOpts(birthdayBlockOpts);
  }, [birthdayBlockOpts]);
  useEffect(() => {
    setKarmaManual(karmaOnManualChanges);
  }, [karmaOnManualChanges]);

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
    autoOpts.respectOwedDays !== autoScheduleOptions.respectOwedDays ||
    autoOpts.minRestDays !== autoScheduleOptions.minRestDays ||
    autoOpts.limitOneDutyPerWeekWhenSevenPlus !==
      autoScheduleOptions.limitOneDutyPerWeekWhenSevenPlus ||
    autoOpts.forceUseAllWhenFew !== autoScheduleOptions.forceUseAllWhenFew ||
    autoOpts.allowDebtUsersExtraWeeklyAssignments !==
      autoScheduleOptions.allowDebtUsersExtraWeeklyAssignments ||
    autoOpts.debtUsersWeeklyLimit !== autoScheduleOptions.debtUsersWeeklyLimit ||
    autoOpts.prioritizeFasterDebtRepayment !== autoScheduleOptions.prioritizeFasterDebtRepayment;
  const experimentalAutoOptionsChanged =
    autoOpts.evenWeeklyDistribution !== autoScheduleOptions.evenWeeklyDistribution ||
    autoOpts.considerLoad !== autoScheduleOptions.considerLoad ||
    autoOpts.aggressiveLoadBalancing !== autoScheduleOptions.aggressiveLoadBalancing ||
    autoOpts.aggressiveLoadBalancingThreshold !==
      autoScheduleOptions.aggressiveLoadBalancingThreshold ||
    !!autoOpts.useExperimentalStatsView !== !!autoScheduleOptions.useExperimentalStatsView;
  const dutiesChanged = perDay !== dutiesPerDay;
  const debtChanged = debt !== maxDebt;
  const maxRowsChanged = maxRows !== printMaxRows;
  const printAllUsersChanged = printAllUsers !== printDutyTableShowAllUsers;
  const ignoreHistoryChanged = ignoreHistory !== ignoreHistoryInLogic;
  const scaleChanged = scale !== uiScale;
  const histWeeksChanged = histWeeks !== dowHistoryWeeks;
  const histModeChanged = histMode !== dowHistoryMode;
  const birthdayOptsChanged = JSON.stringify(birthdayOpts) !== JSON.stringify(birthdayBlockOpts);
  const karmaManualChanged = karmaManual !== karmaOnManualChanges;
  const hasUnsavedChanges =
    weightsChanged ||
    signatoriesChanged ||
    dutiesChanged ||
    autoOptionsChanged ||
    debtChanged ||
    maxRowsChanged ||
    printAllUsersChanged ||
    ignoreHistoryChanged ||
    scaleChanged ||
    histWeeksChanged ||
    histModeChanged ||
    birthdayOptsChanged ||
    karmaManualChanged;
  const dirtySections = {
    logic:
      weightsChanged ||
      dutiesChanged ||
      logicAutoOptionsChanged ||
      debtChanged ||
      ignoreHistoryChanged ||
      karmaManualChanged,
    print: signatoriesChanged || maxRowsChanged || printAllUsersChanged,
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
      if (debtChanged) {
        await onSaveMaxDebt(debt);
        sections.push('ліміт боргу');
      }
      if (ignoreHistoryChanged) {
        await onSaveIgnoreHistoryInLogic(ignoreHistory);
        sections.push('режим історії');
      }
      if (karmaManualChanged) {
        await onSaveKarmaOnManualChanges(karmaManual);
        sections.push('карма при ручних змінах');
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
    debt,
    debtChanged,
    dutiesChanged,
    hasUnsavedChanges,
    ignoreHistory,
    ignoreHistoryChanged,
    karmaManual,
    karmaManualChanged,
    logAction,
    maxRows,
    maxRowsChanged,
    onSavePrintDutyTableShowAllUsers,
    onSave,
    onSaveAutoScheduleOptions,
    onSaveDutiesPerDay,
    onSaveIgnoreHistoryInLogic,
    onSaveKarmaOnManualChanges,
    onSaveMaxDebt,
    onSavePrintMaxRows,
    onSaveSignatories,
    onSaveUiScale,
    onSaveDowHistoryWeeks,
    onSaveDowHistoryMode,
    onSaveBirthdayBlockOpts,
    perDay,
    printAllUsers,
    printAllUsersChanged,
    refreshData,
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

  /** Reset karma (debt + owedDays) for all users to zero. */
  const handleResetAllKarma = useCallback(async () => {
    const confirmed = await showConfirm(
      'Скинути карму (борг та бонуси) та боргові дні для всіх осіб?\n\nЦю дію неможливо скасувати.'
    );
    if (!confirmed) return;
    await userService.resetAllKarma();
    await logAction('KARMA_RESET', 'Скинуто карму всіх осіб');
    await refreshData();
    await showAlert('Карму скинуто для всіх осіб');
  }, [logAction, refreshData, showAlert, showConfirm]);

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
    histWeeks,
    setHistWeeks,
    histMode,
    setHistMode,
    birthdayOpts,
    setBirthdayOpts,
    karmaManual,
    setKarmaManual,
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
    handleResetAllKarma,
    weightApplyMode,
    setWeightApplyMode,
    weightApplyDate,
    setWeightApplyDate,
    weightsChanged,
  };
};
