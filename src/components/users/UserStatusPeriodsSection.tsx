// src/components/users/UserStatusPeriodsSection.tsx
import React, { useState, useMemo } from 'react';
import type { UserStatusPeriod } from '../../types';
import { STATUSES } from '../../utils/constants';

const STATUS_PERIOD_OPTIONS: Array<{ value: UserStatusPeriod['status']; label: string }> = [
  { value: 'VACATION', label: STATUSES.VACATION },
  { value: 'TRIP', label: STATUSES.TRIP },
  { value: 'SICK', label: STATUSES.SICK },
  { value: 'ABSENT', label: STATUSES.ABSENT },
];

const STATUS_ICONS: Record<UserStatusPeriod['status'], string> = {
  VACATION: 'fa-umbrella-beach',
  TRIP: 'fa-plane',
  SICK: 'fa-hospital',
  ABSENT: 'fa-user-slash',
};

const formatDate = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

interface StatusPeriodsSectionProps {
  statusPeriods: UserStatusPeriod[];
  onUpdate: (index: number, patch: Partial<UserStatusPeriod>) => void;
  onRemove: (index: number) => void;
  onAdd: (initialFrom?: string) => void;
}

/** Full edit form for a single status period. */
const StatusPeriodEditForm: React.FC<{
  period: UserStatusPeriod;
  idx: number;
  onUpdate: (index: number, patch: Partial<UserStatusPeriod>) => void;
  onRemove: (index: number) => void;
  onDone: () => void;
}> = ({ period, idx, onUpdate, onRemove, onDone }) => (
  <div className="border border-primary rounded p-2 bg-light">
    <div className="row g-2 align-items-end">
      <div className="col-md-4">
        <label className="small text-muted">Статус</label>
        <select
          className="form-select form-select-sm"
          value={period.status}
          onChange={(e) => onUpdate(idx, { status: e.target.value as UserStatusPeriod['status'] })}
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
      <div className="col-md-2 d-flex gap-1">
        <button
          type="button"
          className="btn btn-outline-danger btn-sm flex-fill"
          title="Видалити"
          onClick={() => {
            onRemove(idx);
            onDone();
          }}
        >
          <i className="fas fa-trash"></i>
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm flex-fill"
          title="Готово"
          onClick={onDone}
        >
          <i className="fas fa-check"></i>
        </button>
      </div>
    </div>
    {(!period.from || !period.to) && (
      <div className="mt-2 alert alert-warning py-1 px-2 small mb-0">
        <i className="fas fa-exclamation-triangle me-1"></i>
        {!period.from && !period.to
          ? 'Дати не вказано — статус не буде збережено.'
          : !period.to
            ? 'Дата завершення не вказана — статус активний безстроково.'
            : 'Дата початку не вказана — статус активний з початку часів.'}
      </div>
    )}
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
);

/** Read-only summary row for a history period. */
const HistoryPeriodRow: React.FC<{
  period: UserStatusPeriod;
  globalIdx: number;
  onEdit: (globalIdx: number) => void;
}> = ({ period, globalIdx, onEdit }) => {
  const icon = STATUS_ICONS[period.status] || 'fa-circle';
  const label = STATUSES[period.status] || period.status;
  const extras: string[] = [];
  if (period.restBefore) extras.push('відп. до');
  if (period.restAfter) extras.push('відп. після');

  return (
    <div
      className="d-flex align-items-center justify-content-between border rounded px-2 py-1"
      style={{ fontSize: '0.82rem' }}
    >
      <span>
        <i className={`fas ${icon} me-2 text-muted`}></i>
        <strong>{label}</strong>
        <span className="text-muted ms-2">
          {formatDate(period.from)} – {formatDate(period.to)}
        </span>
        {extras.length > 0 && (
          <span className="text-muted ms-2" style={{ fontSize: '0.72rem' }}>
            ({extras.join(', ')})
          </span>
        )}
        {period.comment && (
          <span className="text-muted ms-2" style={{ fontSize: '0.72rem', fontStyle: 'italic' }}>
            {period.comment}
          </span>
        )}
      </span>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm ms-2 py-0 px-1"
        title="Редагувати"
        style={{ fontSize: '0.7rem' }}
        onClick={() => onEdit(globalIdx)}
      >
        <i className="fas fa-pencil-alt"></i>
      </button>
    </div>
  );
};

