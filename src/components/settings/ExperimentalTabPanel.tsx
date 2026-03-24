// src/components/settings/ExperimentalTabPanel.tsx
import React from 'react';
import type { AutoScheduleOptions } from '../../types';

interface ExperimentalTabPanelProps {
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
}

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
      <div className="card-header bg-white py-3">
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
  </>
);

export default ExperimentalTabPanel;
