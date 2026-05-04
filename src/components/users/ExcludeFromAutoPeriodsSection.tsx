// src/components/users/ExcludeFromAutoPeriodsSection.tsx
import React, { useState, useMemo } from 'react';
import type { ExcludeFromAutoPeriod } from '../../types';

const formatDate = (iso?: string): string =>
  iso
    ? new Date(iso).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '…';

/** Returns the year from a period's 'from' field, fallback to current year. */
const getPeriodYear = (p: ExcludeFromAutoPeriod): number => {
  const d = p.from || p.to;
  return d ? new Date(d).getFullYear() : new Date().getFullYear();
};

export interface ExcludeFromAutoPeriodsSectionProps {
  periods: ExcludeFromAutoPeriod[];
  onUpdate: (index: number, patch: Partial<ExcludeFromAutoPeriod>) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  todayStr: string;
}

/** Inline edit form for a single ExcludeFromAutoPeriod. */
const ExcludeFromAutoPeriodEditForm: React.FC<{
  period: ExcludeFromAutoPeriod;
  idx: number;
  onUpdate: (index: number, patch: Partial<ExcludeFromAutoPeriod>) => void;
  onRemove: (index: number) => void;
  onDone: () => void;
  showDoneButton?: boolean;
}> = ({ period, idx, onUpdate, onRemove, onDone, showDoneButton = true }) => (
  <div className="border border-warning rounded p-2 bg-light">
    <div className="row g-2 align-items-end">
      <div className="col-md-4">
        <label className="small text-muted">
          Діє з <span className="text-danger">*</span>
        </label>
        <input
          type="date"
          className="form-control form-control-sm"
          value={period.from || ''}
          onChange={(e) => onUpdate(idx, { from: e.target.value })}
        />
      </div>
      <div className={showDoneButton ? 'col-md-4' : 'col-md-5'}>
        <label className="small text-muted">Діє до (порожньо = безстроково)</label>
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
            title="Готово"
            onClick={onDone}
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
        placeholder="Коментар (необов'язково)"
        maxLength={120}
      />
    </div>

    {!period.to && (
      <div className="mt-1 small text-muted">
        <i className="fas fa-info-circle me-1"></i>
        Дата завершення не вказана — виключення діє безстроково.
      </div>
    )}
  </div>
);

/** Read-only collapsed row for history. */
const HistoryPeriodRow: React.FC<{
  period: ExcludeFromAutoPeriod;
  globalIdx: number;
  onEdit: (globalIdx: number) => void;
}> = ({ period, globalIdx, onEdit }) => (
  <div
    className="d-flex align-items-center justify-content-between border rounded px-2 py-1"
    style={{ fontSize: '0.82rem' }}
  >
    <span>
      <i className="fas fa-user-times me-2 text-muted"></i>
      <span className="text-muted">
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

/** Read-only collapsed row for an active/current period. */
const ActivePeriodRow: React.FC<{
  period: ExcludeFromAutoPeriod;
  globalIdx: number;
  todayStr: string;
  onEdit: (globalIdx: number) => void;
}> = ({ period, globalIdx, todayStr, onEdit }) => {
  const isCurrentlyActive = period.from <= todayStr && (!period.to || period.to >= todayStr);
  return (
    <div
      className="d-flex align-items-center justify-content-between border rounded px-2 py-1 border-warning"
      style={{ fontSize: '0.82rem' }}
    >
      <span>
        <i className="fas fa-user-times me-2 text-warning"></i>
        <span>
          {formatDate(period.from)} – {period.to ? formatDate(period.to) : '…'}
        </span>
        {isCurrentlyActive && (
          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.7rem' }}>
            активно
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

/** Full section with current/future periods and collapsible history. */
export const ExcludeFromAutoPeriodsSection: React.FC<ExcludeFromAutoPeriodsSectionProps> = ({
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

  const { currentPeriods, currentIndices, pastPeriods, pastIndices, availableYears } =
    useMemo(() => {
      const cur: ExcludeFromAutoPeriod[] = [];
      const curIdx: number[] = [];
      const past: ExcludeFromAutoPeriod[] = [];
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
        <div className="d-flex justify-content-between align-items-center mb-1">
          <h6 className="card-title mb-0">
            <i className="fas fa-user-times me-2 text-warning"></i>Виключення з автоматичного
            розподілення
          </h6>
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={onAdd}>
            <i className="fas fa-plus me-1"></i>Додати період
          </button>
        </div>
        <div className="small text-muted mb-2">
          Під час цих періодів боєць НЕ бере участь в автоматичному розподілі. Ручне призначення
          можливе завжди.
        </div>

        <div className="d-flex flex-column gap-2">
          {currentPeriods.length === 0 && (
            <div className="small text-muted">Немає активних або запланованих виключень.</div>
          )}

          {currentPeriods.map((period, localIdx) => {
            const globalIdx = currentIndices[localIdx];
            return editingIdx === globalIdx ? (
              <ExcludeFromAutoPeriodEditForm
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
                todayStr={todayStr}
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
                          <ExcludeFromAutoPeriodEditForm
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
