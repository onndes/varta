import React, { useState, useEffect, useRef } from 'react';
import type { DayWeights, Signatories, AutoScheduleOptions } from '../types';
import { DAY_NAMES_FULL, RANKS } from '../utils/constants';
import * as performanceService from '../services/performanceService';
import type { DatabaseStats } from '../services/performanceService';
import Modal from './Modal';
import { useDialog } from './useDialog';

interface SettingsViewProps {
  dayWeights: DayWeights;
  signatories: Signatories;
  dutiesPerDay: number;
  autoScheduleOptions: AutoScheduleOptions;
  maxDebt: number;
  printMaxRows: number;
  onSave: (w: DayWeights) => Promise<void>;
  onSaveSignatories: (s: Signatories) => Promise<void>;
  onSaveDutiesPerDay: (count: number) => Promise<void>;
  onSaveAutoScheduleOptions: (opts: AutoScheduleOptions) => Promise<void>;
  onSaveMaxDebt: (value: number) => Promise<void>;
  onSavePrintMaxRows: (value: number) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

type SubTab = 'logic' | 'print';

const SettingsView: React.FC<SettingsViewProps> = ({
  dayWeights,
  signatories,
  dutiesPerDay,
  autoScheduleOptions,
  maxDebt,
  printMaxRows,
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
  onSaveAutoScheduleOptions,
  onSaveMaxDebt,
  onSavePrintMaxRows,
  logAction,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('logic');
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);
  const [perDay, setPerDay] = useState<number>(dutiesPerDay);
  const [autoOpts, setAutoOpts] = useState<AutoScheduleOptions>(autoScheduleOptions);
  const [debt, setDebt] = useState<number>(maxDebt);
  const [maxRows, setMaxRows] = useState<number>(printMaxRows);

  // DB maintenance modal
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [maintenanceNeeded, setMaintenanceNeeded] = useState(false);

  useEffect(() => {
    setWeights(dayWeights);
  }, [dayWeights]);

  useEffect(() => {
    setSigs(signatories);
  }, [signatories]);

  useEffect(() => {
    setPerDay(dutiesPerDay);
  }, [dutiesPerDay]);

  useEffect(() => {
    setAutoOpts(autoScheduleOptions);
  }, [autoScheduleOptions]);

  useEffect(() => {
    setDebt(maxDebt);
  }, [maxDebt]);

  useEffect(() => {
    setMaxRows(printMaxRows);
  }, [printMaxRows]);

  // ─── Auto-save effects (debounced) ──────────────────────
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (JSON.stringify(weights) === JSON.stringify(dayWeights)) return;
    const t = setTimeout(() => {
      onSave(weights);
      logAction('SETTINGS', 'Вага днів змінено');
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (perDay === dutiesPerDay) return;
    const t = setTimeout(() => {
      onSaveDutiesPerDay(perDay);
      logAction('SETTINGS', `Чергових на добу: ${perDay}`);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perDay]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (JSON.stringify(autoOpts) === JSON.stringify(autoScheduleOptions)) return;
    const t = setTimeout(() => {
      onSaveAutoScheduleOptions(autoOpts);
      logAction('SETTINGS', 'Параметри алгоритму змінено');
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpts]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (debt === maxDebt) return;
    const t = setTimeout(() => {
      onSaveMaxDebt(debt);
      logAction('SETTINGS', `Макс. борг: ${debt}`);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debt]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (maxRows === printMaxRows) return;
    const t = setTimeout(() => {
      onSavePrintMaxRows(maxRows);
      logAction('SETTINGS', `Рядків на сторінці (друк): ${maxRows}`);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxRows]);

  useEffect(() => {
    if (!mountedRef.current) return;
    if (JSON.stringify(sigs) === JSON.stringify(signatories)) return;
    const t = setTimeout(() => {
      onSaveSignatories(sigs);
      logAction('SETTINGS', 'Підписи/заголовок змінено');
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigs]);

  // Mark mounted LAST so the above effects skip on initial render
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const { showAlert, showConfirm } = useDialog();

  const loadDatabaseStats = async () => {
    const stats = await performanceService.getDatabaseStats();
    const needs = await performanceService.checkMaintenanceNeeded();
    setDbStats(stats);
    setMaintenanceNeeded(needs);
  };

  const handleOpenDbModal = async () => {
    await loadDatabaseStats();
    setShowDbModal(true);
  };

  const handleMaintenance = async () => {
    if (
      !(await showConfirm(
        'Видалити старі дані (графіки старше 1 року, логи старше 6 місяців)?\n\nРекомендується робити експорт перед очищенням!'
      ))
    )
      return;

    const results = await performanceService.performMaintenance();
    await showAlert(
      `Очищено:\n• Логів: ${results.logsDeleted}\n• Старих графіків: ${results.oldSchedulesDeleted}`
    );
    await loadDatabaseStats();
  };

  // ─── Sub-tab: Logic ────────────────────────────────────────
  const renderLogicTab = () => (
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
            Вага дня визначає, скільки балів отримує особа за чергування в цей день тижня. Більша
            вага = важчий день. (1.0 = звичайний, 2.0 = дуже важкий).
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
                    onChange={(e) => setWeights({ ...weights, [day]: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            ))}
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
                min="1"
                max="10"
                className="form-control"
                value={perDay}
                onChange={(e) => setPerDay(parseInt(e.target.value) || 1)}
              />
              <div className="form-text">Скільки осіб одночасно несуть чергування в одну добу.</div>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Scheduler Options */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-header bg-white py-3">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-robot me-2"></i>Алгоритм автозаповнення
          </h5>
        </div>
        <div className="card-body">
          <div className="alert alert-info py-2 small">
            Ці параметри визначають, як алгоритм обирає осіб при автоматичному заповненні графіка.
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="avoidConsecutive"
              checked={autoOpts.avoidConsecutiveDays}
              onChange={(e) => setAutoOpts({ ...autoOpts, avoidConsecutiveDays: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="avoidConsecutive">
              <strong>Не ставити два дні поспіль</strong>
              <div className="text-muted small">
                Особа, яка чергувала вчора, не буде призначена на сьогодні (день відпочинку після
                чергування).
              </div>
            </label>
          </div>

          {autoOpts.avoidConsecutiveDays && (
            <div className="ms-4 mb-3 p-3 bg-light rounded">
              <label className="form-label fw-bold">
                <i className="fas fa-bed me-2"></i>Мінімум днів відпочинку
              </label>
              <div className="d-flex align-items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="7"
                  className="form-control"
                  style={{ width: '80px' }}
                  value={autoOpts.minRestDays || 1}
                  onChange={(e) =>
                    setAutoOpts({ ...autoOpts, minRestDays: parseInt(e.target.value) || 1 })
                  }
                />
                <span className="text-muted small">
                  {autoOpts.minRestDays === 1 && '(не ставити 2 дні поспіль)'}
                  {autoOpts.minRestDays === 2 && '(мінімум 1 день перерви між черguваннями)'}
                  {autoOpts.minRestDays === 3 && '(мінімум 2 дні перерви між черguваннями)'}
                  {autoOpts.minRestDays &&
                    autoOpts.minRestDays > 3 &&
                    `(мінімум ${autoOpts.minRestDays - 1} днів перерви)`}
                </span>
              </div>
              <div className="form-text mt-2">
                <i className="fas fa-info-circle me-1"></i>
                Якщо не вистачає людей — система автоматично зменшить період відпочинку для
                заповнення графіка.
              </div>
            </div>
          )}

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="respectOwed"
              checked={autoOpts.respectOwedDays}
              onChange={(e) => setAutoOpts({ ...autoOpts, respectOwedDays: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="respectOwed">
              <strong>Враховувати борги (owedDays)</strong>
              <div className="text-muted small">
                Особи з боргом за конкретний день тижня мають пріоритет при призначенні саме на цей
                день.
              </div>
            </label>
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="considerLoad"
              checked={autoOpts.considerLoad}
              onChange={(e) => setAutoOpts({ ...autoOpts, considerLoad: e.target.checked })}
            />
            <label className="form-check-label" htmlFor="considerLoad">
              <strong>Враховувати навантаження</strong>
              {!autoOpts.considerLoad && (
                <span className="text-danger small fw-bold ms-2">
                  (вимкнення ламає справедливість розподілу!)
                </span>
              )}
              <div className="text-muted small">
                Спочатку по кількості чергувань на день тижня (драбинка), потім по загальній
                кількості, потім по вазі + карма. Вимкніть лише для тестування.
              </div>
            </label>
          </div>

          {/* Агресивне балансування (вкладене під considerLoad) */}
          {autoOpts.considerLoad && (
            <div className="ms-4 mb-3 p-3 bg-light rounded">
              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="aggressiveBalance"
                  checked={autoOpts.aggressiveLoadBalancing}
                  onChange={(e) =>
                    setAutoOpts({ ...autoOpts, aggressiveLoadBalancing: e.target.checked })
                  }
                />
                <label className="form-check-label" htmlFor="aggressiveBalance">
                  <strong>Агресивне балансування</strong>
                  {autoOpts.aggressiveLoadBalancing && (
                    <span className="text-danger small fw-bold ms-2">
                      (може ігнорувати інші пріоритети!)
                    </span>
                  )}
                  <div className="text-muted small">
                    Примусово вирівнює навантаження, ігноруючи стандартні пріоритети, якщо різниця
                    більша за поріг.
                  </div>
                </label>
              </div>
              {autoOpts.aggressiveLoadBalancing && (
                <div className="ms-4 mt-2">
                  <label className="form-label fw-bold small">Поріг різниці</label>
                  <div className="d-flex align-items-center gap-3">
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max="1.0"
                      className="form-control form-control-sm"
                      style={{ width: '80px' }}
                      value={autoOpts.aggressiveLoadBalancingThreshold}
                      onChange={(e) =>
                        setAutoOpts({
                          ...autoOpts,
                          aggressiveLoadBalancingThreshold: parseFloat(e.target.value) || 0.2,
                        })
                      }
                    />
                    <span className="text-muted small">
                      Менше значення = жорсткіше вирівнювання (0.2 за замовчуванням)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="limitOnePerWeek"
              checked={autoOpts.limitOneDutyPerWeekWhenSevenPlus}
              onChange={(e) =>
                setAutoOpts({
                  ...autoOpts,
                  limitOneDutyPerWeekWhenSevenPlus: e.target.checked,
                })
              }
            />
            <label className="form-check-label" htmlFor="limitOnePerWeek">
              <strong>Якщо доступно 7+ осіб — не більше 1 чергування на тиждень</strong>
              <div className="text-muted small">
                Коли на тиждень вистачає людей, система спочатку ставить тих, хто ще не чергував у
                цьому тижні. Якщо інакше не закривається графік — автоматично робить відкат.
              </div>
            </label>
          </div>

          <div className="form-check form-switch mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="allowDebtExtra"
              checked={autoOpts.allowDebtUsersExtraWeeklyAssignments}
              onChange={(e) =>
                setAutoOpts({
                  ...autoOpts,
                  allowDebtUsersExtraWeeklyAssignments: e.target.checked,
                })
              }
            />
            <label className="form-check-label" htmlFor="allowDebtExtra">
              <strong>Дозволити особам з боргом частіше чергувати в тижні</strong>
              <div className="text-muted small">
                Потрібно для швидшого погашення карми після зняття з наряду за рапортом.
              </div>
            </label>
          </div>

          {autoOpts.allowDebtUsersExtraWeeklyAssignments && (
            <div className="ms-4 mb-3 p-3 bg-light rounded">
              <label className="form-label fw-bold">Ліміт для осіб з боргом (разів/тиждень)</label>
              <div className="d-flex align-items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="4"
                  className="form-control"
                  style={{ width: '80px' }}
                  value={autoOpts.debtUsersWeeklyLimit}
                  onChange={(e) =>
                    setAutoOpts({
                      ...autoOpts,
                      debtUsersWeeklyLimit: Math.min(4, Math.max(1, parseInt(e.target.value) || 1)),
                    })
                  }
                />
                <span className="text-muted small">Від 1 до 4.</span>
              </div>
            </div>
          )}

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="fasterDebtRepayment"
              checked={autoOpts.prioritizeFasterDebtRepayment}
              onChange={(e) =>
                setAutoOpts({
                  ...autoOpts,
                  prioritizeFasterDebtRepayment: e.target.checked,
                })
              }
            />
            <label className="form-check-label" htmlFor="fasterDebtRepayment">
              <strong>Пріоритет швидшого погашення карми</strong>
              <div className="text-muted small">
                За рівних умов система обирає особу/день, де борг погашається швидше.
              </div>
            </label>
          </div>
        </div>
      </div>

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
                {debt > 10 && (
                  <span className="text-danger small fw-bold ms-2">(занадто високе значення!)</span>
                )}
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="20"
                className="form-control"
                value={debt}
                onChange={(e) => setDebt(parseFloat(e.target.value) || 4)}
              />
              <div className="form-text">
                Максимальний від'ємний борг особи. Після досягнення цього ліміту борг не
                збільшується. За замовчуванням: 4.0
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // ─── Sub-tab: Print ────────────────────────────────────────
  const renderPrintTab = () => (
    <>
      {/* Signatories */}
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
                  placeholder="Наприклад: Командир частини"
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

      {/* Report Creator (Довідку склав) */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-header bg-white py-3">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-file-signature me-2"></i>ДОВІДКУ СКЛАВ (Довідка по складу)
          </h5>
        </div>
        <div className="card-body">
          <div className="alert alert-info py-2 small mb-3">
            Підпис внизу довідки по особовому складу. Якщо не заповнено — друкуються порожні лінії
            для ручного заповнення.
          </div>
          <div className="mb-2">
            <label className="small text-muted">Посада</label>
            <input
              className="form-control form-control-sm"
              value={sigs.reportCreatorPos || ''}
              onChange={(e) => setSigs({ ...sigs, reportCreatorPos: e.target.value })}
              placeholder="Наприклад: Старшина роти"
            />
          </div>
          <div className="row g-2">
            <div className="col-5">
              <label className="small text-muted">Звання</label>
              <select
                className="form-select form-select-sm"
                value={sigs.reportCreatorRank || ''}
                onChange={(e) => setSigs({ ...sigs, reportCreatorRank: e.target.value })}
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
                onChange={(e) => setSigs({ ...sigs, reportCreatorName: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Print: Max Rows per Page */}
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
                min="5"
                max="25"
                className="form-control"
                value={maxRows}
                onChange={(e) =>
                  setMaxRows(Math.max(5, Math.min(25, parseInt(e.target.value) || 12)))
                }
              />
              <div className="form-text">
                Якщо осіб не більше ліміту — друкуються всі. Якщо більше — тільки ті, хто
                призначений на цей тиждень (завжди одна сторінка).
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="row justify-content-center">
      <div className="col-md-10">
        {/* Sub-tabs */}
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
          </ul>

          {/* DB Maintenance — small button */}
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleOpenDbModal}
            title="Обслуговування бази даних"
          >
            <i className="fas fa-database me-1"></i>База даних
          </button>
        </div>

        {/* Content */}
        {subTab === 'logic' && renderLogicTab()}
        {subTab === 'print' && renderPrintTab()}
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
