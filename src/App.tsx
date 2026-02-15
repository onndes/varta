import React, { useState, useEffect } from 'react';
import { db } from './db/db';
import type { User, ScheduleEntry, DayWeights, Signatories } from './types';
import { DEFAULT_DAY_WEIGHTS, DEFAULT_SIGNATORIES, RANK_WEIGHTS } from './utils/constants';
import { toLocalISO } from './utils/helpers';

// Компоненты
import ScheduleView from './components/ScheduleView';
import UsersView from './components/UsersView';
import StatsView from './components/StatsView';
import SettingsView from './components/SettingsView';
import DevTools from './components/DevTools';
import Modal from './components/Modal';

// Стили
import './styles/main.scss';

const App = () => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [users, setUsers] = useState<User[]>([]);
  const [schedule, setSchedule] = useState<Record<string, ScheduleEntry>>({});

  // auditLog убран, так как не используется в UI этого компонента

  const [dayWeights, setDayWeights] = useState<DayWeights>(DEFAULT_DAY_WEIGHTS);
  const [signatories, setSignatories] = useState<Signatories>(DEFAULT_SIGNATORIES);
  const [loading, setLoading] = useState(true);
  const [printMode, setPrintMode] = useState<'calendar' | 'table'>('calendar');
  const [needsExport, setNeedsExport] = useState(false);
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  const [cascadeStartDate, setCascadeStartDate] = useState<string | null>(null);

  // --- Загрузка данных ---
  const loadData = async () => {
    try {
      setLoading(true);
      const weightsRec = await db.appState.get('dayWeights');
      const loadedWeights = weightsRec ? (weightsRec.value as DayWeights) : DEFAULT_DAY_WEIGHTS;
      setDayWeights(loadedWeights);

      const sigRec = await db.appState.get('signatories');
      if (sigRec) setSignatories(sigRec.value as Signatories);

      const sArray = await db.schedule.toArray();
      const sObj: Record<string, ScheduleEntry> = {};
      sArray.forEach((item) => (sObj[item.date] = item));

      const u = await db.users.toArray();
      u.sort((a, b) => {
        if (a.isActive !== b.isActive) return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
        const rankDiff = (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      });

      const dirtyState = await db.appState.get('needsExport');
      setNeedsExport(!!dirtyState?.value);

      const cascadeState = await db.appState.get('cascadeStartDate');
      setCascadeStartDate(cascadeState ? (cascadeState.value as string) : null);

      setUsers(u);
      setSchedule(sObj);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- Действия ---

  const saveDayWeights = async (newWeights: DayWeights) => {
    await db.appState.put({ key: 'dayWeights', value: newWeights });
    setDayWeights(newWeights);
  };

  const saveSignatories = async (newSig: Signatories) => {
    await db.appState.put({ key: 'signatories', value: newSig });
    setSignatories(newSig);
  };

  const checkBackupStatus = async () => {
    const lastExport = await db.appState.get('lastExportTimestamp');
    // Преобразуем строку даты обратно в объект Date для сравнения
    if (
      !lastExport ||
      Math.abs(new Date().getTime() - new Date(lastExport.value as string).getTime()) /
        (1000 * 60 * 60 * 24) >
        3
    ) {
      setShowBackupAlert(true);
    }
  };

  const logAction = async (action: string, details: string) => {
    await db.auditLog.add({ timestamp: new Date(), action, details });
    await db.appState.put({ key: 'needsExport', value: true });
    setNeedsExport(true);
    await checkBackupStatus();
  };

  const updateCascadeTrigger = async (date: string) => {
    if (!date) return;
    const current = await db.appState.get('cascadeStartDate');
    let newDate = date;
    if (current && current.value) {
      if (date < (current.value as string)) newDate = date;
      else newDate = current.value as string;
    }
    await db.appState.put({ key: 'cascadeStartDate', value: newDate });
    setCascadeStartDate(newDate);
  };

  const handleExport = async () => {
    const data = {
      version: 6,
      timestamp: new Date().toISOString(),
      users: await db.users.toArray(),
      schedule: await db.schedule.toArray(),
      auditLog: await db.auditLog.toArray(),
      dayWeights: await db.appState.get('dayWeights'),
      signatories: await db.appState.get('signatories'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `VARTA_BACKUP_${toLocalISO(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    await db.appState.put({ key: 'needsExport', value: false });
    // ИСПРАВЛЕНО: Сохраняем дату как строку (ISO)
    await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
    setNeedsExport(false);
    setShowBackupAlert(false);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const result = e.target?.result as string;
        const data = JSON.parse(result);
        if (!confirm('Замінити всі дані?')) return;

        await db.transaction('rw', db.users, db.schedule, db.auditLog, db.appState, async () => {
          await db.users.clear();
          await db.users.bulkAdd(data.users);
          await db.schedule.clear();
          await db.schedule.bulkAdd(data.schedule);
          await db.auditLog.clear();
          if (data.auditLog) await db.auditLog.bulkAdd(data.auditLog);

          if (data.dayWeights)
            await db.appState.put({ key: 'dayWeights', value: data.dayWeights.value });
          if (data.signatories)
            await db.appState.put({ key: 'signatories', value: data.signatories.value });

          await db.appState.put({ key: 'needsExport', value: false });
          await db.appState.put({ key: 'cascadeStartDate', value: null });
          // ИСПРАВЛЕНО: Сохраняем дату как строку (ISO)
          await db.appState.put({ key: 'lastExportTimestamp', value: new Date().toISOString() });
        });
        alert('Готово!');
        loadData();
      } catch (err) {
        console.error(err);
        alert('Помилка файлу');
      }
    };
    reader.readAsText(file);
  };

  // --- Рендер ---
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
              refreshData={loadData}
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
              refreshData={loadData}
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
          {activeTab === 'dev' && <DevTools refreshData={loadData} />}
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
