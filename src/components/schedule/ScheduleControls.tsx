import React from 'react';
import type { PrintMode } from '../../types';
import { formatDate, toLocalISO } from '../../utils/dateUtils';

interface ScheduleControlsProps {
  weekDates: string[];
  cascadeStartDate: string | null;
  shouldShowCascade: boolean;
  conflictsCount: number;
  criticalConflictsCount: number;
  rowFilter: 'all' | 'available' | 'assigned';
  showRowFilters: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onDatePick: (date: string) => void;
  onFillGaps: () => void;
  onFixConflicts: () => void;
  onAutoSchedule: () => void;
  onCascadeRecalc: () => void;
  onDismissCascade: () => void;
  onClearWeek: () => void;
  onImportSchedule: () => void;
  historyMode: boolean;
  onToggleHistoryMode: () => void;
  forceAssignMode: boolean;
  onToggleForceAssignMode: () => void;
  onToggleRowFilter: (filter: 'available' | 'assigned') => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
  violationsCount?: number;
  onPrint?: (mode: PrintMode) => void;
  zenMode?: boolean;
  onZenToggle?: () => void;
}

/**
 * Schedule Controls Component
 * Navigation and automation buttons
 */
const ScheduleControls: React.FC<ScheduleControlsProps> = ({
  weekDates,
  cascadeStartDate,
  shouldShowCascade,
  conflictsCount,
  criticalConflictsCount,
  rowFilter,
  showRowFilters,
  onPrevWeek,
  onNextWeek,
  onToday,
  onDatePick,
  onFillGaps,
  onFixConflicts,
  onAutoSchedule,
  onCascadeRecalc,
  onDismissCascade,
  onClearWeek,
  onImportSchedule,
  historyMode,
  onToggleHistoryMode,
  forceAssignMode,
  onToggleForceAssignMode,
  onToggleRowFilter,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  zenMode = false,
  onZenToggle,
}) => {
  const startDate = new Date(weekDates[0]);
  const endDate = new Date(weekDates[6]);
  const todayStr = toLocalISO(new Date());
  const isFutureWeek = weekDates[0] > todayStr;
  const weekRangeLabel = `${startDate.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  })} — ${endDate.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;

  return (
    <div className="card schedule-controls-card border-0 shadow-sm p-2 mb-2 no-print">
      {/* Row 0: period title */}
      <div className="schedule-controls__title mb-2">
        <small className="schedule-controls__title-prefix">Графік на</small>
        <div className="schedule-controls__title-range">{weekRangeLabel}</div>
      </div>

      {/* Row 1: navigation */}
      <div className="d-flex align-items-center gap-1 mb-2 flex-wrap">
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={onPrevWeek}
          title="Попередній тиждень"
        >
          <i className="fas fa-chevron-left"></i>
        </button>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={onNextWeek}
          title="Наступний тиждень"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
        <button className="btn btn-light btn-sm ms-1 schedule-controls__today" onClick={onToday}>
          Сьогодні
        </button>
        <input
          type="date"
          className="form-control form-control-sm ms-1"
          style={{ width: '130px' }}
          onChange={(e) => onDatePick(e.target.value)}
          value={weekDates[0]}
        />
        <div className="flex-grow-1" />
        <button
          className={`btn btn-sm ${zenMode ? 'btn-warning' : 'btn-outline-secondary'}`}
          onClick={onZenToggle}
          title={
            zenMode ? 'Вийти з повноекранного режиму (Esc)' : 'Розгорнути графік на весь екран'
          }
        >
          <i className={`fas ${zenMode ? 'fa-compress' : 'fa-expand'}`}></i>
        </button>
      </div>

      {/* Row 2: history/import + undo/redo */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
        <div className="d-flex flex-column align-items-start gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              className={`btn btn-sm ${historyMode ? 'btn-warning' : 'btn-outline-secondary'}`}
              onClick={onToggleHistoryMode}
              disabled={isFutureWeek}
              title={
                isFutureWeek
                  ? 'Недоступно на майбутніх тижнях'
                  : 'Розблокувати минулі дні для ручного заповнення старого графіка'
              }
            >
              <i className={`fas ${historyMode ? 'fa-lock-open' : 'fa-history'} me-1`}></i>
              {historyMode ? 'Ред. історії ✅' : 'Ред. історії'}
            </button>
            <button
              className={`btn btn-sm ${forceAssignMode ? 'btn-warning' : 'btn-outline-secondary'}`}
              onClick={onToggleForceAssignMode}
              title="Примусове призначення: дозволяє ставити в наряд навіть заблокованих бійців"
            >
              <i className={`fas ${forceAssignMode ? 'fa-unlock' : 'fa-user-lock'} me-1`}></i>
              {forceAssignMode ? 'Форсаж ✅' : 'Форсаж'}
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onImportSchedule}
              disabled={isFutureWeek}
              title={
                isFutureWeek
                  ? 'Недоступно на майбутніх тижнях'
                  : 'Імпорт старого графіка (CSV/текст)'
              }
            >
              <i className="fas fa-file-import me-1"></i>Імпорт
            </button>
          </div>

          {showRowFilters && (
            <div className="d-flex align-items-center gap-2 flex-wrap schedule-row-filter-bar">
              <span className="text-muted small me-1">Фільтр:</span>
              <button
                className={`btn btn-sm py-0 px-2 ${rowFilter === 'available' ? 'btn-success' : 'btn-outline-secondary'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => onToggleRowFilter('available')}
                title="Показати тільки тих, хто доступний до чергування хоча б один день цього тижня"
              >
                <i className="fas fa-user-check me-1"></i>Доступні
              </button>
              <button
                className={`btn btn-sm py-0 px-2 ${rowFilter === 'assigned' ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: '0.75rem' }}
                onClick={() => onToggleRowFilter('assigned')}
                title="Показати тільки тих, у кого є наряд цього тижня"
              >
                <i className="fas fa-clipboard-check me-1"></i>В наряді
              </button>
            </div>
          )}
        </div>

        <div className="d-flex align-items-center gap-1">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onUndo}
            disabled={!canUndo}
            title={canUndo ? `Скасувати: ${undoLabel}` : 'Немає дій для скасування'}
          >
            <i className="fas fa-undo"></i>
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onRedo}
            disabled={!canRedo}
            title={canRedo ? `Повторити: ${redoLabel}` : 'Немає дій для повторення'}
          >
            <i className="fas fa-redo"></i>
          </button>
        </div>
      </div>

      {/* Row 3: conflicts + cascade + generation actions */}
      <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap schedule-controls__footer">
        {criticalConflictsCount > 0 && (
          <button className="btn btn-sm btn-danger shadow" onClick={onFixConflicts}>
            <i className="fas fa-exclamation-triangle me-1"></i>
            ЗАМІНИТИ БЛОКОВАНИХ ({criticalConflictsCount})
          </button>
        )}
        {conflictsCount > 0 && criticalConflictsCount === 0 && (
          <button className="btn btn-sm btn-warning" onClick={onFixConflicts}>
            <i className="fas fa-exclamation-circle me-1"></i>
            Конфлікти ({conflictsCount})
          </button>
        )}
        {cascadeStartDate && shouldShowCascade && (
          <>
            <button className="btn btn-sm btn-outline-info" onClick={onCascadeRecalc}>
              <i className="fas fa-sync-alt me-1"></i>
              Оптимізувати (з {formatDate(cascadeStartDate!)})
            </button>
            <button
              className="btn btn-sm btn-outline-success"
              onClick={onDismissCascade}
              title="Все гаразд, не змінювати автоматичні призначення"
            >
              <i className="fas fa-check me-1"></i>Залишити
            </button>
          </>
        )}

        <div className="flex-grow-1" />

        <button
          className="btn btn-sm btn-outline-danger"
          onClick={onClearWeek}
          title="Очистити всі призначення на цьому тижні"
        >
          <i className="fas fa-trash-alt me-1"></i>Очистити
        </button>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={onFillGaps}
          title="Заповнити тільки порожні дні"
        >
          <i className="fas fa-fill-drip me-1"></i>Заповнити
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={onAutoSchedule}
          title="Автоматична генерація графіка на тиждень"
        >
          <i className="fas fa-magic me-1"></i>Генерація
        </button>
      </div>
    </div>
  );
};

export default ScheduleControls;
