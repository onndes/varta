// src/components/settings/AutoSchedulerOptionsCard.tsx
import React from 'react';
import type { AutoScheduleOptions } from '../../types';

const REST_DAYS_MIN = 1;
const REST_DAYS_MAX = 7; // min/max rest days between duties

interface AutoSchedulerOptionsCardProps {
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
}

/**
 * Card with all auto-scheduler behaviour toggles: consecutive-day avoidance,
 * load balancing, weekly limits, etc.
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

      {/* Pre-generation confirmation */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="confirmBeforeGeneration"
          checked={autoOpts.confirmBeforeGeneration !== false}
          onChange={(e) =>
            onAutoOptsChange({ ...autoOpts, confirmBeforeGeneration: e.target.checked })
          }
        />
        <label className="form-check-label" htmlFor="confirmBeforeGeneration">
          <strong>Підтвердження перед генерацією</strong>
          <div className="text-muted small">
            Перед запуском «Генерація» / «Заповнити» показувати зведення по періоду: статуси
            (відпустка, відрядження, лікування, відсутність), виключені з авторозподілу,
            заблоковані дні тижня та попередження, якщо людей на тиждень замало. Вимкніть, щоб
            запускати генерацію одразу без перевірки.
          </div>
        </label>
      </div>

      {/* Duty rotation pattern */}
      <div className="mb-4">
        <label className="form-label fw-bold">
          <i className="fas fa-sync-alt me-2"></i>Режим ротації
        </label>
        <div className="d-flex flex-column gap-2">
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="dutyPatternMode"
              id="patternClassic"
              checked={!autoOpts.dutyPattern || autoOpts.dutyPattern.mode === 'classic'}
              onChange={() => onAutoOptsChange({ ...autoOpts, dutyPattern: undefined })}
            />
            <label className="form-check-label" htmlFor="patternClassic">
              <strong>Класичний</strong>
              <div className="text-muted small">
                Поодинокі наряди з мінімальним відпочинком (поточний режим).
              </div>
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="dutyPatternMode"
              id="patternBlock"
              checked={autoOpts.dutyPattern?.mode === 'block-rotation'}
              onChange={() =>
                onAutoOptsChange({
                  ...autoOpts,
                  dutyPattern: { mode: 'block-rotation', dutyDays: 4, restDays: 2 },
                })
              }
            />
            <label className="form-check-label" htmlFor="patternBlock">
              <strong>Блочна ротація</strong>
              <div className="text-muted small">
                N діб поспіль у наряді, потім M діб відсипного.
              </div>
            </label>
          </div>
        </div>

        {autoOpts.dutyPattern?.mode === 'block-rotation' && (
          <div className="ms-4 mt-3 p-3 bg-light rounded">
            <div className="row g-3">
              <div className="col-auto">
                <label className="form-label fw-bold small">Діб у наряді</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  className="form-control"
                  style={{ width: '80px' }}
                  value={autoOpts.dutyPattern.dutyDays}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      dutyPattern: {
                        ...autoOpts.dutyPattern!,
                        dutyDays: Math.max(1, Math.min(14, parseInt(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </div>
              <div className="col-auto">
                <label className="form-label fw-bold small">Діб відсипного</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="form-control"
                  style={{ width: '80px' }}
                  value={autoOpts.dutyPattern.restDays}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      dutyPattern: {
                        ...autoOpts.dutyPattern!,
                        restDays: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)),
                      },
                    })
                  }
                />
              </div>
            </div>
            <div className="form-text mt-2">
              <i className="fas fa-info-circle me-1"></i>
              Цикл: {autoOpts.dutyPattern.dutyDays} діб наряду +{' '}
              {autoOpts.dutyPattern.restDays} діб відсипного ={' '}
              {autoOpts.dutyPattern.dutyDays + autoOpts.dutyPattern.restDays} діб повного циклу.
            </div>
          </div>
        )}
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

      {/* Prioritize after week off */}
      <div className="form-check form-switch mb-3">
        <input
          className="form-check-input"
          type="checkbox"
          id="prioritizeAfterWeekOff"
          checked={autoOpts.prioritizeAfterWeekOff === true}
          onChange={(e) =>
            onAutoOptsChange({ ...autoOpts, prioritizeAfterWeekOff: e.target.checked })
          }
        />
        <label className="form-check-label" htmlFor="prioritizeAfterWeekOff">
          <strong>Пріоритет після тижня без чергувань</strong>
          <div className="text-muted small">
            Якщо боєць пропустив попередній тиждень — він отримує підвищений пріоритет на поточний.
            Запобігає ситуації, коли одна й та сама людина «сидить» 2+ тижні поспіль без наряду.
            Вплив плавно зменшується при збільшенні кількості осіб (від 7 до 14), для великих груп
            вимикається автоматично.
          </div>
        </label>
      </div>

      {/* Force-override fairness accounting */}
      <div className="mb-3">
        <label className="form-label fw-bold">
          <i className="fas fa-hand-paper me-2"></i>Force-наряд у заблокований/недоступний день
        </label>
        <div className="text-muted small mb-2">
          Як враховувати у справедливості наряд, призначений примусово (force) у день, коли особа
          була заблокована або недоступна. Жорсткі правила (відпочинок, несумісні пари, тижневі
          ліміти) діють завжди, незалежно від вибору.
        </div>
        <div className="d-flex flex-column gap-2">
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="forceOverrideAccounting"
              id="foaNormal"
              checked={(autoOpts.forceOverrideAccounting ?? 'normal') === 'normal'}
              onChange={() => onAutoOptsChange({ ...autoOpts, forceOverrideAccounting: 'normal' })}
            />
            <label className="form-check-label" htmlFor="foaNormal">
              <strong>Як звичайний наряд</strong>
              <div className="text-muted small">
                Зараховується у навантаження і статистику — наступні наряди особа отримає пізніше.
              </div>
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="forceOverrideAccounting"
              id="foaNeutral"
              checked={autoOpts.forceOverrideAccounting === 'neutral'}
              onChange={() => onAutoOptsChange({ ...autoOpts, forceOverrideAccounting: 'neutral' })}
            />
            <label className="form-check-label" htmlFor="foaNeutral">
              <strong>Нейтрально</strong>
              <div className="text-muted small">
                Не впливає на розподіл: коли з особи знімуть статуси/блокування, генерація буде
                чесною, ніби force-наряду не було.
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default AutoSchedulerOptionsCard;
