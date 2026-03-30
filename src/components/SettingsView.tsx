// src/components/SettingsView.tsx
import React, { useState } from 'react';
import type {
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  User,
  ScheduleEntry,
  ScheduleDocumentMode,
  BirthdayBlockOpts,
} from '../types';
import Modal from './Modal';
import LogicTabPanel from './settings/LogicTabPanel';
import PrintTabPanel from './settings/PrintTabPanel';
import InterfaceTabPanel from './settings/InterfaceTabPanel';
import ExperimentalTabPanel from './settings/ExperimentalTabPanel';
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
  onExportExcel: (mode: ScheduleDocumentMode) => void;
  refreshData: () => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

type SubTab = 'logic' | 'interface' | 'print' | 'experimental';

const SUBTAB_LABELS: Record<SubTab, string> = {
  logic: 'Логіка графіка',
  print: 'Друк',
  interface: 'Інтерфейс',
  experimental: 'Експериментальні',
};

const SUBTABS: Array<{
  key: SubTab;
  icon: string;
  muted?: boolean;
  extraClass?: string;
  title?: string;
}> = [
  { key: 'logic', icon: 'fa-cogs' },
  { key: 'print', icon: 'fa-print' },
  { key: 'interface', icon: 'fa-display' },
  {
    key: 'experimental',
    icon: 'fa-flask',
    muted: true,
    extraClass: 'ms-3',
    title: 'Експериментальні та нестандартні налаштування',
  },
];

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
  } = useSettingsForm(props);
  const dirtyTabLabels = (Object.entries(dirtySections) as Array<[SubTab, boolean]>)
    .filter(([, isDirty]) => isDirty)
    .map(([tab]) => SUBTAB_LABELS[tab]);

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <ul className="nav nav-pills">
          {SUBTABS.map(({ key, icon, muted, extraClass, title }) => (
            <li key={key} className={`nav-item ${extraClass ?? ''}`}>
              <button
                className={[
                  'nav-link',
                  subTab === key && 'active',
                  muted && (subTab === key ? 'opacity-100' : 'text-secondary opacity-50 small'),
                  dirtySections[key] && 'settings-subtab-dirty',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setSubTab(key)}
                title={title}
              >
                <i className={`fas ${icon} me-1`}></i>
                {SUBTAB_LABELS[key]}
                {dirtySections[key] && (
                  <span className="badge bg-warning text-dark ms-2">Не збережено</span>
                )}
              </button>
            </li>
          ))}
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
          birthdayOpts={birthdayOpts}
          onBirthdayOptsChange={setBirthdayOpts}
          karmaManual={karmaManual}
          onKarmaManualChange={setKarmaManual}
          onResetAllKarma={handleResetAllKarma}
        />
      )}
      {subTab === 'interface' && (
        <InterfaceTabPanel
          scale={scale}
          onScaleChange={setScale}
          histWeeks={histWeeks}
          onHistWeeksChange={setHistWeeks}
          histMode={histMode}
          onHistModeChange={setHistMode}
        />
      )}
      {subTab === 'experimental' && (
        <ExperimentalTabPanel autoOpts={autoOpts} onAutoOptsChange={setAutoOpts} />
      )}
      {subTab === 'print' && (
        <PrintTabPanel
          sigs={sigs}
          onSigsChange={setSigs}
          maxRows={maxRows}
          onMaxRowsChange={setMaxRows}
          printAllUsers={printAllUsers}
          onPrintAllUsersChange={setPrintAllUsers}
          onExportExcel={props.onExportExcel}
        />
      )}

      {/* Save footer */}
      <div
        className={`card shadow-sm border-0 mt-4 settings-save-card ${hasUnsavedChanges ? 'settings-save-card--dirty' : ''}`}
      >
        <div className="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="min-w-0">
            <div className="fw-bold d-flex align-items-center gap-2 flex-wrap">
              <span>Збереження налаштувань</span>
              <span
                className={`badge ${hasUnsavedChanges ? 'bg-warning text-dark settings-save-button-dirty' : 'bg-success-subtle text-success-emphasis border border-success-subtle'}`}
              >
                {hasUnsavedChanges ? 'Не збережено' : 'Збережено'}
              </span>
            </div>
            <div className="text-muted small">
              {hasUnsavedChanges
                ? `Змінені розділи: ${dirtyTabLabels.join(', ')}. Застосуються після збереження.`
                : 'Змін немає. Поточні налаштування вже збережені.'}
            </div>
          </div>
          <button
            className={`btn ${hasUnsavedChanges ? 'btn-warning settings-save-button-dirty' : 'btn-primary'}`}
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
