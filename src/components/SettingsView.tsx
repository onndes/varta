// src/components/SettingsView.tsx
import React, { useState } from 'react';
import type {
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  User,
  ScheduleEntry,
  ScheduleDocumentMode,
} from '../types';
import Modal from './Modal';
import LogicTabPanel from './settings/LogicTabPanel';
import PrintTabPanel from './settings/PrintTabPanel';
import InterfaceTabPanel from './settings/InterfaceTabPanel';
import { useSettingsForm } from '../hooks/useSettingsForm';

interface SettingsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  signatories: Signatories;
  dutiesPerDay: number;
  autoScheduleOptions: AutoScheduleOptions;
  maxDebt: number;
  printMaxRows: number;
  ignoreHistoryInLogic: boolean;
  uiScale: number;
  onSave: (w: DayWeights) => Promise<void>;
  onSaveSignatories: (s: Signatories) => Promise<void>;
  onSaveDutiesPerDay: (count: number) => Promise<void>;
  onSaveAutoScheduleOptions: (opts: AutoScheduleOptions) => Promise<void>;
  onSaveMaxDebt: (value: number) => Promise<void>;
  onSavePrintMaxRows: (value: number) => Promise<void>;
  onSaveIgnoreHistoryInLogic: (value: boolean) => Promise<void>;
  onSaveUiScale: (value: number) => Promise<void>;
  onExportExcel: (mode: ScheduleDocumentMode) => void;
  refreshData: () => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

type SubTab = 'logic' | 'interface' | 'print';

/** Top-level settings screen with logic / print / interface sub-tabs. */
const SettingsView: React.FC<SettingsViewProps> = (props) => {
  const [subTab, setSubTab] = useState<SubTab>('logic');
  const {
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
  } = useSettingsForm(props);

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <ul className="nav nav-pills">
          <li className="nav-item">
            <button
              className={`nav-link ${subTab === 'logic' ? 'active' : ''}`}
              onClick={() => setSubTab('logic')}
            >
              <i className="fas fa-cogs me-1"></i>Логіка графіка
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${subTab === 'print' ? 'active' : ''}`}
              onClick={() => setSubTab('print')}
            >
              <i className="fas fa-print me-1"></i>Друк
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${subTab === 'interface' ? 'active' : ''}`}
              onClick={() => setSubTab('interface')}
            >
              <i className="fas fa-display me-1"></i>Інтерфейс
            </button>
          </li>
        </ul>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => void handleOpenDbModal()}
          title="Обслуговування бази даних"
        >
          <i className="fas fa-database me-1"></i>База даних
        </button>
      </div>

      {/* Tab panels */}
      {subTab === 'logic' && (
        <LogicTabPanel
          weights={weights}
          onWeightsChange={setWeights}
          perDay={perDay}
          onPerDayChange={setPerDay}
          autoOpts={autoOpts}
          onAutoOptsChange={setAutoOpts}
          debt={debt}
          onDebtChange={setDebt}
          ignoreHistory={ignoreHistory}
          onIgnoreHistoryChange={setIgnoreHistory}
          onApplyFirstDutyDates={() => void applyFirstDutyDates()}
        />
      )}
      {subTab === 'interface' && <InterfaceTabPanel scale={scale} onScaleChange={setScale} />}
      {subTab === 'print' && (
        <PrintTabPanel
          sigs={sigs}
          onSigsChange={setSigs}
          maxRows={maxRows}
          onMaxRowsChange={setMaxRows}
          onExportExcel={props.onExportExcel}
        />
      )}

      {/* Save footer */}
      <div className="card shadow-sm border-0 mt-4">
        <div className="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div>
            <div className="fw-bold">Збереження налаштувань</div>
            <div className="text-muted small">
              {hasUnsavedChanges
                ? 'Є незбережені зміни. Вони застосуються тільки після натискання кнопки.'
                : 'Змін немає. Поточні налаштування вже збережені.'}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => void handleSaveSettings()}
            disabled={!hasUnsavedChanges || isSaving}
          >
            <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'} me-2`}></i>
            {isSaving ? 'Збереження...' : 'Зберегти налаштування'}
          </button>
        </div>
      </div>

      {/* DB Maintenance Modal */}
      <Modal
        show={showDbModal}
        onClose={() => setShowDbModal(false)}
        title="Обслуговування бази даних"
      >
        {dbStats ? (
          <>
            <div className="alert alert-info py-2 small mb-3">
              <strong>Статистика бази:</strong>
              <ul className="mb-0 mt-2">
                <li>Осіб: {dbStats.counts.users}</li>
                <li>Графіків: {dbStats.counts.schedule}</li>
                <li>Логів: {dbStats.counts.auditLog}</li>
                <li>Приблизний розмір: ~{dbStats.estimatedSizeKB.total.toFixed(0)} КБ</li>
              </ul>
            </div>
            {maintenanceNeeded && (
              <div className="alert alert-warning py-2 small mb-3">
                <i className="fas fa-exclamation-triangle me-2"></i>
                <strong>Рекомендується очищення!</strong> База містить багато старих даних.
              </div>
            )}
            <button
              className={`btn ${maintenanceNeeded ? 'btn-warning' : 'btn-outline-secondary'} btn-sm`}
              onClick={() => void handleMaintenance()}
            >
              <i className="fas fa-broom me-2"></i>Очистити старі дані
            </button>
            <div className="small text-muted mt-3">
              <strong>Що видаляється:</strong>
              <ul className="mb-0">
                <li>Графіки старше 1 року</li>
                <li>Логи старше 6 місяців</li>
              </ul>
              <p className="mb-0 mt-2">
                <i className="fas fa-info-circle me-1"></i>
                Зробіть експорт даних перед очищенням!
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm text-primary"></div>
            <span className="ms-2">Завантаження...</span>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SettingsView;
