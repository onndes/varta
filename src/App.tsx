import React, { useState } from 'react';
import type { PrintMode } from './types';
import { useDialog } from './components/useDialog';
import { getActiveWorkspaceId } from './services/workspaceService';

// Hooks
import { useUsers, useSchedule, useSettings, useExport } from './hooks';

// Components
import Header from './components/Header';
import Navigation from './components/Navigation';
import BackupAlert from './components/BackupAlert';
import ScheduleView from './components/ScheduleView';
import UsersView from './components/UsersView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';
import DevTools from './components/DevTools';
import AuditLogView from './components/AuditLogView';

// Styles
import './styles/main.scss';

const App = () => {
  const { showAlert, showConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState('schedule');
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>('calendar');
  const [workspaceVersion, setWorkspaceVersion] = useState(() => getActiveWorkspaceId());

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
    loadSettings,
    saveDayWeights,
    saveSignatories,
    saveDutiesPerDay,
    saveAutoScheduleOptions,
    saveMaxDebt,
    savePrintMaxRows,
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

  // Check backup status when needed
  React.useEffect(() => {
    if (isBackupNeeded) {
      setShowBackupAlert(true);
    }
  }, [isBackupNeeded]);

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

    window.addEventListener('afterprint', restoreTab, { once: true });
    setTimeout(() => window.print(), activeTab === 'schedule' ? 100 : 250);
  };

  return (
    <div className={`main-container show-print-${printMode}`}>
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

      <Header
        needsExport={needsExport}
        hasData={users.length > 0 || Object.keys(schedule).length > 0}
        onImport={handleImport}
        onExport={handleExport}
        onPrint={handlePrint}
        onWorkspaceSwitch={handleWorkspaceSwitch}
      />

      <div className="px-4">
        <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
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
            <StatsView users={users} schedule={schedule} dayWeights={dayWeights} />
          )}
          {activeTab === 'settings' && (
            <SettingsView
              dayWeights={dayWeights}
              signatories={signatories}
              dutiesPerDay={dutiesPerDay}
              autoScheduleOptions={autoScheduleOptions}
              maxDebt={maxDebt}
              printMaxRows={printMaxRows}
              onSave={saveDayWeights}
              onSaveSignatories={saveSignatories}
              onSaveDutiesPerDay={saveDutiesPerDay}
              onSaveAutoScheduleOptions={saveAutoScheduleOptions}
              onSaveMaxDebt={saveMaxDebt}
              onSavePrintMaxRows={savePrintMaxRows}
              logAction={logAction}
            />
          )}
          {activeTab === 'logs' && <AuditLogView key={workspaceVersion} />}
          {activeTab === 'dev' && <DevTools refreshData={refreshData} />}
        </div>

        {/* Футер додатку */}
        <footer
          className="text-center text-muted py-3 mt-4 border-top no-print"
          style={{ fontSize: '0.75rem', opacity: 0.5 }}
        >
          ВАРТА v1.0 · Vladyslav V.V. ·{' '}
          <a href="mailto:vladvyljotnikov@gmail.com" className="text-muted">
            vladvyljotnikov@gmail.com
          </a>
        </footer>
      </div>
    </div>
  );
};

export default App;
