// src/components/settings/PrintTabPanel.tsx
import React from 'react';
import type { Signatories, ScheduleDocumentMode } from '../../types';
import { RANKS } from '../../utils/constants';

// Max-rows-per-page constraints for the duty table
const PRINT_ROWS_MIN = 5;
const PRINT_ROWS_MAX = 25;
const PRINT_ROWS_FALLBACK = 12;

interface PrintTabPanelProps {
  sigs: Signatories;
  onSigsChange: (s: Signatories) => void;
  maxRows: number;
  onMaxRowsChange: (n: number) => void;
  onExportExcel: (mode: ScheduleDocumentMode) => void;
}

/**
 * Print tab — configures signatories (approver + creator), schedule title lines,
 * report-creator block, and the max-rows-per-page limit for printed duty tables.
 */
const PrintTabPanel: React.FC<PrintTabPanelProps> = ({
  sigs,
  onSigsChange,
  maxRows,
  onMaxRowsChange,
  onExportExcel,
}) => (
  <>
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-file-excel me-2 text-success"></i>Експорт в Excel
        </h5>
      </div>
      <div className="card-body">
        <div className="text-muted small mb-3">
          Експортує графік у форматі Excel. Для режиму «тижні таблицею» буде запропоновано вибрати
          діапазон ISO-тижнів.
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-outline-success" onClick={() => onExportExcel('calendar')}>
            <i className="fas fa-calendar-days me-2"></i>Графік (календар)
          </button>
          <button className="btn btn-outline-success" onClick={() => onExportExcel('duty-table')}>
            <i className="fas fa-table me-2"></i>Графік (таблиця)
          </button>
          <button
            className="btn btn-outline-success"
            onClick={() => onExportExcel('week-calendar-table')}
          >
            <i className="fas fa-calendar-week me-2"></i>Графік (тижні таблицею)
          </button>
        </div>
      </div>
    </div>

    {/* Signatories */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-pen-nib me-2"></i>Підписи для друку
        </h5>
      </div>
      <div className="card-body">
        <div className="row g-4">
          {/* Approver block */}
          <div className="col-md-6">
            <h6 className="fw-bold text-primary border-bottom pb-2">
              ЗАТВЕРДЖУЮ (Верхній правий кут)
            </h6>
            <div className="mb-2">
              <label className="small text-muted">Посада</label>
              <input
                className="form-control form-control-sm"
                value={sigs.approverPos}
                onChange={(e) => onSigsChange({ ...sigs, approverPos: e.target.value })}
                placeholder="Наприклад: Командир частини"
              />
            </div>
            <div className="row g-2">
              <div className="col-5">
                <label className="small text-muted">Звання</label>
                <select
                  className="form-select form-select-sm"
                  value={sigs.approverRank}
                  onChange={(e) => onSigsChange({ ...sigs, approverRank: e.target.value })}
                >
                  <option value="">-- Виберіть --</option>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-7">
                <label className="small text-muted">Ім'я ПРІЗВИЩЕ</label>
                <input
                  className="form-control form-control-sm"
                  value={sigs.approverName}
                  onChange={(e) => onSigsChange({ ...sigs, approverName: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Schedule creator block */}
          <div className="col-md-6 border-start-md">
            <h6 className="fw-bold text-primary border-bottom pb-2">ГРАФІК СКЛАВ (Низ сторінки)</h6>
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="showCreatorFooter"
                checked={sigs.showCreatorFooter !== false}
                onChange={(e) => onSigsChange({ ...sigs, showCreatorFooter: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="showCreatorFooter">
                <strong>Показувати поле при друці</strong>
                <div className="text-muted small">
                  Вимкніть, якщо підпис «Графік склав» не потрібен у друкованому графіку.
                </div>
              </label>
            </div>
            <div className="mb-2">
              <label className="small text-muted">Посада</label>
              <input
                className="form-control form-control-sm"
                value={sigs.creatorPos || ''}
                onChange={(e) => onSigsChange({ ...sigs, creatorPos: e.target.value })}
                placeholder="Наприклад: Заступник командира частини"
              />
            </div>
            <div className="row g-2">
              <div className="col-5">
                <label className="small text-muted">Звання</label>
                <select
                  className="form-select form-select-sm"
                  value={sigs.creatorRank}
                  onChange={(e) => onSigsChange({ ...sigs, creatorRank: e.target.value })}
                >
                  <option value="">-- Виберіть --</option>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-7">
                <label className="small text-muted">Ім'я ПРІЗВИЩЕ</label>
                <input
                  className="form-control form-control-sm"
                  value={sigs.creatorName}
                  onChange={(e) => onSigsChange({ ...sigs, creatorName: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Schedule Title */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-heading me-2"></i>Заголовок графіка
        </h5>
      </div>
      <div className="card-body">
        <div className="mb-3">
          <label className="small text-muted">Назва документа</label>
          <input
            className="form-control form-control-sm"
            value={sigs.scheduleTitle || ''}
            onChange={(e) => onSigsChange({ ...sigs, scheduleTitle: e.target.value })}
            placeholder="ГРАФІК"
          />
          <small className="text-muted">Якщо порожньо — "ГРАФІК"</small>
        </div>
        <div className="mb-3">
          <label className="small text-muted">Підзаголовок (1 рядок)</label>
          <input
            className="form-control form-control-sm"
            value={sigs.scheduleSubtitle || ''}
            onChange={(e) => onSigsChange({ ...sigs, scheduleSubtitle: e.target.value })}
            placeholder="добового чергування на ... (автоматично з дат тижня)"
          />
          <small className="text-muted">Якщо порожньо — автоматично з дат поточного тижня</small>
        </div>
        <div className="mb-3">
          <label className="small text-muted">Додатковий рядок (2 рядок)</label>
          <input
            className="form-control form-control-sm"
            value={sigs.scheduleLine3 || ''}
            onChange={(e) => onSigsChange({ ...sigs, scheduleLine3: e.target.value })}
            placeholder="Наприклад: в/ч А1234 на період з ... по ..."
          />
          <small className="text-muted">Додатковий рядок під підзаголовком (необов'язково)</small>
        </div>
      </div>
    </div>

    {/* Report Creator (Довідку склав) */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-file-signature me-2"></i>ДОВІДКУ СКЛАВ (Довідка по складу)
        </h5>
      </div>
      <div className="card-body">
        <div className="alert alert-info py-2 small mb-3">
          Підпис внизу довідки по особовому складу. Якщо не заповнено — друкуються порожні лінії для
          ручного заповнення.
        </div>
        <div className="mb-2">
          <label className="small text-muted">Посада</label>
          <input
            className="form-control form-control-sm"
            value={sigs.reportCreatorPos || ''}
            onChange={(e) => onSigsChange({ ...sigs, reportCreatorPos: e.target.value })}
            placeholder="Наприклад: Старшина роти"
          />
        </div>
        <div className="row g-2">
          <div className="col-5">
            <label className="small text-muted">Звання</label>
            <select
              className="form-select form-select-sm"
              value={sigs.reportCreatorRank || ''}
              onChange={(e) => onSigsChange({ ...sigs, reportCreatorRank: e.target.value })}
            >
              <option value="">-- Виберіть --</option>
              {RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="col-7">
            <label className="small text-muted">Ім'я ПРІЗВИЩЕ</label>
            <input
              className="form-control form-control-sm"
              value={sigs.reportCreatorName || ''}
              onChange={(e) => onSigsChange({ ...sigs, reportCreatorName: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>

    {/* Max Rows per Page */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-table me-2"></i>Таблиця чергувань (друк)
        </h5>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-4">
            <label className="form-label fw-bold">Максимум осіб на сторінці</label>
            <input
              type="number"
              min={PRINT_ROWS_MIN}
              max={PRINT_ROWS_MAX}
              className="form-control"
              value={maxRows}
              onChange={(e) =>
                onMaxRowsChange(
                  Math.max(
                    PRINT_ROWS_MIN,
                    Math.min(PRINT_ROWS_MAX, parseInt(e.target.value) || PRINT_ROWS_FALLBACK)
                  )
                )
              }
            />
            <div className="form-text">
              Якщо осіб не більше ліміту — друкуються всі. Якщо більше — тільки ті, хто призначений
              на цей тиждень (завжди одна сторінка).
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
);

export default PrintTabPanel;
