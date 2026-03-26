// src/components/settings/LogicTabPanel.tsx
import React from 'react';
import type { DayWeights, AutoScheduleOptions, BirthdayBlockOpts } from '../../types';
import { DAY_NAMES_FULL } from '../../utils/constants';
import AutoSchedulerOptionsCard from './AutoSchedulerOptionsCard';

// Day weight input constraints
const WEIGHT_MIN = 0.1;
const WEIGHT_MAX = 5.0;
const WEIGHT_STEP = 0.05;
const WEIGHT_INPUT_WIDTH = '70px';

// Duties per day constraints
const DUTIES_MIN = 1;
const DUTIES_MAX = 10;

// Debt cap constraints
const DEBT_MIN = 1;
const DEBT_MAX = 20;
const DEBT_STEP = 0.5;
const HIGH_DEBT_THRESHOLD = 10;
const DEBT_DEFAULT = 4;

// Day-of-week render order: Mon–Sat then Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

interface LogicTabPanelProps {
  weights: DayWeights;
  onWeightsChange: (w: DayWeights) => void;
  perDay: number;
  onPerDayChange: (n: number) => void;
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
  debt: number;
  onDebtChange: (n: number) => void;
  ignoreHistory: boolean;
  onIgnoreHistoryChange: (b: boolean) => void;
  onApplyFirstDutyDates: () => void;
  birthdayOpts: BirthdayBlockOpts;
  onBirthdayOptsChange: (opts: BirthdayBlockOpts) => void;
}

/**
 * Logic tab — contains day weights, duties-per-day, first-duty-date sync,
 * auto-scheduler options, karma cap, and history-mode toggle.
 */
