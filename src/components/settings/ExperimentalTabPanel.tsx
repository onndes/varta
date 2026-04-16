// src/components/settings/ExperimentalTabPanel.tsx
import React, { useState } from 'react';
import type { AutoScheduleOptions } from '../../types';

interface ExperimentalTabPanelProps {
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
}

/** Small info-button that opens a modal with explanation text. */
const InfoPopover: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-link btn-sm p-0 ms-2 text-info"
        onClick={() => setShow(true)}
        title="Детальніше"
      >
        <i className="fas fa-info-circle"></i>
      </button>
      {show && (
        <div
          className="modal d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShow(false)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title fw-bold">{title}</h6>
                <button type="button" className="btn-close" onClick={() => setShow(false)}></button>
              </div>
              <div className="modal-body small">{children}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Experimental tab — houses unstable or non-default algorithm options
 * that are not part of the standard scheduling workflow.
 */
const ExperimentalTabPanel: React.FC<ExperimentalTabPanelProps> = ({
  autoOpts,
  onAutoOptsChange,
}) => (
  <>
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-flask me-2"></i>Експериментальні налаштування
        </h5>
      </div>
      <div className="card-body">
        <div className="alert alert-warning py-2 small mb-4">
          <i className="fas fa-triangle-exclamation me-1"></i>
          Ці параметри є нестандартними або знаходяться в стадії тестування. Зміна може вплинути на
          поведінку алгоритму чи вигляд інтерфейсу.
        </div>

        {/* Even weekly distribution */}
        <div className="form-check form-switch mb-4">
          <input
            className="form-check-input"
            type="checkbox"
            id="evenWeeklyDistribution"
            checked={autoOpts.evenWeeklyDistribution ?? true}
            onChange={(e) =>
              onAutoOptsChange({ ...autoOpts, evenWeeklyDistribution: e.target.checked })
            }
          />
          <label className="form-check-label" htmlFor="evenWeeklyDistribution">
            <strong>Рівномірний розподіл нарядів по тижню (мало осіб)</strong>
            <div className="text-muted small">
              При ≤7 доступних осіб — ніхто не отримує другий наряд, поки всі не мають хоча б один;
              ніхто не отримує третій, поки всі не мають другий. Запобігає ситуації «3–1–1».
              <br />
              <span className="text-success fw-semibold">
                Рекомендовано: <strong>Увімкнено</strong>
              </span>{' '}
              — значно зменшує кількість повторів одного дня тижня два тижні поспіль.
            </div>
          </label>
        </div>

        <hr className="my-3" />

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
              Спочатку по кількості чергувань на день тижня (драбинка), потім по загальній
              кількості, потім по вазі + карма. Вимкніть лише для тестування.
            </div>
          </label>
        </div>

        {/* Aggressive balancing — nested under considerLoad */}
        {autoOpts.considerLoad && (
          <div className="ms-4 mb-4 p-3 bg-body-tertiary rounded">
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

            {autoOpts.aggressiveLoadBalancing && (
              <div className="ms-4 mt-2">
                <label className="form-label fw-bold small">Поріг різниці</label>
                <div className="d-flex align-items-center gap-3">
                  <input
                    type="number"
                    step={0.05}
                    min={0.05}
                    max={1.0}
                    className="form-control form-control-sm"
                    style={{ width: '80px' }}
                    value={autoOpts.aggressiveLoadBalancingThreshold}
                    onChange={(e) =>
                      onAutoOptsChange({
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

        <hr className="my-3" />

        {/* Experimental stats view */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="useExperimentalStatsView"
            checked={!!autoOpts.useExperimentalStatsView}
            onChange={(e) =>
              onAutoOptsChange({ ...autoOpts, useExperimentalStatsView: e.target.checked })
            }
          />
          <label className="form-check-label" htmlFor="useExperimentalStatsView">
            <strong>Експериментальний вид статистики</strong>
            <div className="text-muted small">
              Альтернативний вигляд таблиці статистики з прогрес-барами відносного навантаження,
              відхиленням від середнього та згортанням стовпців Пн–Нд. Вимкніть для стандартного
              виду.
            </div>
          </label>
        </div>
      </div>
    </div>

    {/* Optimization algorithms */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-brain me-2"></i>Оптимізація графіку
        </h5>
      </div>
      <div className="card-body">
        <div className="alert alert-info py-2 small mb-4">
          <i className="fas fa-info-circle me-1"></i>
          Покращена оптимізація може зайняти більше часу, але дає кращий розподіл. Прогрес
          відображається під час генерації.
        </div>

        {/* Lookahead */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="lookaheadEnabled"
            checked={(autoOpts.lookaheadDepth ?? 0) > 0}
            onChange={(e) =>
              onAutoOptsChange({
                ...autoOpts,
                lookaheadDepth: e.target.checked ? 5 : 0,
              })
            }
          />
          <label className="form-check-label" htmlFor="lookaheadEnabled">
            <strong>Перегляд наперед (Lookahead)</strong>
            <InfoPopover title="Перегляд наперед (Lookahead)">
              <p>
                Стандартний алгоритм обирає кандидата «тут і зараз» — жадібно. Lookahead для кожної
                дати симулює кілька варіантів на N днів уперед і обирає того, хто дає найкращий
                загальний розподіл.
              </p>
              <p className="mb-1">
                <strong>Глибина</strong> — скільки днів уперед симулюється. 7 = один тиждень, 14 =
                два тижні. Більше = точніший прогноз, але повільніше.
              </p>
              <p className="mb-1">
                <strong>Кандидатів</strong> — з <em>уже відсортованого за справедливістю</em> списку
                беруться перші N і для кожного запускається симуляція вперед. При 100 людях алгоритм
                вже визначив найкращих — немає сенсу симулювати всіх 100, достатньо перевірити
                топ-3–5. Обмежується реальним розміром пулу: якщо доступних лише 4 — симулюються всі
                4, навіть якщо встановлено 10.
              </p>
              <p className="mb-0 text-warning-emphasis">
                <i className="fas fa-lightbulb me-1"></i>
                Рекомендовано: глибина 7, кандидатів 3–5.
              </p>
            </InfoPopover>
            <div className="text-muted small">
              Для кожної дати симулює вплив кожного кандидата на наступні дні. Допомагає уникнути
              «пасток» жадібного алгоритму.
            </div>
          </label>
        </div>

        {(autoOpts.lookaheadDepth ?? 0) > 0 && (
          <div className="ms-4 mb-4 p-3 bg-body-tertiary rounded">
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label fw-bold small">Глибина (днів)</label>
                <input
                  type="range"
                  className="form-range"
                  min={1}
                  max={28}
                  value={autoOpts.lookaheadDepth ?? 5}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      lookaheadDepth: parseInt(e.target.value),
                    })
                  }
                />
                <div className="d-flex justify-content-between small text-muted">
                  <span>1</span>
                  <span className="fw-bold text-primary">{autoOpts.lookaheadDepth ?? 5}</span>
                  <span>28</span>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label fw-bold small">Симулювати топ-N кандидатів</label>
                <input
                  type="range"
                  className="form-range"
                  min={2}
                  max={10}
                  value={autoOpts.lookaheadCandidates ?? 3}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      lookaheadCandidates: parseInt(e.target.value),
                    })
                  }
                />
                <div className="d-flex justify-content-between small text-muted">
                  <span>2</span>
                  <span className="fw-bold text-primary">{autoOpts.lookaheadCandidates ?? 3}</span>
                  <span>10</span>
                </div>
              </div>
            </div>
            <div className="text-muted small mt-2">
              <i className="fas fa-info-circle me-1"></i>
              Алгоритм вже відсортував кандидатів — значно більше{' '}
              <strong>{autoOpts.lookaheadCandidates ?? 3}</strong> симулювати не потрібно.
              {(autoOpts.lookaheadDepth ?? 5) >= 14 && (
                <span className="text-warning ms-2">
                  <i className="fas fa-triangle-exclamation me-1"></i>
                  Глибина {autoOpts.lookaheadDepth} ={' '}
                  {Math.round((autoOpts.lookaheadDepth ?? 5) / 7)}{' '}
                  {Math.round((autoOpts.lookaheadDepth ?? 5) / 7) === 1 ? 'тиждень' : 'тижні'}{' '}
                  вперед, може бути повільно
                </span>
              )}
            </div>
          </div>
        )}

        <hr className="my-3" />

        {/* Tabu Search */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="useTabuSearch"
            checked={!!autoOpts.useTabuSearch}
            onChange={(e) => onAutoOptsChange({ ...autoOpts, useTabuSearch: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="useTabuSearch">
            <strong>Tabu Search (метаевристика)</strong>
            <InfoPopover title="Tabu Search (метаевристика)">
              <p>
                Після стандартного обміну (Фази 1–3) запускається пошук, що може тимчасово приймати
                гірші рішення, щоб вийти з «пастки» локального мінімуму.
              </p>
              <p className="mb-1">
                <strong>Ітерацій</strong> — кількість спроб покращити розклад. Більше = вищий шанс
                знайти краще рішення, але повільніше.
              </p>
              <p className="mb-1">
                <strong>Табу-тенюр</strong> — скільки ітерацій «заборонений» зворотній хід. Менше =
                гнучкіший пошук, більше = ширше охоплення.
              </p>
              <p className="mb-0">
                Після завершення <strong>завжди відновлюється найкращий знайдений розклад</strong> —
                гірший за початковий результат неможливий.
              </p>
            </InfoPopover>
            <div className="text-muted small">
              Після стандартної оптимізації запускає метаевристичний пошук, який може приймати
              погіршуючі ходи для виходу з локальних мінімумів. Знаходить рішення, недосяжні для
              звичайного обміну.
            </div>
          </label>
        </div>

        {autoOpts.useTabuSearch && (
          <div className="ms-4 mb-3 p-3 bg-body-tertiary rounded">
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label fw-bold small">Ітерацій</label>
                <input
                  type="range"
                  className="form-range"
                  min={10}
                  max={500}
                  step={10}
                  value={autoOpts.tabuMaxIterations ?? 50}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      tabuMaxIterations: parseInt(e.target.value),
                    })
                  }
                />
                <div className="d-flex justify-content-between small text-muted">
                  <span>10</span>
                  <span className="fw-bold text-primary">{autoOpts.tabuMaxIterations ?? 50}</span>
                  <span>500</span>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label fw-bold small">Табу-тенюр</label>
                <input
                  type="range"
                  className="form-range"
                  min={3}
                  max={20}
                  value={autoOpts.tabuTenure ?? 7}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      tabuTenure: parseInt(e.target.value),
                    })
                  }
                />
                <div className="d-flex justify-content-between small text-muted">
                  <span>3</span>
                  <span className="fw-bold text-primary">{autoOpts.tabuTenure ?? 7}</span>
                  <span>20</span>
                </div>
              </div>
            </div>
            <div className="text-muted small mt-2">
              <i className="fas fa-clock me-1"></i>
              Орієнтовний час: ~{Math.max(
                1,
                Math.round((autoOpts.tabuMaxIterations ?? 50) * 0.3)
              )}{' '}
              сек
              {(autoOpts.tabuMaxIterations ?? 50) >= 300 && (
                <span className="text-warning ms-2">
                  <i className="fas fa-triangle-exclamation me-1"></i>
                  Може бути повільно на слабких ПК
                </span>
              )}
            </div>
          </div>
        )}

        <hr className="my-3" />

        {/* Multi-Restart (Iterated Local Search) */}
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="useMultiRestart"
            checked={!!autoOpts.useMultiRestart}
            onChange={(e) => onAutoOptsChange({ ...autoOpts, useMultiRestart: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="useMultiRestart">
            <strong>Multi-Restart (максимальна якість)</strong>
            <InfoPopover title="Multi-Restart (Iterated Local Search)">
              <p>
                Запускається після всіх інших оптимізаторів і використовує їх результат як відправну
                точку. Протягом заданого часу виконує сотні незалежних спроб покращити розклад:
              </p>
              <ol className="mb-2 ps-3">
                <li>
                  <strong>Збереження</strong> — зберігає поточний найкращий результат
                </li>
                <li>
                  <strong>Збурення</strong> — випадково міняє 2–4 пари для виходу з локального
                  оптимуму
                </li>
                <li>
                  <strong>Локальний пошук</strong> — быстра оптимізація (Фази 1–2) до сходження
                </li>
                <li>
                  <strong>Прийняття</strong> — якщо результат кращий — зберегти, інакше спробувати
                  знову
                </li>
              </ol>
              <p className="mb-1">
                За 30 секунд виконується ~200–500 рестартів. Гірший за поточний результат неможливий
                — алгоритм завжди відновлює найкраще знайдене рішення.
              </p>
              <p className="mb-0 text-success-emphasis">
                <i className="fas fa-lightbulb me-1"></i>
                Найефективніший для груп 10–30 осіб, де Tabu Search може застрягти в локальному
                оптимумі. Ідеально поєднується з Tabu Search.
              </p>
            </InfoPopover>
            <div className="text-muted small">
              Протягом заданого часу виконує сотні спроб з випадковим збуренням + швидкою
              оптимізацією. Знаходить рішення, недосяжні для одноразового Tabu Search.
            </div>
          </label>
        </div>

        {autoOpts.useMultiRestart && (
          <div className="ms-4 mb-3 p-3 bg-body-tertiary rounded">
            {/* Strategy selector */}
            <div className="mb-3">
              <label className="form-label fw-bold small">
                Стратегія збурення
                <InfoPopover title="Стратегія збурення">
                  <p>
                    <strong>Парний обмін (класичний)</strong> — випадково міняє 2–4 пари місцями.
                    Швидкий, добре працює для невеликих груп.
                  </p>
                  <p className="mb-0">
                    <strong>LNS (руйнування-відновлення)</strong> — видаляє блок із 3–7 днів і
                    заповнює їх заново з нуля, дотримуючись усіх обмежень. Досліджує ширший простір
                    рішень, ефективніший для груп 10+ осіб.
                  </p>
                </InfoPopover>
              </label>
              <div className="btn-group w-100" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  name="multiRestartStrategy"
                  id="strategyPairSwap"
                  checked={(autoOpts.multiRestartStrategy ?? 'pair-swap') === 'pair-swap'}
                  onChange={() =>
                    onAutoOptsChange({ ...autoOpts, multiRestartStrategy: 'pair-swap' })
                  }
                />
                <label className="btn btn-outline-primary btn-sm" htmlFor="strategyPairSwap">
                  <i className="fas fa-exchange-alt me-1"></i>Парний обмін
                </label>
                <input
                  type="radio"
                  className="btn-check"
                  name="multiRestartStrategy"
                  id="strategyLns"
                  checked={(autoOpts.multiRestartStrategy ?? 'pair-swap') === 'lns'}
                  onChange={() => onAutoOptsChange({ ...autoOpts, multiRestartStrategy: 'lns' })}
                />
                <label className="btn btn-outline-primary btn-sm" htmlFor="strategyLns">
                  <i className="fas fa-recycle me-1"></i>LNS
                </label>
              </div>
            </div>

            {/* Time limit mode */}
            <div className="mb-3">
              <label className="form-label fw-bold small">Обмеження часу</label>
              <div className="btn-group w-100" role="group">
                <input
                  type="radio"
                  className="btn-check"
                  name="multiRestartTimeLimitMode"
                  id="timeLimitFixed"
                  checked={(autoOpts.multiRestartTimeLimitMode ?? 'fixed') === 'fixed'}
                  onChange={() =>
                    onAutoOptsChange({ ...autoOpts, multiRestartTimeLimitMode: 'fixed' })
                  }
                />
                <label className="btn btn-outline-primary btn-sm" htmlFor="timeLimitFixed">
                  <i className="fas fa-hourglass-half me-1"></i>За часом
                </label>
                <input
                  type="radio"
                  className="btn-check"
                  name="multiRestartTimeLimitMode"
                  id="timeLimitUnlimited"
                  checked={(autoOpts.multiRestartTimeLimitMode ?? 'fixed') === 'unlimited'}
                  onChange={() =>
                    onAutoOptsChange({ ...autoOpts, multiRestartTimeLimitMode: 'unlimited' })
                  }
                />
                <label className="btn btn-outline-primary btn-sm" htmlFor="timeLimitUnlimited">
                  <i className="fas fa-infinity me-1"></i>Безлімітний (до Стоп)
                </label>
              </div>
            </div>

            {/* Time slider — only in fixed mode */}
            {(autoOpts.multiRestartTimeLimitMode ?? 'fixed') === 'fixed' && (
              <>
                <label className="form-label fw-bold small">Час пошуку (секунд)</label>
                <input
                  type="range"
                  className="form-range"
                  min={10}
                  max={300}
                  step={5}
                  value={Math.round((autoOpts.multiRestartTimeoutMs ?? 30_000) / 1000)}
                  onChange={(e) =>
                    onAutoOptsChange({
                      ...autoOpts,
                      multiRestartTimeoutMs: parseInt(e.target.value) * 1000,
                    })
                  }
                />
                <div className="d-flex justify-content-between small text-muted">
                  <span>10с</span>
                  <span className="fw-bold text-primary">
                    {Math.round((autoOpts.multiRestartTimeoutMs ?? 30_000) / 1000)} сек
                  </span>
                  <span>5 хв</span>
                </div>
              </>
            )}

            {(autoOpts.multiRestartTimeLimitMode ?? 'fixed') === 'unlimited' && (
              <div className="text-muted small">
                <i className="fas fa-info-circle me-1"></i>
                Оптимізація працюватиме безперервно, поки ви не натиснете <strong>Стоп</strong> у
                рядку прогресу.
              </div>
            )}

            <div className="text-muted small mt-2">
              {(autoOpts.multiRestartTimeLimitMode ?? 'fixed') === 'fixed' && (
                <>
                  <i className="fas fa-info-circle me-1"></i>
                  За{' '}
                  <strong>
                    {Math.round((autoOpts.multiRestartTimeoutMs ?? 30_000) / 1000)} секунд
                  </strong>{' '}
                  ~{Math.round(((autoOpts.multiRestartTimeoutMs ?? 30_000) / 1000) * 12)}–
                  {Math.round(((autoOpts.multiRestartTimeoutMs ?? 30_000) / 1000) * 20)} рестартів
                </>
              )}
              {!autoOpts.useTabuSearch && (
                <span className="text-info ms-2">
                  <i className="fas fa-lightbulb me-1"></i>
                  Рекомендуємо також увімкнути Tabu Search для кращого старту
                </span>
              )}
            </div>
            <div className="text-muted small mt-1">
              <i className="fas fa-calendar-days me-1"></i>
              Оптимізує <strong>всі дати</strong>, згенеровані поточним запуском (1 тиждень при
              «Згенерувати», або весь діапазон при каскадному перерахунку).
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Scheduler Visualization */}
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-eye me-2"></i>Візуалізація алгоритму
        </h5>
      </div>
      <div className="card-body">
        <div className="form-check form-switch mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="enableSchedulerVisualization"
            checked={!!autoOpts.enableSchedulerVisualization}
            onChange={(e) =>
              onAutoOptsChange({ ...autoOpts, enableSchedulerVisualization: e.target.checked })
            }
          />
          <label className="form-check-label" htmlFor="enableSchedulerVisualization">
            <strong>Анімація роботи алгоритму</strong>
            <div className="text-muted small">
              Під час генерації підсвічує комірки таблиці: жовтим — дату, що обробляється, синім —
              кандидатів, зеленим — вибраного. Під час оптимізації — синім позначає прийняті обміни.
              <br />
              <span className="text-warning-emphasis">
                <i className="fas fa-triangle-exclamation me-1"></i>
                Сповільнює генерацію. Використовуйте для демонстрації або аналізу.
              </span>
            </div>
          </label>
        </div>

        {autoOpts.enableSchedulerVisualization && (
          <div className="ms-4 mt-2">
            <label className="form-label fw-bold small">
              Швидкість анімації ({Math.min(autoOpts.schedulerVisSpeed ?? 0, 50)} мс)
            </label>
            <input
              type="range"
              className="form-range"
              min={0}
              max={50}
              step={5}
              value={Math.min(autoOpts.schedulerVisSpeed ?? 0, 50)}
              onChange={(e) =>
                onAutoOptsChange({
                  ...autoOpts,
                  schedulerVisSpeed: parseInt(e.target.value),
                })
              }
            />
            <div className="d-flex justify-content-between small text-muted">
              <span>0 мс (миттєво)</span>
              <span>50 мс (повільно)</span>
            </div>

            <div className="form-check form-switch mt-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="schedulerVisShowAttempts"
                checked={!!autoOpts.schedulerVisShowAttempts}
                onChange={(e) =>
                  onAutoOptsChange({ ...autoOpts, schedulerVisShowAttempts: e.target.checked })
                }
              />
              <label className="form-check-label" htmlFor="schedulerVisShowAttempts">
                <strong>Показувати всі спроби</strong>
                <div className="text-muted small">
                  Підсвічує <span className="text-danger">червоним</span> кожну комбінацію, яку
                  алгоритм перевіряє під час оптимізації (Фази 1-3, Tabu Search). Синім — прийняті
                  обміни. Дозволяє побачити, що алгоритм справді перебирає всі дні та людей.
                  <br />
                  <span className="text-warning-emphasis">
                    <i className="fas fa-triangle-exclamation me-1"></i>
                    Значно сповільнює оптимізацію. Тільки для аналізу.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  </>
);

export default ExperimentalTabPanel;
