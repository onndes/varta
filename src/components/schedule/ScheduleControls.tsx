import React from 'react';
import { formatDate } from '../../utils/dateUtils';

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
  onClearWeek: () => void;
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
  onClearWeek,
}) => {
  const startDate = new Date(weekDates[0]);
  const endDate = new Date(weekDates[6]);

  return (
    <div className="card border-0 shadow-sm p-3 mb-3 no-print">
      <div
        className="mb-2"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-outline-secondary btn-sm" onClick={onPrevWeek}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={onNextWeek}>
            <i className="fas fa-chevron-right"></i>
          </button>
          <button className="btn btn-light btn-sm ms-2" onClick={onToday}>
            Поточний тиждень
          </button>
          <input
            type="date"
            className="form-control form-control-sm ms-2"
            style={{ width: '130px' }}
            onChange={(e) => onDatePick(e.target.value)}
            value={weekDates[0]}
          />
        </div>
        <div className="fw-bold fs-5 text-center">
          {startDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} —{' '}
          {endDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
        <div />
      </div>

      <div className="d-flex justify-content-end gap-2 flex-wrap">
        {criticalConflictsCount > 0 && (
          <button className="btn btn-sm btn-danger shadow" onClick={onFixConflicts}>
            <i className="fas fa-exclamation-triangle me-2"></i>
            ЗАМІНИТИ БЛОКОВАНИХ ({criticalConflictsCount})
          </button>
        )}
        {conflictsCount > 0 && criticalConflictsCount === 0 && (
          <button className="btn btn-sm btn-warning" onClick={onFixConflicts}>
            <i className="fas fa-exclamation-circle me-2"></i>
            Виправити конфлікти ({conflictsCount})
          </button>
        )}
        {cascadeStartDate && shouldShowCascade && (
          <button className="btn btn-sm btn-outline-info" onClick={onCascadeRecalc}>
            <i className="fas fa-sync-alt me-2"></i>
            Оптимізувати (з {formatDate(cascadeStartDate!)})
          </button>
        )}
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={onClearWeek}
          title="Очистити всі призначення на цьому тижні"
        >
          <i className="fas fa-trash-alt me-2"></i>Очистити тиждень
        </button>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={onFillGaps}
          title="Заповнити тільки порожні дні"
        >
          <i className="fas fa-fill-drip me-2"></i>Заповнити
        </button>
        <button
          className="btn btn-sm btn-primary"
          onClick={onAutoSchedule}
          title="Автоматична генерація графіка на тиждень"
        >
          <i className="fas fa-magic me-2"></i>Генерація
        </button>
      </div>
    </div>
  );
};

export default ScheduleControls;
