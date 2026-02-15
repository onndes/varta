import React, { useState } from 'react';

// Hooks
import { useUsers, useSchedule, useSettings, useExport } from './hooks';

// Components
import ScheduleView from './components/ScheduleView';
import UsersView from './components/UsersView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';
import DevTools from './components/DevTools';
import Modal from './components/Modal';

// Styles
import './styles/main.scss';

const App = () => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [printMode, setPrintMode] = useState<'calendar' | 'table'>('calendar');
  const [showBackupAlert, setShowBackupAlert] = useState(false);

  // Use custom hooks
  const { users, loading: usersLoading, loadUsers } = useUsers();
  const { schedule, dayWeights, loading: scheduleLoading, loadSchedule } = useSchedule(users);
  const { signatories, cascadeStartDate, saveDayWeights, saveSignatories, updateCascadeTrigger } =
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
    await Promise.all([loadUsers(), loadSchedule()]);
  };

  // Check backup status when needed
  React.useEffect(() => {
    if (isBackupNeeded) {
      setShowBackupAlert(true);
    }
  }, [isBackupNeeded]);

  // Handle import
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm('Замінити всі дані?')) return;

    try {
      await handleImportData(file);
      alert('Готово!');
    } catch (err) {
      console.error(err);
      alert('Помилка файлу');
    }
  };

  // Render
  return (
    <div
      className={`main-container ${printMode === 'calendar' ? 'show-print-calendar' : 'show-print-table'}`}
    >
      {loading && (
        <div className="loading-overlay">
          <div className="spinner-border text-primary"></div>
        </div>
      )}

      <Modal
        show={showBackupAlert}
        onClose={() => setShowBackupAlert(false)}
        title="УВАГА: ПОТРІБЕН БЕКАП"
        size="modal-md"
      >
        <div className="text-center">
          <div className="text-danger mb-3">
            <i className="fas fa-exclamation-circle fa-4x"></i>
          </div>
          <h5>Давно не було резервного копіювання!</h5>
          <button className="btn btn-danger btn-lg w-100 mt-3" onClick={handleExport}>
            <i className="fas fa-file-download me-2"></i>ЕКСПОРТ
          </button>
        </div>
      </Modal>

      {/* HEADER */}
      <div className="header-simple d-flex justify-content-between align-items-center no-print">
        <div className="d-flex align-items-center">
          <div
            className="bg-dark text-white rounded p-2 me-3 d-flex align-items-center justify-content-center"
            style={{ width: 45, height: 45 }}
          >
            <i className="fas fa-shield-alt fa-lg"></i>
          </div>
          <div>
            <h4 className="m-0 fw-bold text-dark">ВАРТА-2026</h4>
            <small className="text-muted">Система розподілу</small>
          </div>
        </div>
        <div className="d-flex gap-2">
          <label className="btn btn-outline-secondary btn-sm">
            <i className="fas fa-upload me-1"></i>Імпорт
            <input type="file" hidden onChange={handleImport} accept=".json" />
          </label>
          <button
            className={`btn btn-sm ${needsExport ? 'btn-danger btn-export-dirty' : 'btn-outline-secondary'}`}
            onClick={handleExport}
          >
            <i className="fas fa-download me-1"></i>Експорт
          </button>
          <button
            className="btn btn-dark btn-sm"
            onClick={() => {
              setPrintMode('calendar');
              setTimeout(window.print, 100);
            }}
          >
            <i className="fas fa-print me-1"></i>Друк
          </button>
        </div>
      </div>

      <div className="px-4">
        <ul className="nav nav-tabs mb-4 no-print">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'schedule' ? 'active fw-bold' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              Графік
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'users' ? 'active fw-bold' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Особовий склад
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'stats' ? 'active fw-bold' : ''}`}
              onClick={() => setActiveTab('stats')}
            >
              Статистика
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'settings' ? 'active fw-bold' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              Налаштування
            </button>
          </li>
          <li className="nav-item ms-auto">
            <button
              className={`nav-link ${activeTab === 'dev' ? 'active fw-bold text-danger' : 'text-muted'}`}
              onClick={() => setActiveTab('dev')}
            >
              DEV
            </button>
          </li>
        </ul>

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

      {/* PRINT FOOTER */}
      <div className="print-only print-footer-container">
        <div className="d-flex align-items-end">
          <div style={{ marginRight: '15px', fontWeight: 'bold', paddingBottom: '20px' }}>
            Графік склав:
          </div>
          <div style={{ width: '350px' }}>
            <div className="fw-bold text-center">{signatories.creatorRank}</div>
            <div style={{ borderBottom: '1px solid black', width: '100%', height: '20px' }}></div>
            <div className="fw-bold text-center">{signatories.creatorName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
