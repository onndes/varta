import React from 'react';
import { formatDate, toLocalISO } from '../../utils/dateUtils';

interface ScheduleControlsProps {
  weekDates: string[];
  cascadeStartDate: string | null;
  shouldShowCascade: boolean;
  conflictsCount: number;
  criticalConflictsCount: number;
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
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
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
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}) => {
  const startDate = new Date(weekDates[0]);
  const endDate = new Date(weekDates[6]);
  const todayStr = toLocalISO(new Date());
  const isFutureWeek = weekDates[0] > todayStr;

  return (
    <div className="card border-0 shadow-sm p-2 mb-2 no-print">
      {/* Row 0: period title */}
      <div className="text-center mb-2">
        <span className="fw-bold" style={{ fontSize: '1.05rem' }}>
          {startDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} —{' '}
          {endDate.toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>

      {/* Row 1: navigation + undo/redo */}
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
        {/* Left: nav arrows + today + date picker */}
        <div className="d-flex align-items-center gap-1">
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
          <button className="btn btn-light btn-sm ms-1" onClick={onToday}>
            Сьогодні
          </button>
          <input
            type="date"
            className="form-control form-control-sm ms-1"
            style={{ width: '130px' }}
            onChange={(e) => onDatePick(e.target.value)}
            value={weekDates[0]}
          />
        </div>

        {/* Right: undo / redo */}
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

      {/* Row 2: history/import */}
      {!isFutureWeek && (
        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <button
            className={`btn btn-sm ${historyMode ? 'btn-warning' : 'btn-outline-secondary'}`}
            onClick={onToggleHistoryMode}
            title="Розблокувати минулі дні для ручного заповнення старого графіка"
          >
            <i className={`fas ${historyMode ? 'fa-lock-open' : 'fa-history'} me-1`}></i>
            {historyMode ? 'Ред. історії ✅' : 'Ред. історії'}
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onImportSchedule}
            title="Імпорт старого графіка (CSV/текст)"
          >
            <i className="fas fa-file-import me-1"></i>Імпорт
          </button>
        </div>
      )}

      {/* Row 3: conflicts + cascade + generation actions */}
      <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
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
