// src/components/settings/InterfaceTabPanel.tsx
import React from 'react';
import { addDays, formatDate, toLocalISO } from '../../utils/dateUtils';

/** Available UI scale values in percent. */
const UI_SCALE_OPTIONS = [
  70, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160,
] as const;

/** Labels shown in the dropdown for select scale values. */
const UI_SCALE_LABELS: Partial<Record<number, string>> = {
  70: '70% (дуже малий)',
  80: '80% (малий)',
  100: '100% (стандарт)',
  130: '130% (великий)',
  160: '160% (дуже великий)',
};

interface InterfaceTabPanelProps {
  scale: number;
  onScaleChange: (n: number) => void;
  histWeeks: number;
  onHistWeeksChange: (n: number) => void;
  histMode: 'numbers' | 'dots';
  onHistModeChange: (m: 'numbers' | 'dots') => void;
  showDevBanner: boolean;
  onSaveShowDevBanner: (value: boolean) => Promise<void>;
  devBannerSnoozeUntil: string | null;
  onSaveDevBannerSnoozeUntil: (value: string | null) => Promise<void>;
}

/**
 * Interface tab — lets the user pick a global UI zoom level applied
 * to the entire app shell (browser, Tauri, Electron).
 */
const InterfaceTabPanel: React.FC<InterfaceTabPanelProps> = ({
  scale,
  onScaleChange,
  histWeeks,
  onHistWeeksChange,
  histMode,
  onHistModeChange,
  showDevBanner,
  onSaveShowDevBanner,
  devBannerSnoozeUntil,
  onSaveDevBannerSnoozeUntil,
}) => {
  const todayStr = toLocalISO(new Date());
  const isSnoozed = Boolean(devBannerSnoozeUntil && todayStr <= devBannerSnoozeUntil);

  return (
    <>
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-search-plus me-2"></i>Масштаб інтерфейсу
        </h5>
      </div>
      <div className="card-body">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label fw-bold">Розмір UI</label>
            <select
              className="form-select"
              value={scale}
              onChange={(e) => onScaleChange(parseInt(e.target.value, 10))}
            >
              {UI_SCALE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {UI_SCALE_LABELS[v] ?? `${v}%`}
                </option>
              ))}
            </select>
            <div className="form-text">
              Застосовується до всього інтерфейсу (браузер, Tauri, Electron).
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* DOW history indicator */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-calendar-week me-2"></i>Індикатор повторів дня тижня
        </h5>
      </div>
      <div className="card-body">
        <div className="text-muted small mb-3">
          Маленький індикатор в кутку кожної клітинки графіку. Показує, скільки тижнів тому боєць
          дежурував у цей самий день тижня.
        </div>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label fw-bold">Глибина (тижнів)</label>
            <select
              className="form-select"
              value={histWeeks}
              onChange={(e) => onHistWeeksChange(parseInt(e.target.value, 10))}
            >
              {Array.from({ length: 16 }, (_, i) => i).map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? 'Вимкнено' : `${v}`}
                </option>
              ))}
            </select>
            <div className="form-text">
              0 — індикатор прихований. Від 1 до 15 — скільки попередніх тижнів перевіряти.
            </div>
          </div>
          <div className="col-md-4">
            <label className="form-label fw-bold">Вигляд</label>
            <select
              className="form-select"
              value={histMode}
              onChange={(e) => onHistModeChange(e.target.value as 'numbers' | 'dots')}
            >
              <option value="numbers">Цифри (1/3)</option>
              <option value="dots">Крапки (● ○ ● ○)</option>
            </select>
            <div className="form-text">
              Цифри — номер тижня через /. Крапки — фіксовані позиції (ярка = було).
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Dev banner toggle */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-triangle-exclamation me-2"></i>Попередження про стадію розробки
        </h5>
      </div>
      <div className="card-body">
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="showDevBanner"
            checked={showDevBanner}
            onChange={(e) => void onSaveShowDevBanner(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="showDevBanner">
            <strong>Показувати щоденну плашку «Додаток у стадії розробки»</strong>
            <div className="text-muted small">
              Верхня інформаційна плашка-нагадування про те, що застосунок ще не повністю
              протестований у реальних умовах. Закриття хрестиком приховує її лише до наступного
              дня.
            </div>
          </label>
        </div>
        {showDevBanner && (
          <div className="mt-3 pt-3 border-top">
            <div className="fw-semibold mb-1">Тимчасова пауза</div>
            <div className="text-muted small mb-3">
              Якщо не хочете бачити нагадування щодня, тут можна призупинити його появу на 15 діб.
            </div>
            {isSnoozed ? (
              <div className="alert alert-info py-2 small mb-3">
                Плашку призупинено до <strong>{formatDate(devBannerSnoozeUntil!)}</strong>{' '}
                включно.
              </div>
            ) : (
              <div className="alert alert-secondary py-2 small mb-3">
                Додаткової паузи немає. Після закриття плашка знову з’явиться завтра.
              </div>
            )}
            <div className="d-flex gap-2 flex-wrap">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => void onSaveDevBannerSnoozeUntil(addDays(todayStr, 14))}
              >
                Не показувати 15 діб
              </button>
              {isSnoozed && (
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => void onSaveDevBannerSnoozeUntil(null)}
                >
                  Показувати знову
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default InterfaceTabPanel;
