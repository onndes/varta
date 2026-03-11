// src/components/users/UserStatusPeriodsSection.tsx
import React from 'react';
import type { UserStatusPeriod } from '../../types';
import { STATUSES } from '../../utils/constants';

const STATUS_PERIOD_OPTIONS: Array<{ value: UserStatusPeriod['status']; label: string }> = [
  { value: 'VACATION', label: STATUSES.VACATION },
  { value: 'TRIP', label: STATUSES.TRIP },
  { value: 'SICK', label: STATUSES.SICK },
  { value: 'ABSENT', label: STATUSES.ABSENT },
];

interface StatusPeriodsSectionProps {
  statusPeriods: UserStatusPeriod[];
  onUpdate: (index: number, patch: Partial<UserStatusPeriod>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

/** Editable list of user status periods with date range and rest-day toggles. */
export const StatusPeriodsSection: React.FC<StatusPeriodsSectionProps> = ({
  statusPeriods,
  onUpdate,
  onRemove,
  onAdd,
}) => (
  <div className="row mb-3">
    <div className="col-12">
      <label className="small text-muted">Заплановані статуси (можна кілька)</label>
      <div className="d-flex flex-column gap-2">
        {statusPeriods.length === 0 && (
          <div className="small text-muted">Немає запланованих періодів. Зараз: В строю.</div>
        )}
        {statusPeriods.map((period, idx) => (
          <div key={idx} className="border rounded p-2 bg-light">
            <div className="row g-2 align-items-end">
              <div className="col-md-4">
                <label className="small text-muted">Статус</label>
                <select
                  className="form-select form-select-sm"
                  value={period.status}
                  onChange={(e) =>
                    onUpdate(idx, { status: e.target.value as UserStatusPeriod['status'] })
                  }
                >
                  {STATUS_PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="small text-muted">Дата початку</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={period.from || ''}
                  onChange={(e) => onUpdate(idx, { from: e.target.value || undefined })}
                />
              </div>
              <div className="col-md-3">
                <label className="small text-muted">Дата завершення</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={period.to || ''}
                  onChange={(e) => onUpdate(idx, { to: e.target.value || undefined })}
                />
              </div>
              <div className="col-md-2">
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm w-100"
                  onClick={() => onRemove(idx)}
                >
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>
            <div className="row mt-2">
              <div className="col-md-6">
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={`restBefore-${idx}`}
                    checked={period.restBefore || false}
                    onChange={(e) => onUpdate(idx, { restBefore: e.target.checked || undefined })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`restBefore-${idx}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <i className="fas fa-bed me-2 text-warning"></i>Відпочинок день до події
                  </label>
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id={`restAfter-${idx}`}
                    checked={period.restAfter || false}
                    onChange={(e) => onUpdate(idx, { restAfter: e.target.checked || undefined })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`restAfter-${idx}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <i className="fas fa-bed me-2 text-info"></i>Відпочинок день після події
                  </label>
                </div>
              </div>
            </div>
            {period.status === 'ABSENT' && (
              <div className="mt-2">
                <input
                  className="form-control form-control-sm"
                  value={period.comment || ''}
                  onChange={(e) => onUpdate(idx, { comment: e.target.value || undefined })}
                  placeholder="Коментар (наприклад: Відпросилась)"
                  maxLength={120}
                />
                <small className="text-info d-block mt-1">
                  <i className="fas fa-info-circle me-1"></i>
                  Статус "Відсутній" не впливає на карму / лічильник доступних днів.
                </small>
              </div>
            )}
          </div>
        ))}
        <div>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={onAdd}>
            <i className="fas fa-plus me-1"></i>Додати період
          </button>
        </div>
      </div>
    </div>
  </div>
);
