import React, { useState, useEffect, useMemo } from 'react';
import type { PrintMode, PrintWeekRange, ScheduleDocumentMode } from './types';
import { useDialog } from './components/useDialog';
import { getActiveWorkspaceId } from './services/workspaceService';
import { getAppVersion, triggerPrint } from './utils/platform';
import { getCurrentMonday, getWeekDates } from './utils/dateUtils';
import { exportScheduleToExcel } from './services/scheduleExcelExportService';

// Hooks
import { useUsers, useSchedule, useSettings, useExport } from './hooks';

// Components
import Header from './components/Header';
import BackupAlert from './components/BackupAlert';
import ScheduleView from './components/ScheduleView';
import UsersView from './components/UsersView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';
import DevTools from './components/DevTools';
import AuditLogView from './components/AuditLogView';
import AppSidebar from './components/AppSidebar';
import PrintWeekRangeModal from './components/schedule/PrintWeekRangeModal';
import ScheduleViolationsAlert from './components/schedule/ScheduleViolationsAlert';
import { validateScheduleAgainstSettings } from './utils/scheduleValidation';
import type { ScheduleViolation } from './utils/scheduleValidation';

// Styles
import './styles/main.scss';

const App = () => {
  const APP_CHANNEL_LABEL = 'beta';
  const { showAlert, showConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState('schedule');
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>('calendar');
  const [printWeekRange, setPrintWeekRange] = useState<PrintWeekRange | null>(null);
  const [showPrintWeekRangeModal, setShowPrintWeekRangeModal] = useState(false);
  const [weekRangeAction, setWeekRangeAction] = useState<'print' | 'excel' | null>(null);
  // Print validation modal
  const [showViolationsModal, setShowViolationsModal] = useState(false);
  const [pendingPrintViolations, setPendingPrintViolations] = useState<ScheduleViolation[]>([]);
  const [pendingPrintAction, setPendingPrintAction] = useState<(() => void) | null>(null);
  const [currentWeekDates, setCurrentWeekDates] = useState<string[]>(() =>
    getWeekDates(getCurrentMonday())
  );
  const [workspaceVersion, setWorkspaceVersion] = useState(() => getActiveWorkspaceId());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  // Use custom hooks
  const { users, loading: usersLoading, loadUsers } = useUsers();
  const { schedule, dayWeights, loading: scheduleLoading, loadSchedule } = useSchedule(users);
  const {
    signatories,
    cascadeStartDate,
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
    karmaOnManualChanges,
    theme,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    saveDutiesPerDay,
    saveAutoScheduleOptions,
    saveMaxDebt,
    savePrintMaxRows,
    savePrintDutyTableShowAllUsers,
    saveIgnoreHistoryInLogic,
    saveUiScale,
    saveDowHistoryWeeks,
    saveDowHistoryMode,
    saveBirthdayBlockOpts,
    saveKarmaOnManualChanges,
    saveTheme,
    updateCascadeTrigger,
    clearCascadeTrigger,
  } = useSettings();
  const {
    needsExport,
    isBackupNeeded,
    exportData: handleExport,
    importData: handleImportData,
    logAction,
  } = useExport();
  const hasData = users.length > 0 || Object.keys(schedule).length > 0;

  const loading = usersLoading || scheduleLoading;

  // Combined refresh function for child components
  const refreshData = async () => {
    await Promise.all([loadUsers(), loadSchedule(), loadSettings()]);
  };

  const handleWorkspaceSwitch = async () => {
    await refreshData();
    // Перемонтовуємо вью, що кешують дані (наприклад, журнал)
    setWorkspaceVersion(getActiveWorkspaceId());
  };

  // Apply theme class to <body> and Bootstrap dark mode to <html>
  useEffect(() => {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
    if (theme !== 'light') {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-bs-theme');
    }
  }, [theme]);

  // Escape exits zen mode
  useEffect(() => {
    if (!zenMode) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZenMode(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [zenMode]);

  // Read runtime app version (Tauri bundle version or web package version)
  useEffect(() => {
    getAppVersion().then(setAppVersion);
  }, []);

  // Show one-time notice when app version changes (offline-friendly)
  useEffect(() => {
    if (!appVersion) return;
    const key = 'varta:last-seen-version';
    const prev = localStorage.getItem(key);
    if (!prev) {
      localStorage.setItem(key, appVersion);
      return;
    }
    if (prev !== appVersion) {
      showAlert(`Оновлено до версії ${appVersion}`);
      localStorage.setItem(key, appVersion);
    }
  }, [appVersion, showAlert]);

  const displayVersion = appVersion || import.meta.env.VITE_APP_VERSION || '0.0.0';
  const displayVersionLabel = `v${displayVersion}-${APP_CHANNEL_LABEL}`;

  // Global UI scale for cross-device readability
  useEffect(() => {
    const scale = Number.isFinite(uiScale) ? Math.min(160, Math.max(70, uiScale)) : 100;
    document.documentElement.style.fontSize = `${(16 * scale) / 100}px`;
  }, [uiScale]);

  // Check backup status when needed
  React.useEffect(() => {
    if (isBackupNeeded && hasData) {
      setShowBackupAlert(true);
    } else if (!hasData) {
      setShowBackupAlert(false);
    }
  }, [isBackupNeeded, hasData]);

  // Handle import
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!(await showConfirm('Замінити всі дані?'))) {
      input.value = '';
      return;
    }

    try {
      await handleImportData(file);
      await handleWorkspaceSwitch();
      setShowBackupAlert(false);
      await showAlert('Готово!');
    } catch (err) {
      console.error(err);
      await showAlert('Помилка файлу');
    } finally {
      input.value = '';
    }
  };

  // Handle print
  const runPrint = (mode: PrintMode, weekRange: PrintWeekRange | null = null) => {
    const previousTab = activeTab;
    setPrintMode(mode);
    setPrintWeekRange(weekRange);

    if (activeTab !== 'schedule') {
      setActiveTab('schedule');
    }

    const restoreTab = () => {
      if (previousTab !== 'schedule') {
        setActiveTab(previousTab);
      }
      setPrintMode('calendar');
      setPrintWeekRange(null);
    };

    // Use platform-aware print (works in browser, file://, and Tauri)
    triggerPrint(undefined, restoreTab);
  };

  const handlePrint = (mode: PrintMode) => {
    if (mode === 'week-calendar-table') {
      setWeekRangeAction('print');
      setShowPrintWeekRangeModal(true);
      return;
    }

    runPrint(mode);
  };

  const handleExportExcel = async (
    mode: ScheduleDocumentMode,
    weekRange: PrintWeekRange | null = null
  ) => {
    try {
      await exportScheduleToExcel({
        mode,
        users,
        schedule,
        signatories,
        weekDates: currentWeekDates,
        weekRange,
        maxRowsPerPage: printMaxRows,
      });
      await logAction('EXPORT', 'Таблиця Excel');
    } catch (err) {
      console.error(err);
      await showAlert('Не вдалося експортувати Excel');
    }
  };

  const requestExportExcel = (mode: ScheduleDocumentMode) => {
    if (mode === 'week-calendar-table') {
      setWeekRangeAction('excel');
      setShowPrintWeekRangeModal(true);
      return;
    }

    void handleExportExcel(mode);
  };

  // Compute schedule violations for the current visible week
  const scheduleViolations = useMemo(
    () =>
      validateScheduleAgainstSettings(
        schedule,
        users,
        autoScheduleOptions,
        dutiesPerDay,
        currentWeekDates
      ),
    [schedule, users, autoScheduleOptions, dutiesPerDay, currentWeekDates]
  );

  // Guard print/export: show violations modal if any exist
  const guardedPrint = (action: () => void) => {
    const violations = validateScheduleAgainstSettings(
      schedule,
      users,
      autoScheduleOptions,
      dutiesPerDay,
      currentWeekDates
    );
    if (violations.length > 0) {
      setPendingPrintViolations(violations);
      setPendingPrintAction(() => action);
      setShowViolationsModal(true);
    } else {
      action();
    }
  };

  const handleConfirmWeekRange = (range: PrintWeekRange) => {
    setShowPrintWeekRangeModal(false);
    const action = weekRangeAction;
    setWeekRangeAction(null);
    setPrintWeekRange(range);

    if (action === 'excel') {
      void handleExportExcel('week-calendar-table', range);
      return;
    }

    runPrint('week-calendar-table', range);
  };

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? 'app-shell--collapsed' : ''} ${zenMode ? 'app-shell--zen' : ''} show-print-${printMode}`}
    >
      {loading && (
        <div className="loading-overlay">
          <div className="spinner-border text-primary"></div>
        </div>
      )}

      <BackupAlert
        show={showBackupAlert}
        onClose={() => setShowBackupAlert(false)}
        onExport={handleExport}
      />
      {showPrintWeekRangeModal && (
        <PrintWeekRangeModal
          show={showPrintWeekRangeModal}
          initialRange={printWeekRange}
          title={
            weekRangeAction === 'excel'
              ? 'Експорт Excel: тижневий календар'
              : 'Друк: тижневий календар'
          }
          description="Оберіть рік і діапазон ISO-тижнів. Наприклад: 2026, з 1 по 13 тиждень."
          confirmLabel={weekRangeAction === 'excel' ? 'Експортувати в Excel' : 'Друкувати'}
          confirmIconClass={weekRangeAction === 'excel' ? 'fas fa-file-excel' : 'fas fa-print'}
          onClose={() => {
            setShowPrintWeekRangeModal(false);
            setWeekRangeAction(null);
          }}
          onConfirm={handleConfirmWeekRange}
        />
      )}

      {/* ─── Sidebar ────────────────────────────────────────────── */}
      <AppSidebar
        sidebarCollapsed={sidebarCollapsed}
        onCollapseToggle={() => setSidebarCollapsed((v) => !v)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        displayVersionLabel={displayVersionLabel}
      />

      {/* ─── Main area ──────────────────────────────────────────── */}
      <div className="app-main">
        <Header
          needsExport={needsExport && hasData}
          hasData={hasData}
          onImport={handleImport}
          onExport={handleExport}
          onPrint={(mode) => guardedPrint(() => handlePrint(mode))}
          onWorkspaceSwitch={handleWorkspaceSwitch}
          theme={theme}
          onSaveTheme={saveTheme}
          violationsCount={scheduleViolations.length}
        />

        <main
          className={`app-content ${activeTab === 'schedule' ? 'app-content--schedule' : ''} ${activeTab === 'settings' ? 'app-content--settings' : ''}`}
        >
          {activeTab === 'schedule' && (
            <ScheduleView
              key={workspaceVersion}
              users={users}
              schedule={schedule}
              onWeekDatesChange={setCurrentWeekDates}
              refreshData={refreshData}
              logAction={logAction}
              dayWeights={dayWeights}
              cascadeStartDate={cascadeStartDate}
              updateCascadeTrigger={updateCascadeTrigger}
              clearCascadeTrigger={clearCascadeTrigger}
              signatories={signatories}
              autoScheduleOptions={autoScheduleOptions}
              dutiesPerDay={dutiesPerDay}
              printMode={printMode}
              printWeekRange={printWeekRange}
              printMaxRows={printMaxRows}
              printDutyTableShowAllUsers={printDutyTableShowAllUsers}
              ignoreHistoryInLogic={ignoreHistoryInLogic}
              dowHistoryWeeks={dowHistoryWeeks}
              dowHistoryMode={dowHistoryMode}
              violationsCount={scheduleViolations.length}
              onPrint={(mode) => guardedPrint(() => handlePrint(mode))}
              zenMode={zenMode}
              onZenToggle={() => setZenMode((v) => !v)}
            />
          )}
          {activeTab === 'users' && (
            <UsersView
              users={users}
              schedule={schedule}
              refreshData={refreshData}
              logAction={logAction}
              dayWeights={dayWeights}
              updateCascadeTrigger={updateCascadeTrigger}
            />
          )}
          {activeTab === 'stats' && (
            <StatsView
              users={users}
              schedule={schedule}
              dayWeights={dayWeights}
              ignoreHistoryInLogic={ignoreHistoryInLogic}
              useExperimentalStatsView={!!autoScheduleOptions.useExperimentalStatsView}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              users={users}
              schedule={schedule}
              dayWeights={dayWeights}
              signatories={signatories}
              dutiesPerDay={dutiesPerDay}
              autoScheduleOptions={autoScheduleOptions}
              maxDebt={maxDebt}
              printMaxRows={printMaxRows}
              printDutyTableShowAllUsers={printDutyTableShowAllUsers}
              ignoreHistoryInLogic={ignoreHistoryInLogic}
              uiScale={uiScale}
              dowHistoryWeeks={dowHistoryWeeks}
              dowHistoryMode={dowHistoryMode}
              onSave={saveDayWeights}
              onSaveSignatories={saveSignatories}
              onSaveDutiesPerDay={saveDutiesPerDay}
              onSaveAutoScheduleOptions={saveAutoScheduleOptions}
              onSaveMaxDebt={saveMaxDebt}
              onSavePrintMaxRows={savePrintMaxRows}
              onSavePrintDutyTableShowAllUsers={savePrintDutyTableShowAllUsers}
              onSaveIgnoreHistoryInLogic={saveIgnoreHistoryInLogic}
              onSaveUiScale={saveUiScale}
              onSaveDowHistoryWeeks={saveDowHistoryWeeks}
              onSaveDowHistoryMode={saveDowHistoryMode}
              birthdayBlockOpts={birthdayBlockOpts}
              onSaveBirthdayBlockOpts={saveBirthdayBlockOpts}
              karmaOnManualChanges={karmaOnManualChanges}
              onSaveKarmaOnManualChanges={saveKarmaOnManualChanges}
              onExportExcel={(mode) => guardedPrint(() => requestExportExcel(mode))}
              refreshData={refreshData}
              updateCascadeTrigger={updateCascadeTrigger}
              logAction={logAction}
            />
          )}
          {activeTab === 'logs' && <AuditLogView key={workspaceVersion} />}
          {activeTab === 'dev' && <DevTools refreshData={refreshData} />}
        </main>

        <footer className="app-footer no-print">
          ВАРТА {displayVersionLabel} · Vladyslav V.V. ·{' '}
          <a href="mailto:vladvyljotnikov@gmail.com" className="text-muted">
            vladvyljotnikov@gmail.com
          </a>
        </footer>
      </div>

      {showViolationsModal && (
        <ScheduleViolationsAlert
          show={showViolationsModal}
          violations={pendingPrintViolations}
          onConfirmPrint={() => {
            setShowViolationsModal(false);
            pendingPrintAction?.();
            setPendingPrintAction(null);
          }}
          onCancel={() => {
            setShowViolationsModal(false);
            setPendingPrintAction(null);
          }}
        />
      )}
    </div>
  );
};

export default App;