const LogicTabPanel: React.FC<LogicTabPanelProps> = ({
  weights,
  onWeightsChange,
  perDay,
  onPerDayChange,
  autoOpts,
  onAutoOptsChange,
  debt,
  onDebtChange,
  ignoreHistory,
  onIgnoreHistoryChange,
  onApplyFirstDutyDates,
  birthdayOpts,
  onBirthdayOptsChange,
}) => (
  <>
    {/* Day Weights */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-balance-scale me-2"></i>Вага днів тижня
        </h5>
      </div>
      <div className="card-body">
        <div className="alert alert-info py-2 small">
          Вага дня визначає, скільки балів отримує особа за чергування в цей день тижня. Більша вага
          = важчий день. Діапазон від 0.1 до 5.0, крок 0.05.
          <br />
          <span className="text-muted">
            Наприклад: 1.0 — звичайний будень, 1.5 — п'ятниця/неділя, 2.0 — субота, 0.5 — легкий
            день.
          </span>
        </div>
        <div className="row g-3">
          {DAY_ORDER.map((day) => (
            <div key={day} className="col-6 col-md-3">
              <div className="p-2 border rounded bg-light text-center">
                <label className="form-label fw-bold d-block small mb-1">
                  {DAY_NAMES_FULL[day]}
                </label>
                <input
                  type="number"
                  step={WEIGHT_STEP}
                  min={WEIGHT_MIN}
                  max={WEIGHT_MAX}
                  className="form-control text-center fw-bold form-control-sm mx-auto"
                  style={{ width: WEIGHT_INPUT_WIDTH }}
                  value={weights[day]}
                  onChange={(e) =>
                    onWeightsChange({ ...weights, [day]: parseFloat(e.target.value) })
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-muted small">
          Нові ваги будуть застосовані після натискання загальної кнопки збереження внизу сторінки.
        </div>
      </div>
    </div>

    {/* Duties Per Day */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-users me-2"></i>Кількість чергових на добу
        </h5>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-4">
            <label className="form-label fw-bold">Чергових на добу</label>
            <input
              type="number"
              min={DUTIES_MIN}
              max={DUTIES_MAX}
              className="form-control"
              value={perDay}
              onChange={(e) => onPerDayChange(parseInt(e.target.value) || 1)}
            />
            <div className="form-text">Скільки осіб одночасно несуть чергування в одну добу.</div>
          </div>
        </div>
      </div>
    </div>

    {/* First Duty Date Sync */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-calendar-check me-2"></i>Дата включення в авточергу
        </h5>
      </div>
      <div className="card-body">
        <div className="text-muted small mb-3">
          Масово проставляє поле "З дати" як дату першого чергування для кожної особи.
        </div>
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          onClick={onApplyFirstDutyDates}
        >
          <i className="fas fa-calendar-check me-1"></i>З дати першого чергування
        </button>
      </div>
    </div>

    <AutoSchedulerOptionsCard autoOpts={autoOpts} onAutoOptsChange={onAutoOptsChange} />

    {/* Karma / Debt Cap */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-shield-alt me-2"></i>Карма (ліміт боргу)
        </h5>
      </div>
      <div className="card-body">
        <div className="row">
          <div className="col-md-4">
            <label className="form-label fw-bold">
              Максимальний борг
              {debt > HIGH_DEBT_THRESHOLD && (
                <span className="text-danger small fw-bold ms-2">(занадто високе значення!)</span>
              )}
            </label>
            <input
              type="number"
              step={DEBT_STEP}
              min={DEBT_MIN}
              max={DEBT_MAX}
              className="form-control"
              value={debt}
              onChange={(e) => onDebtChange(parseFloat(e.target.value) || DEBT_DEFAULT)}
            />
            <div className="form-text">
              Максимальний від'ємний борг особи. Після досягнення цього ліміту борг не збільшується.
              За замовчуванням: 4.0
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Birthday blocking */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-birthday-cake me-2"></i>День народження — блокування чергування
        </h5>
      </div>
      <div className="card-body">
        <div className="text-muted small mb-3">
          Якщо у бійця вказано день народження, він може автоматично бути відсутнім у графіку на цей
          день (та суміжні).
        </div>
        <div className="form-check form-switch mb-3">
          <input
            type="checkbox"
            className="form-check-input"
            id="birthdayEnabled"
            checked={birthdayOpts.enabled}
            onChange={(e) => onBirthdayOptsChange({ ...birthdayOpts, enabled: e.target.checked })}
            style={{ cursor: 'pointer' }}
          />
          <label
            className="form-check-label fw-bold"
            htmlFor="birthdayEnabled"
            style={{ cursor: 'pointer' }}
          >
            Блокувати чергування в день народження
          </label>
        </div>
        {birthdayOpts.enabled && (
          <div className="ms-4 d-flex gap-4">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="birthdayBefore"
                checked={birthdayOpts.blockBefore}
                onChange={(e) =>
                  onBirthdayOptsChange({ ...birthdayOpts, blockBefore: e.target.checked })
                }
                style={{ cursor: 'pointer' }}
              />
              <label
                className="form-check-label"
                htmlFor="birthdayBefore"
                style={{ cursor: 'pointer' }}
              >
                День перед
              </label>
            </div>
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="birthdayAfter"
                checked={birthdayOpts.blockAfter}
                onChange={(e) =>
                  onBirthdayOptsChange({ ...birthdayOpts, blockAfter: e.target.checked })
                }
                style={{ cursor: 'pointer' }}
              />
              <label
                className="form-check-label"
                htmlFor="birthdayAfter"
                style={{ cursor: 'pointer' }}
              >
                День після
              </label>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* History Mode */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-history me-2"></i>Режим історії
        </h5>
      </div>
      <div className="card-body">
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="ignoreHistoryInLogic"
            checked={ignoreHistory}
            onChange={(e) => onIgnoreHistoryChange(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="ignoreHistoryInLogic">
            <strong>Ігнорувати історію в логіці генерації та статистиці</strong>
            <div className="text-muted small">
              За замовчуванням дежурства, додані в режимі історії, враховуються при генерації
              наступних тижнів і відображаються в статистиці. Увімкніть, щоб виключити їх.
            </div>
          </label>
        </div>
      </div>
    </div>
  </>
);

export default LogicTabPanel;