/** Get the year from a period's 'from' date, fallback to 'to', fallback to current year. */
const getPeriodYear = (p: UserStatusPeriod): number => {
  const d = p.from || p.to;
  return d ? new Date(d).getFullYear() : new Date().getFullYear();
};

/** Full section with current/future periods (always editable) and collapsible history (read-only by default). */
export const StatusPeriodsSection: React.FC<StatusPeriodsSectionProps> = ({
  statusPeriods,
  onUpdate,
  onRemove,
  onAdd,
}) => {
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [showHistory, setShowHistory] = useState(false);
  const [historyYear, setHistoryYear] = useState(currentYear);
  /** globalIdx of the history period currently being edited, or null */
  const [editingHistoryIdx, setEditingHistoryIdx] = useState<number | null>(null);

  const { currentPeriods, currentIndices, pastPeriods, pastIndices, availableYears } =
    useMemo(() => {
      const cur: UserStatusPeriod[] = [];
      const curIdx: number[] = [];
      const past: UserStatusPeriod[] = [];
      const pastIdx: number[] = [];
      const years = new Set<number>();

      statusPeriods.forEach((p, i) => {
        const isPast = p.to && p.to < todayStr;
        if (isPast) {
          past.push(p);
          pastIdx.push(i);
          years.add(getPeriodYear(p));
        } else {
          cur.push(p);
          curIdx.push(i);
        }
      });

      years.add(currentYear);
      return {
        currentPeriods: cur,
        currentIndices: curIdx,
        pastPeriods: past,
        pastIndices: pastIdx,
        availableYears: Array.from(years).sort((a, b) => b - a),
      };
    }, [statusPeriods, todayStr, currentYear]);

  const filteredPast = useMemo(
    () =>
      pastPeriods
        .map((p, li) => ({ period: p, globalIdx: pastIndices[li] }))
        .filter(({ period }) => getPeriodYear(period) === historyYear),
    [pastPeriods, pastIndices, historyYear]
  );

  return (
    <div className="row mb-3">
      <div className="col-12">
        <label className="small text-muted">Заплановані статуси (можна кілька)</label>
        <div className="d-flex flex-column gap-2">
          {/* Current and future periods — always in edit mode */}
          {currentPeriods.length === 0 && (
            <div className="small text-muted">
              Немає активних або запланованих періодів. Зараз: В строю.
            </div>
          )}
          {currentPeriods.map((period, localIdx) => (
            <StatusPeriodEditForm
              key={currentIndices[localIdx]}
              period={period}
              idx={currentIndices[localIdx]}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onDone={() => {
                /* current periods don't need a "done" collapse */
              }}
            />
          ))}

          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => onAdd()}
            >
              <i className="fas fa-plus me-1"></i>Додати період
            </button>
          </div>

          {/* History */}
          {pastPeriods.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                className="btn btn-sm btn-link text-muted p-0"
                onClick={() => {
                  setShowHistory(!showHistory);
                  setEditingHistoryIdx(null);
                }}
              >
                <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'} me-1`}></i>
                Історія статусів ({pastPeriods.length})
              </button>

              {showHistory && (
                <div className="mt-2">
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <span className="small text-muted">Рік:</span>
                    <div className="btn-group btn-group-sm" role="group">
                      {availableYears.map((y) => (
                        <button
                          key={y}
                          type="button"
                          className={`btn btn-sm ${historyYear === y ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => {
                            setHistoryYear(y);
                            setEditingHistoryIdx(null);
                          }}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredPast.length === 0 ? (
                    <div className="small text-muted">Немає записів за {historyYear} рік.</div>
                  ) : (
                    <div className="d-flex flex-column gap-1" style={{ opacity: 0.9 }}>
                      {filteredPast.map(({ period, globalIdx }) =>
                        editingHistoryIdx === globalIdx ? (
                          <StatusPeriodEditForm
                            key={globalIdx}
                            period={period}
                            idx={globalIdx}
                            onUpdate={onUpdate}
                            onRemove={onRemove}
                            onDone={() => setEditingHistoryIdx(null)}
                          />
                        ) : (
                          <HistoryPeriodRow
                            key={globalIdx}
                            period={period}
                            globalIdx={globalIdx}
                            onEdit={setEditingHistoryIdx}
                          />
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
