import React, { useState } from 'react';

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

// Styles
import './styles/main.scss';

const App = () => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [showBackupAlert, setShowBackupAlert] = useState(false);

  // Use custom hooks
  const { users, loading: usersLoading, loadUsers } = useUsers();
  const { schedule, dayWeights, loading: scheduleLoading, loadSchedule } = useSchedule(users);
  const {
    signatories,
    cascadeStartDate,
    loadSettings,
    saveDayWeights,
    saveSignatories,
    updateCascadeTrigger,
    clearCascadeTrigger,
  } =
    useSettings();
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

    if (!confirm('Замінити всі дані?')) {
      input.value = '';
      return;
    }

    try {
      await handleImportData(file);
      await refreshData();
      setShowBackupAlert(false);
      alert('Готово!');
    } catch (err) {
      console.error(err);
      alert('Помилка файлу');
    } finally {
      input.value = '';
    }
  };

  // Handle print
  const handlePrint = () => {
    const previousTab = activeTab;

    if (activeTab !== 'schedule') {
      setActiveTab('schedule');
    }

    const restoreTab = () => {
      if (previousTab !== 'schedule') {
        setActiveTab(previousTab);
      }
    };

    window.addEventListener('afterprint', restoreTab, { once: true });
    setTimeout(() => window.print(), activeTab === 'schedule' ? 100 : 250);
  };

  return (
    <div className="main-container show-print-calendar">
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
        onImport={handleImport}
        onExport={handleExport}
        onPrint={handlePrint}
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
              onSave={saveDayWeights}
              onSaveSignatories={saveSignatories}
            />
          )}
          {activeTab === 'dev' && <DevTools refreshData={refreshData} />}
        </div>
      </div>
    </div>
  );
};

export default App;
