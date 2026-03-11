import React, { useMemo, useState } from 'react';
import type { PrintWeekRange } from '../../types';
import { getCurrentMonday, getIsoWeeksInYear, getWeekNumber, getWeekYear } from '../../utils/dateUtils';
import Modal from '../Modal';

interface PrintWeekRangeModalProps {
  show: boolean;
  initialRange?: PrintWeekRange | null;
  onClose: () => void;
  onConfirm: (range: PrintWeekRange) => void;
}

const getDefaultRange = (): PrintWeekRange => {
  const currentMonday = getCurrentMonday();
  const year = getWeekYear(currentMonday);
  const currentWeek = getWeekNumber(currentMonday);
  return { year, fromWeek: currentWeek, toWeek: currentWeek };
};

const PrintWeekRangeModal: React.FC<PrintWeekRangeModalProps> = ({
  show,
  initialRange,
  onClose,
  onConfirm,
}) => {
  const [range, setRange] = useState<PrintWeekRange>(() => initialRange || getDefaultRange());

  const maxWeeks = useMemo(() => getIsoWeeksInYear(range.year), [range.year]);
  const totalWeeks = range.toWeek - range.fromWeek + 1;

  return (
    <Modal show={show} onClose={onClose} title="Друк: тижневий календар" size="modal-md">
      <div className="text-muted small mb-3">
        Оберіть рік і діапазон ISO-тижнів. Наприклад: 2026, з 1 по 13 тиждень.
      </div>

      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label fw-bold">Рік</label>
          <input
            type="number"
            min="2020"
            max="2100"
            className="form-control"
            value={range.year}
            onChange={(e) => {
              const nextYear = Math.max(2020, parseInt(e.target.value, 10) || range.year);
              const nextMaxWeeks = getIsoWeeksInYear(nextYear);
              setRange((prev) => {
                const fromWeek = Math.min(prev.fromWeek, nextMaxWeeks);
                const toWeek = Math.max(fromWeek, Math.min(prev.toWeek, nextMaxWeeks));
                return { year: nextYear, fromWeek, toWeek };
              });
            }}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold">З тижня</label>
          <input
            type="number"
            min="1"
            max={maxWeeks}
            className="form-control"
            value={range.fromWeek}
            onChange={(e) =>
              setRange((prev) => {
                const fromWeek = Math.min(maxWeeks, Math.max(1, parseInt(e.target.value, 10) || 1));
                return {
                  ...prev,
                  fromWeek,
                  toWeek: Math.max(fromWeek, prev.toWeek),
                };
              })
            }
          />
        </div>
        <div className="col-md-4">
          <label className="form-label fw-bold">По тиждень</label>
          <input
            type="number"
            min={range.fromWeek}
            max={maxWeeks}
            className="form-control"
            value={range.toWeek}
            onChange={(e) =>
              setRange((prev) => ({
                ...prev,
                toWeek: Math.min(maxWeeks, Math.max(prev.fromWeek, parseInt(e.target.value, 10) || prev.fromWeek)),
              }))
            }
          />
        </div>
      </div>

      <div className="alert alert-info mt-3 mb-0 py-2 small">
        До друку буде підготовлено <strong>{totalWeeks}</strong>{' '}
        {totalWeeks === 1 ? 'тиждень' : totalWeeks < 5 ? 'тижні' : 'тижнів'}.
      </div>

      <div className="d-flex justify-content-end gap-2 mt-4">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Скасувати
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onConfirm(range)}>
          <i className="fas fa-print me-2"></i>Друкувати
        </button>
      </div>
    </Modal>
  );
};

export default PrintWeekRangeModal;
