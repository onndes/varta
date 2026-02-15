import React, { useState } from 'react';
import type { DayWeights, Signatories } from '../types';
import { DAY_NAMES_FULL, RANKS } from '../utils/constants';

interface SettingsViewProps {
  dayWeights: DayWeights;
  signatories: Signatories;
  onSave: (w: DayWeights) => void;
  onSaveSignatories: (s: Signatories) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  dayWeights,
  signatories,
  onSave,
  onSaveSignatories,
}) => {
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);

  const handleSave = () => {
    onSave(weights);
    onSaveSignatories(sigs);
    alert('Налаштування збережено!');
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-10">
        {/* Weights Section */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">
              <i className="fas fa-sliders-h me-2"></i>Налаштування ваги днів
            </h5>
          </div>
          <div className="card-body">
            <div className="alert alert-info py-2 small">
              Вага дня визначає, скільки балів отримує боєць за чергування в цей день. (1.0 =
              звичайний день, 2.0 = дуже важкий).
            </div>
            <div className="row g-3">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <div key={day} className="col-6 col-md-3">
                  <div className="p-2 border rounded bg-light text-center">
                    <label className="form-label fw-bold d-block small mb-1">
                      {DAY_NAMES_FULL[day]}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5.0"
                      className="form-control text-center fw-bold form-control-sm mx-auto"
                      style={{ width: '70px' }}
                      value={weights[day]}
                      onChange={(e) =>
                        setWeights({ ...weights, [day]: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Signatories Section */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">
              <i className="fas fa-pen-nib me-2"></i>Підписи для друку
            </h5>
          </div>
          <div className="card-body">
            <div className="row g-4">
              <div className="col-md-6">
                <h6 className="fw-bold text-primary border-bottom pb-2">
                  ЗАТВЕРДЖУЮ (Верхній правий кут)
                </h6>
                <div className="mb-2">
                  <label className="small text-muted">Посада</label>
                  <input
                    className="form-control form-control-sm"
                    value={sigs.approverPos}
                    onChange={(e) => setSigs({ ...sigs, approverPos: e.target.value })}
                  />
                </div>
                <div className="row g-2">
                  <div className="col-5">
                    <label className="small text-muted">Звання</label>
                    <select
                      className="form-select form-select-sm"
                      value={sigs.approverRank}
                      onChange={(e) => setSigs({ ...sigs, approverRank: e.target.value })}
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
                      onChange={(e) => setSigs({ ...sigs, approverName: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="col-md-6 border-start-md">
                <h6 className="fw-bold text-primary border-bottom pb-2">
                  ГРАФІК СКЛАВ (Низ сторінки)
                </h6>
                <div className="mb-2">
                  <label className="small text-muted">Посада</label>
                  <input
                    className="form-control form-control-sm"
                    value={sigs.creatorPos || ''}
                    onChange={(e) => setSigs({ ...sigs, creatorPos: e.target.value })}
                    placeholder="Наприклад: Заступник командира частини"
                  />
                </div>
                <div className="row g-2">
                  <div className="col-5">
                    <label className="small text-muted">Звання</label>
                    <select
                      className="form-select form-select-sm"
                      value={sigs.creatorRank}
                      onChange={(e) => setSigs({ ...sigs, creatorRank: e.target.value })}
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
                      onChange={(e) => setSigs({ ...sigs, creatorName: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule Title Section */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">
              <i className="fas fa-heading me-2"></i>Заголовок графіка (для друку)
            </h5>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <label className="small text-muted">Назва документа</label>
              <input
                className="form-control form-control-sm"
                value={sigs.scheduleTitle || ''}
                onChange={(e) => setSigs({ ...sigs, scheduleTitle: e.target.value })}
                placeholder="ГРАФІК"
              />
              <small className="text-muted">Якщо порожньо — "ГРАФІК"</small>
            </div>
            <div className="mb-3">
              <label className="small text-muted">Підзаголовок (1 рядок)</label>
              <input
                className="form-control form-control-sm"
                value={sigs.scheduleSubtitle || ''}
                onChange={(e) => setSigs({ ...sigs, scheduleSubtitle: e.target.value })}
                placeholder="добового чергування на ... (автоматично з дат тижня)"
              />
              <small className="text-muted">Якщо порожньо — автоматично з дат поточного тижня</small>
            </div>
            <div className="mb-3">
              <label className="small text-muted">Додатковий рядок (2 рядок)</label>
              <input
                className="form-control form-control-sm"
                value={sigs.scheduleLine3 || ''}
                onChange={(e) => setSigs({ ...sigs, scheduleLine3: e.target.value })}
                placeholder="Наприклад: в/ч А1234 на період з ... по ..."
              />
              <small className="text-muted">Додатковий рядок під підзаголовком (необов'язково)</small>
            </div>
          </div>
        </div>

        <div className="text-end">
          <button className="btn btn-primary btn-lg" onClick={handleSave}>
            <i className="fas fa-save me-2"></i>Зберегти налаштування
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
