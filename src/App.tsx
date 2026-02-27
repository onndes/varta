import React, { useState, useEffect } from 'react';
import type { PrintMode } from './types';
import { useDialog } from './components/useDialog';
import { getActiveWorkspaceId } from './services/workspaceService';
import { triggerPrint } from './utils/platform';

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
import InfoButton from './components/InfoButton';

// Styles
import './styles/main.scss';

const App = () => {
  const { showAlert, showConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState('schedule');
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>('calendar');
  const [workspaceVersion, setWorkspaceVersion] = useState(() => getActiveWorkspaceId());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    ignoreHistoryInLogic,
    uiScale,
    theme,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    saveDutiesPerDay,
    saveAutoScheduleOptions,
    saveMaxDebt,
    savePrintMaxRows,
    saveIgnoreHistoryInLogic,
    saveUiScale,
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

  // Global UI scale for cross-device readability
  useEffect(() => {
    const scale = Number.isFinite(uiScale) ? Math.min(130, Math.max(85, uiScale)) : 100;
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
      await refreshData();
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
  const handlePrint = (mode: PrintMode) => {
    const previousTab = activeTab;
    setPrintMode(mode);

    if (activeTab !== 'schedule') {
      setActiveTab('schedule');
    }

    const restoreTab = () => {
      if (previousTab !== 'schedule') {
        setActiveTab(previousTab);
      }
      setPrintMode('calendar');
    };

    // Use platform-aware print (works in browser, file://, and Tauri)
    triggerPrint(undefined, restoreTab);
  };

  const NAV_TABS = [
    { id: 'schedule', icon: 'fa-calendar-alt', label: 'Графік' },
    { id: 'users', icon: 'fa-users', label: 'Особовий склад' },
    { id: 'stats', icon: 'fa-chart-bar', label: 'Статистика' },
    { id: 'settings', icon: 'fa-cog', label: 'Налаштування' },
    { id: 'logs', icon: 'fa-history', label: 'Журнал' },
  ];

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? 'app-shell--collapsed' : ''} show-print-${printMode}`}
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

      {/* ─── Sidebar ────────────────────────────────────────────── */}
      <aside className="app-sidebar no-print">
        <div className="app-sidebar__brand">
          <div className="app-sidebar__brand-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <div className="app-sidebar__brand-text">
            <span className="app-sidebar__brand-name">ВАРТА</span>
            <span className="app-sidebar__brand-sub">v1.0-beta</span>
          </div>
        </div>

        <nav className="app-sidebar__nav">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`app-sidebar__item ${activeTab === tab.id ? 'app-sidebar__item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <i className={`fas ${tab.icon} app-sidebar__icon`}></i>
              <span className="app-sidebar__label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="app-sidebar__bottom">
          <InfoButton />
          <button
            className="app-sidebar__collapse-btn"
            onClick={() => setSidebarCollapsed((v) => !v)}
            title={sidebarCollapsed ? 'Розгорнути' : 'Згорнути'}
          >
            <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`}></i>
            <span className="app-sidebar__collapse-label">
              {sidebarCollapsed ? 'Розгорнути' : 'Згорнути'}
            </span>
          </button>
        </div>
      </aside>

      {/* ─── Main area ──────────────────────────────────────────── */}
      <div className="app-main">
        <Header
          needsExport={needsExport && hasData}
          hasData={hasData}
          onImport={handleImport}
          onExport={handleExport}
          onPrint={handlePrint}
          onWorkspaceSwitch={handleWorkspaceSwitch}
          theme={theme}
          onSaveTheme={saveTheme}
        />

        <main className="app-content">
          {activeTab === 'schedule' && (
            <ScheduleView
              users={users}
              schedule={schedule}
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
              printMaxRows={printMaxRows}
              ignoreHistoryInLogic={ignoreHistoryInLogic}
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
              refreshData={refreshData}
              logAction={logAction}
              updateCascadeTrigger={updateCascadeTrigger}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              dayWeights={dayWeights}
              signatories={signatories}
              dutiesPerDay={dutiesPerDay}
              autoScheduleOptions={autoScheduleOptions}
              maxDebt={maxDebt}
              printMaxRows={printMaxRows}
              ignoreHistoryInLogic={ignoreHistoryInLogic}
              uiScale={uiScale}
              onSave={saveDayWeights}
              onSaveSignatories={saveSignatories}
              onSaveDutiesPerDay={saveDutiesPerDay}
              onSaveAutoScheduleOptions={saveAutoScheduleOptions}
              onSaveMaxDebt={saveMaxDebt}
              onSavePrintMaxRows={savePrintMaxRows}
              onSaveIgnoreHistoryInLogic={saveIgnoreHistoryInLogic}
              onSaveUiScale={saveUiScale}
              logAction={logAction}
            />
          )}
          {activeTab === 'logs' && <AuditLogView key={workspaceVersion} />}
          {activeTab === 'dev' && import.meta.env.DEV && <DevTools refreshData={refreshData} />}
        </main>

        <footer className="app-footer no-print">
          ВАРТА v1.0-beta · Vladyslav V.V. ·{' '}
          <a href="mailto:vladvyljotnikov@gmail.com" className="text-muted">
            vladvyljotnikov@gmail.com
          </a>
        </footer>
      </div>
    </div>
  );
};

export default App;
