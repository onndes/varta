import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { DayWeights, Signatories, AutoScheduleOptions, User, ScheduleEntry } from '../types';
import { DAY_NAMES_FULL, RANKS } from '../utils/constants';
import * as performanceService from '../services/performanceService';
import type { DatabaseStats } from '../services/performanceService';
import { toLocalISO } from '../utils/dateUtils';
import { getFirstDutyDate } from '../utils/assignment';
import * as userService from '../services/userService';
import Modal from './Modal';
import { useDialog } from './useDialog';

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
  refreshData: () => Promise<void>;
  updateCascadeTrigger: (date: string) => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
}

type SubTab = 'logic' | 'interface' | 'print';

const SettingsView: React.FC<SettingsViewProps> = ({
  users,
  schedule,
  dayWeights,
  signatories,
  dutiesPerDay,
  autoScheduleOptions,
  maxDebt,
  printMaxRows,
  ignoreHistoryInLogic,
  uiScale,
  onSave,
  onSaveSignatories,
  onSaveDutiesPerDay,
  onSaveAutoScheduleOptions,
  onSaveMaxDebt,
  onSavePrintMaxRows,
  onSaveIgnoreHistoryInLogic,
  onSaveUiScale,
  refreshData,
  updateCascadeTrigger,
  logAction,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('logic');
  const [weights, setWeights] = useState<DayWeights>(dayWeights);
  const [sigs, setSigs] = useState<Signatories>(signatories);
  const [perDay, setPerDay] = useState<number>(dutiesPerDay);
  const [autoOpts, setAutoOpts] = useState<AutoScheduleOptions>(autoScheduleOptions);
  const [debt, setDebt] = useState<number>(maxDebt);
  const [maxRows, setMaxRows] = useState<number>(printMaxRows);
  const [ignoreHistory, setIgnoreHistory] = useState<boolean>(ignoreHistoryInLogic);
  const [scale, setScale] = useState<number>(uiScale);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    setIgnoreHistory(ignoreHistoryInLogic);
  }, [ignoreHistoryInLogic]);

  useEffect(() => {
    setScale(uiScale);
  }, [uiScale]);

  const { showAlert, showConfirm } = useDialog();

  const weightsChanged = useMemo(
    () => JSON.stringify(weights) !== JSON.stringify(dayWeights),
    [weights, dayWeights]
  );
  const signatoriesChanged = useMemo(
    () => JSON.stringify(sigs) !== JSON.stringify(signatories),
    [sigs, signatories]
  );
  const dutiesChanged = perDay !== dutiesPerDay;
  const autoOptionsChanged = useMemo(
    () => JSON.stringify(autoOpts) !== JSON.stringify(autoScheduleOptions),
    [autoOpts, autoScheduleOptions]
  );
  const debtChanged = debt !== maxDebt;
  const maxRowsChanged = maxRows !== printMaxRows;
  const ignoreHistoryChanged = ignoreHistory !== ignoreHistoryInLogic;
  const scaleChanged = scale !== uiScale;
  const hasUnsavedChanges =
    weightsChanged ||
    signatoriesChanged ||
    dutiesChanged ||
    autoOptionsChanged ||
    debtChanged ||
    maxRowsChanged ||
    ignoreHistoryChanged ||
    scaleChanged;

  const handleSaveSettings = useCallback(async () => {
    if (!hasUnsavedChanges) {
      await showAlert('Немає змін для збереження');
      return;
    }

    const changedSections: string[] = [];
    setIsSaving(true);
    try {
      if (weightsChanged) {
        await onSave(weights);
        changedSections.push('вага днів');
      }
      if (dutiesChanged) {
        await onSaveDutiesPerDay(perDay);
        changedSections.push('чергові на добу');
      }
      if (autoOptionsChanged) {
        await onSaveAutoScheduleOptions(autoOpts);
        changedSections.push('алгоритм автозаповнення');
      }
      if (debtChanged) {
        await onSaveMaxDebt(debt);
        changedSections.push('ліміт боргу');
      }
      if (ignoreHistoryChanged) {
        await onSaveIgnoreHistoryInLogic(ignoreHistory);
        changedSections.push('режим історії');
      }
      if (scaleChanged) {
        await onSaveUiScale(scale);
        changedSections.push('масштаб інтерфейсу');
      }
      if (signatoriesChanged) {
        await onSaveSignatories(sigs);
        changedSections.push('підписи та заголовок');
      }
      if (maxRowsChanged) {
        await onSavePrintMaxRows(maxRows);
        changedSections.push('параметри друку');
      }

      await refreshData();
      await logAction('SETTINGS', `Збережено налаштування: ${changedSections.join(', ')}`);
      await showAlert('Налаштування збережено');
    } finally {
      setIsSaving(false);
    }
  }, [
    autoOptionsChanged,
    autoOpts,
    debt,
    debtChanged,
    dutiesChanged,
    hasUnsavedChanges,
    ignoreHistory,
    ignoreHistoryChanged,
    logAction,
    maxRows,
    maxRowsChanged,
    onSave,
    onSaveAutoScheduleOptions,
    onSaveDutiesPerDay,
    onSaveIgnoreHistoryInLogic,
    onSaveMaxDebt,
    onSavePrintMaxRows,
    onSaveSignatories,
    onSaveUiScale,
    perDay,
    refreshData,
    scale,
    scaleChanged,
    showAlert,
    signatoriesChanged,
    sigs,
    weights,
    weightsChanged,
  ]);

  const applyFirstDutyDates = async () => {
    if (!(await showConfirm('Проставити "З дати" як перше чергування для всіх?'))) return;
    let changed = 0;
    for (const u of users) {
      if (!u.id) continue;
      const firstDuty = getFirstDutyDate(schedule, u.id);
      if (!firstDuty || u.dateAddedToAuto === firstDuty) continue;
      await userService.updateUser(u.id, { dateAddedToAuto: firstDuty });
      changed += 1;
    }

    if (changed === 0) {
      await showAlert('Немає змін');
      return;
    }

    await updateCascadeTrigger(toLocalISO(new Date()));
    await logAction('BULK_EDIT', `З дати = перше чергування (${changed} ос.)`);
    await refreshData();
    await showAlert(`Готово: оновлено ${changed}`);
  };

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
            вага = важчий день. Діапазон від 0.1 до 5.0, крок 0.05.
            <br />
            <span className="text-muted">
              Наприклад: 1.0 — звичайний будень, 1.5 — п'ятниця/неділя, 2.0 — субота, 0.5 — легкий
              день.
            </span>
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
                    step="0.05"
                    min="0.1"
                    max="5.0"
                    className="form-control text-center fw-bold form-control-sm mx-auto"
                    style={{ width: '70px' }}
                    value={weights[day]}
                    onChange={(e) => {
                      setWeights({ ...weights, [day]: parseFloat(e.target.value) });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 text-muted small">
            Нові ваги будуть застосовані після натискання загальної кнопки збереження внизу
            сторінки.
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

      {/* First duty date sync */}
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
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={applyFirstDutyDates}>
            <i className="fas fa-calendar-check me-1"></i>З дати першого чергування
          </button>
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

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="forceUseAllWhenFew"
              checked={autoOpts.forceUseAllWhenFew}
              onChange={(e) =>
                setAutoOpts({
                  ...autoOpts,
                  forceUseAllWhenFew: e.target.checked,
                })
              }
            />
            <label className="form-check-label" htmlFor="forceUseAllWhenFew">
              <strong>Задіяти всіх, якщо мало осіб (7 і менше)</strong>
              <div className="text-muted small">
                Коли доступних осіб 7 і менше — система спочатку призначає тих, хто ще не чергував
                цього тижня, навіть якщо їх навантаження вище за інших. Вимкніть, щоб строго
                дотримуватись балансу навантаження.
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

      {/* History in Logic */}
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
              onChange={(e) => setIgnoreHistory(e.target.checked)}
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

  // ─── Sub-tab: Interface ────────────────────────────────────
  const renderInterfaceTab = () => (
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
                onChange={(e) => setScale(parseInt(e.target.value, 10))}
              >
                <option value={70}>70% (дуже малий)</option>
                <option value={80}>80% (малий)</option>
                <option value={85}>85%</option>
                <option value={90}>90%</option>
                <option value={95}>95%</option>
                <option value={100}>100% (стандарт)</option>
                <option value={105}>105%</option>
                <option value={110}>110%</option>
                <option value={115}>115%</option>
                <option value={120}>120%</option>
                <option value={125}>125%</option>
                <option value={130}>130% (великий)</option>
                <option value={140}>140%</option>
                <option value={150}>150%</option>
                <option value={160}>160% (дуже великий)</option>
              </select>
              <div className="form-text">
                Застосовується до всього інтерфейсу (браузер, Tauri, Electron).
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
              <div className="form-check form-switch mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="showCreatorFooter"
                  checked={sigs.showCreatorFooter !== false}
                  onChange={(e) =>
                    setSigs({ ...sigs, showCreatorFooter: e.target.checked })
                  }
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
    <div>
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
          <li className="nav-item">
            <button
              className={`nav-link ${subTab === 'interface' ? 'active' : ''}`}
              onClick={() => setSubTab('interface')}
            >
              <i className="fas fa-display me-1"></i>Інтерфейс
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
      {subTab === 'interface' && renderInterfaceTab()}
      {subTab === 'print' && renderPrintTab()}

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
