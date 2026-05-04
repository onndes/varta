// src/components/users/BlockedDaysPeriodsSection.tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { BlockedDaysPeriod } from '../../types';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
// ISO weekday indices: 1=Mon … 7=Sun
const WEEKDAY_INDICES = [1, 2, 3, 4, 5, 6, 7];

const formatDate = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

const formatDays = (days: number[]): string => {
  if (days.length === 0) return '—';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d - 1] ?? String(d))
    .join(', ');
};

/** Returns the year from a period's 'from' field, fallback to 'to', fallback to current year. */
const getPeriodYear = (p: BlockedDaysPeriod): number => {
  const d = p.from || p.to;
  return d ? new Date(d).getFullYear() : new Date().getFullYear();
};

export interface BlockedDaysPeriodsSectionProps {
  periods: BlockedDaysPeriod[];
  onUpdate: (index: number, patch: Partial<BlockedDaysPeriod>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  todayStr: string;
}

/** Inline edit form for a single BlockedDaysPeriod. */
const BlockedDaysPeriodEditForm: React.FC<{
  period: BlockedDaysPeriod;
  idx: number;
  onUpdate: (index: number, patch: Partial<BlockedDaysPeriod>) => void;
  onRemove: (index: number) => void;
  onDone: () => void;
  showDoneButton?: boolean;
}> = ({ period, idx, onUpdate, onRemove, onDone, showDoneButton = true }) => {
  const toggleDay = (dow: number) => {
    const next = period.days.includes(dow)
      ? period.days.filter((d) => d !== dow)
      : [...period.days, dow].sort((a, b) => a - b);
    onUpdate(idx, { days: next });
  };

  return (
    <div className="border border-primary rounded p-2 bg-light">
      {/* Weekday toggles */}
      <div className="mb-2">
        <label className="small text-muted d-block mb-1">Дні тижня</label>
        <div className="btn-group w-100" role="group">
          {WEEKDAY_INDICES.map((dow, i) => (
            <button
              key={dow}
              type="button"
              className={`btn btn-sm ${period.days.includes(dow) ? 'btn-danger' : 'btn-outline-secondary'}`}
              onClick={() => toggleDay(dow)}
            >
              {WEEKDAY_LABELS[i]}
            </button>
          ))}
        </div>
        {period.days.length === 0 && (
          <div className="mt-1 alert alert-warning py-1 px-2 small mb-0">
            <i className="fas fa-exclamation-triangle me-1"></i>
            Оберіть хоча б один день.
          </div>
        )}
      </div>

      {/* Date range + action buttons */}
      <div className="row g-2 align-items-end">
        <div className="col-md-4">
          <label className="small text-muted">Діє з</label>
          <input
            type="date"
            className="form-control form-control-sm"
            value={period.from || ''}
            onChange={(e) => onUpdate(idx, { from: e.target.value || undefined })}
          />
        </div>
        <div className={showDoneButton ? 'col-md-4' : 'col-md-5'}>
          <label className="small text-muted">Діє до</label>
          <input
            type="date"
            className="form-control form-control-sm"
            value={period.to || ''}
            onChange={(e) => onUpdate(idx, { to: e.target.value || undefined })}
          />
        </div>
        <div className={showDoneButton ? 'col-md-4 d-flex gap-1' : 'col-md-3 d-flex'}>
          <button
            type="button"
            className={`btn btn-outline-danger btn-sm${showDoneButton ? ' flex-fill' : ' ms-md-auto'}`}
            title="Видалити"
            onClick={() => {
              onRemove(idx);
              onDone();
            }}
          >
            <i className="fas fa-trash"></i>
          </button>
          {showDoneButton && (
            <button
              type="button"
              className="btn btn-primary btn-sm flex-fill"
              title={period.days.length === 0 ? 'Оберіть хоча б один день' : 'Готово'}
              onClick={onDone}
              disabled={period.days.length === 0}
            >
              <i className="fas fa-check"></i>
            </button>
          )}
        </div>
      </div>

      {/* Comment */}
      <div className="mt-2">
        <input
          className="form-control form-control-sm"
          value={period.comment || ''}
          onChange={(e) => onUpdate(idx, { comment: e.target.value || undefined })}
          placeholder="Причина блокування (необов'язково)"
          maxLength={120}
        />
      </div>

      {!period.from && !period.to && (
        <div className="mt-1 small text-muted">
          <i className="fas fa-info-circle me-1"></i>
          Якщо дати не вказано — блокування діє постійно.
        </div>
      )}
    </div>
  );
};

/** Read-only collapsed row for a history period. */
const HistoryPeriodRow: React.FC<{
  period: BlockedDaysPeriod;
  globalIdx: number;
  onEdit: (globalIdx: number) => void;
}> = ({ period, globalIdx, onEdit }) => (
  <div
    className="d-flex align-items-center justify-content-between border rounded px-2 py-1"
    style={{ fontSize: '0.82rem' }}
  >
    <span>
      <i className="fas fa-ban me-2 text-muted"></i>
      <strong>{formatDays(period.days)}</strong>
      <span className="text-muted ms-2">
        {formatDate(period.from)} – {formatDate(period.to)}
      </span>
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

/** Read-only collapsed row for a current/active period. */
const ActivePeriodRow: React.FC<{
  period: BlockedDaysPeriod;
  globalIdx: number;
  onEdit: (globalIdx: number) => void;
}> = ({ period, globalIdx, onEdit }) => (
  <div
    className="d-flex align-items-center justify-content-between border rounded px-2 py-1 border-danger"
    style={{ fontSize: '0.82rem' }}
  >
    <span>
      <i className="fas fa-ban me-2 text-danger"></i>
      <strong>{formatDays(period.days)}</strong>
      <span className="text-muted ms-2">
        {formatDate(period.from)} – {period.to ? formatDate(period.to) : '…'}
      </span>
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

/** Full section: active/future periods (expandable inline edit) + collapsible history. */
export const BlockedDaysPeriodsSection: React.FC<BlockedDaysPeriodsSectionProps> = ({
  periods,
  onUpdate,
  onRemove,
  onAdd,
  todayStr,
}) => {
  const currentYear = new Date().getFullYear();
  const [showHistory, setShowHistory] = useState(false);
  const [historyYear, setHistoryYear] = useState(currentYear);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const prevLengthRef = useRef(periods.length);

  // When the parent adds a new period, auto-open it in edit mode.
  useEffect(() => {
    if (periods.length > prevLengthRef.current) {
      // The new period is always appended at the end; its global index = periods.length - 1.
      setEditingIdx(periods.length - 1);
    }
    prevLengthRef.current = periods.length;
  }, [periods.length]);

  const { currentPeriods, currentIndices, pastPeriods, pastIndices, availableYears } =
    useMemo(() => {
      const cur: BlockedDaysPeriod[] = [];
      const curIdx: number[] = [];
      const past: BlockedDaysPeriod[] = [];
      const pastIdx: number[] = [];
      const years = new Set<number>();

      periods.forEach((p, i) => {
        const isPast = !!p.to && p.to < todayStr;
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
    }, [periods, todayStr, currentYear]);

  const filteredPast = useMemo(
    () =>
      pastPeriods
        .map((p, li) => ({ period: p, globalIdx: pastIndices[li] }))
        .filter(({ period }) => getPeriodYear(period) === historyYear),
    [pastPeriods, pastIndices, historyYear]
  );

  return (
    <div className="card mb-3">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="card-title mb-0">
            <i className="fas fa-ban me-2 text-danger"></i>Блокування днів тижня
          </h6>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={onAdd}>
            <i className="fas fa-plus me-1"></i>Додати період
          </button>
        </div>

        <div className="d-flex flex-column gap-2">
          {currentPeriods.length === 0 && (
            <div className="small text-muted">Немає заблокованих днів.</div>
          )}

          {currentPeriods.map((period, localIdx) => {
            const globalIdx = currentIndices[localIdx];
            return editingIdx === globalIdx ? (
              <BlockedDaysPeriodEditForm
                key={globalIdx}
                period={period}
                idx={globalIdx}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onDone={() => setEditingIdx(null)}
              />
            ) : (
              <ActivePeriodRow
                key={globalIdx}
                period={period}
                globalIdx={globalIdx}
                onEdit={setEditingIdx}
              />
            );
          })}

          {/* History */}
          {pastPeriods.length > 0 && (
            <div className="mt-1">
              <button
                type="button"
                className="btn btn-sm btn-link text-muted p-0"
                onClick={() => {
                  setShowHistory(!showHistory);
                  setEditingIdx(null);
                }}
              >
                <i className={`fas fa-chevron-${showHistory ? 'up' : 'down'} me-1`}></i>
                Історія ({pastPeriods.length})
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
                            setEditingIdx(null);
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
                    <div className="d-flex flex-column gap-1" style={{ opacity: 0.85 }}>
                      {filteredPast.map(({ period, globalIdx }) =>
                        editingIdx === globalIdx ? (
                          <BlockedDaysPeriodEditForm
                            key={globalIdx}
                            period={period}
                            idx={globalIdx}
                            onUpdate={onUpdate}
                            onRemove={onRemove}
                            onDone={() => setEditingIdx(null)}
                          />
                        ) : (
                          <HistoryPeriodRow
                            key={globalIdx}
                            period={period}
                            globalIdx={globalIdx}
                            onEdit={setEditingIdx}
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
