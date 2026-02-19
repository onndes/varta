import React, { useState, useEffect } from 'react';
import type { DayWeights, Signatories } from '../types';
import { DAY_NAMES_FULL, RANKS } from '../utils/constants';
import * as performanceService from '../services/performanceService';
import type { DatabaseStats } from '../services/performanceService';

interface SettingsViewProps {
  dayWeights: DayWeights;
  signatories: Signatories;
  dutiesPerDay: number;
  onSave: (w: DayWeights) => void;
  onSaveSignatories: (s: Signatories) => void;
  onSaveDutiesPerDay: (count: number) => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({
  dayWeights,
  signatories,
  dutiesPerDay,
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
}) => {
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);
  const [perDay, setPerDay] = useState<number>(dutiesPerDay);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [maintenanceNeeded, setMaintenanceNeeded] = useState(false);

  const loadDatabaseStats = async () => {
    const stats = await performanceService.getDatabaseStats();
    const needsMaintenance = await performanceService.checkMaintenanceNeeded();
    setDbStats(stats);
    setMaintenanceNeeded(needsMaintenance);
  };

  const handleMaintenance = async () => {
    if (
      !confirm(
        'Видалити старі дані (графіки старше 1 року, логи старше 6 місяців)?\n\nРекомендується робити експорт перед очищенням!'
      )
    ) {
      return;
    }

    const results = await performanceService.performMaintenance();
    alert(
      `Очищено:\n• Логів: ${results.logsDeleted}\n• Старих графіків: ${results.oldSchedulesDeleted}`
    );
    await loadDatabaseStats();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDatabaseStats();
  }, []);

  const handleSave = () => {
    onSave(weights);
    onSaveSignatories(sigs);
    onSaveDutiesPerDay(perDay);
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

        {/* Duties Per Day Section */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">
              <i className="fas fa-users me-2"></i>Кількість чергових на добу
            </h5>
          </div>
          <div className="card-body">
            <div className="alert alert-info py-2 small">
              Вкажіть скільки бійців одночасно несуть чергування в одну добу.
            </div>
            <div className="row">
              <div className="col-md-4">
                <label className="form-label fw-bold">Чергових на добу</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="form-control"
                  value={perDay}
                  onChange={(e) => setPerDay(parseInt(e.target.value) || 1)}
                />
                <div className="form-text">За замовчуванням: 1 черговий</div>
              </div>
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
              <small className="text-muted">
                Якщо порожньо — автоматично з дат поточного тижня
              </small>
            </div>
            <div className="mb-3">
              <label className="small text-muted">Додатковий рядок (2 рядок)</label>
              <input
                className="form-control form-control-sm"
                value={sigs.scheduleLine3 || ''}
                onChange={(e) => setSigs({ ...sigs, scheduleLine3: e.target.value })}
                placeholder="Наприклад: в/ч А1234 на період з ... по ..."
              />
              <small className="text-muted">
                Додатковий рядок під підзаголовком (необов'язково)
              </small>
            </div>
          </div>
        </div>

        {/* Database Maintenance Section */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">
              <i className="fas fa-database me-2"></i>Обслуговування бази даних
            </h5>
          </div>
          <div className="card-body">
            {dbStats && (
              <>
                <div className="alert alert-info py-2 small mb-3">
                  <strong>Статистика бази:</strong>
                  <ul className="mb-0 mt-2">
                    <li>Бійців: {dbStats.counts.users}</li>
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
                  onClick={handleMaintenance}
                >
                  <i className="fas fa-broom me-2"></i>
                  Очистити старі дані
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
            )}
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
