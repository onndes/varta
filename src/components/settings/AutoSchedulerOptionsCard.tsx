// src/components/settings/AutoSchedulerOptionsCard.tsx
import React from 'react';
import type { AutoScheduleOptions } from '../../types';
import DebtUserOptions from './DebtUserOptions';

const REST_DAYS_MIN = 1;
const REST_DAYS_MAX = 7; // min/max rest days between duties
const BALANCE_STEP = 0.05;
const BALANCE_MIN = 0.05;
const BALANCE_MAX = 1.0;
const BALANCE_DEFAULT = 0.2;

interface AutoSchedulerOptionsCardProps {
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
}

/**
 * Card with all auto-scheduler behaviour toggles: consecutive-day avoidance,
 * owed-day priority, load balancing, weekly limits, debt-user overrides, etc.
 */
const AutoSchedulerOptionsCard: React.FC<AutoSchedulerOptionsCardProps> = ({
  autoOpts,
  onAutoOptsChange,
}) => (
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

      {/* Avoid consecutive days */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="avoidConsecutive"
          checked={autoOpts.avoidConsecutiveDays}
          onChange={(e) =>
            onAutoOptsChange({ ...autoOpts, avoidConsecutiveDays: e.target.checked })
          }
        />
        <label className="form-check-label" htmlFor="avoidConsecutive">
          <strong>Не ставити два дні поспіль</strong>
          <div className="text-muted small">
            Особа, яка чергувала вчора, не буде призначена на сьогодні (день відпочинку після
            чергування).
          </div>
        </label>
      </div>

      {/* Minimum rest days — shown only when consecutive avoidance is on */}
      {autoOpts.avoidConsecutiveDays && (
        <div className="ms-4 mb-3 p-3 bg-light rounded">
          <label className="form-label fw-bold">
            <i className="fas fa-bed me-2"></i>Мінімум днів відпочинку
          </label>
          <div className="d-flex align-items-center gap-3">
            <input
              type="number"
              min={REST_DAYS_MIN}
              max={REST_DAYS_MAX}
              className="form-control"
              style={{ width: '80px' }}
              value={autoOpts.minRestDays || REST_DAYS_MIN}
              onChange={(e) =>
                onAutoOptsChange({
                  ...autoOpts,
                  minRestDays: parseInt(e.target.value) || REST_DAYS_MIN,
                })
              }
            />
            <span className="text-muted small">
              {autoOpts.minRestDays === 1 && '(не ставити 2 дні поспіль)'}
              {autoOpts.minRestDays === 2 && '(мінімум 1 день перерви між чергуваннями)'}
              {autoOpts.minRestDays === 3 && '(мінімум 2 дні перерви між чергуваннями)'}
              {autoOpts.minRestDays &&
                autoOpts.minRestDays > 3 &&
                `(мінімум ${autoOpts.minRestDays - 1} днів перерви)`}
            </span>
          </div>
          <div className="form-text mt-2">
            <i className="fas fa-info-circle me-1"></i>
            Якщо не вистачає людей — система автоматично зменшить період відпочинку для заповнення
            графіка.
          </div>
        </div>
      )}

      {/* Respect owed days */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="respectOwed"
          checked={autoOpts.respectOwedDays}
          onChange={(e) => onAutoOptsChange({ ...autoOpts, respectOwedDays: e.target.checked })}
        />
        <label className="form-check-label" htmlFor="respectOwed">
          <strong>Враховувати борги (owedDays)</strong>
          <div className="text-muted small">
            Особи з боргом за конкретний день тижня мають пріоритет при призначенні саме на цей
            день.
          </div>
        </label>
      </div>

      {/* Consider load */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="considerLoad"
          checked={autoOpts.considerLoad}
          onChange={(e) => onAutoOptsChange({ ...autoOpts, considerLoad: e.target.checked })}
        />
        <label className="form-check-label" htmlFor="considerLoad">
          <strong>Враховувати навантаження</strong>
          {!autoOpts.considerLoad && (
            <span className="text-danger small fw-bold ms-2">
              (вимкнення ламає справедливість розподілу!)
            </span>
          )}
          <div className="text-muted small">
            Спочатку по кількості чергувань на день тижня (драбинка), потім по загальній кількості,
            потім по вазі + карма. Вимкніть лише для тестування.
          </div>
        </label>
      </div>

      {/* Aggressive balancing — nested under considerLoad */}
      {autoOpts.considerLoad && (
        <div className="ms-4 mb-3 p-3 bg-light rounded">
          <div className="form-check form-switch mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="aggressiveBalance"
              checked={autoOpts.aggressiveLoadBalancing}
              onChange={(e) =>
                onAutoOptsChange({ ...autoOpts, aggressiveLoadBalancing: e.target.checked })
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

          {/* Balance threshold — shown only when aggressive balancing is on */}
          {autoOpts.aggressiveLoadBalancing && (
            <div className="ms-4 mt-2">
              <label className="form-label fw-bold small">Поріг різниці</label>
              <div className="d-flex align-items-center gap-3">
                <input
                  type="number"
                  step={BALANCE_STEP}
                  min={BALANCE_MIN}
                  max={BALANCE_MAX}
                  className="form-control form-control-sm"
                  style={{ width: '80px' }}
                  value={autoOpts.aggressiveLoadBalancingThreshold}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      aggressiveLoadBalancingThreshold:
                        parseFloat(e.target.value) || BALANCE_DEFAULT,
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

      {/* One duty per week when 7+ people available */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="limitOnePerWeek"
          checked={autoOpts.limitOneDutyPerWeekWhenSevenPlus}
          onChange={(e) =>
            onAutoOptsChange({ ...autoOpts, limitOneDutyPerWeekWhenSevenPlus: e.target.checked })
          }
        />
        <label className="form-check-label" htmlFor="limitOnePerWeek">
          <strong>Якщо доступно 7+ осіб — не більше 1 чергування на тиждень</strong>
          <div className="text-muted small">
            Коли на тиждень вистачає людей, система спочатку ставить тих, хто ще не чергував у цьому
            тижні. Якщо інакше не закривається графік — автоматично робить відкат.
          </div>
        </label>
      </div>

      {/* Force use all when few (≤7) */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="forceUseAllWhenFew"
          checked={autoOpts.forceUseAllWhenFew}
          onChange={(e) => onAutoOptsChange({ ...autoOpts, forceUseAllWhenFew: e.target.checked })}
        />
        <label className="form-check-label" htmlFor="forceUseAllWhenFew">
          <strong>Задіяти всіх, якщо мало осіб (7 і менше)</strong>
          <div className="text-muted small">
            Коли доступних осіб 7 і менше — система спочатку призначає тих, хто ще не чергував цього
            тижня, навіть якщо їх навантаження вище за інших. Вимкніть, щоб строго дотримуватись
            балансу навантаження.
          </div>
        </label>
      </div>

      {/* Allow debt users / repayment options */}
      <DebtUserOptions autoOpts={autoOpts} onAutoOptsChange={onAutoOptsChange} />

      <hr className="my-3" />

      {/* Experimental stats view */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="useExperimentalStatsView"
          checked={autoOpts.useExperimentalStatsView}
          onChange={(e) =>
            onAutoOptsChange({ ...autoOpts, useExperimentalStatsView: e.target.checked })
          }
        />
        <label className="form-check-label" htmlFor="useExperimentalStatsView">
          <strong>Експериментальний вид статистики</strong>
          <div className="text-muted small">
            Альтернативний вигляд таблиці статистики з прогрес-барами відносного навантаження,
            відхиленням від середнього та згортанням стовпців Пн–Нд. Вимкніть для стандартного виду.
          </div>
        </label>
      </div>
    </div>
  </div>
);

export default AutoSchedulerOptionsCard;
