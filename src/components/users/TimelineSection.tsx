import React, { useState, useMemo } from 'react';
import type { TimelineEvent } from '../../types';

interface TimelineSectionProps {
  timeline: TimelineEvent[];
}

type FilterKey = 'auto' | 'manual' | 'remove' | 'status' | 'other';

const FILTER_LABELS: Record<FilterKey, string> = {
  auto: 'Авто',
  manual: 'Ручне',
  remove: 'Зняття',
  status: 'Статус',
  other: 'Інше',
};

const classifyEvent = (e: TimelineEvent): FilterKey => {
  const t = e.title.toLowerCase();
  const d = e.details.toLowerCase();

  // Remove / зняття — check first (most specific)
  if (t.includes('зняття')) return 'remove';

  // Auto: schedule entries + audit events
  if (
    t.includes('авто') ||
    t.includes('auto') ||
    t.includes('заповн') ||
    t.includes('згенер') ||
    t.includes('перерахунок') ||
    t.includes('cascade') ||
    d.includes('заповнено') ||
    d.includes('згенеровано') ||
    d.includes('перерахунок')
  )
    return 'auto';

  // Manual: ручне, призначення, замiна, обмiн
  if (
    t.includes('ручне') ||
    t.includes('призначення') ||
    t.includes('замін') ||
    t.includes('обмін')
  )
    return 'manual';

  // Status events
  if (t.includes('відсутн') || t.includes('статус') || t.includes('завершення')) return 'status';

  // Fallback
  return 'other';
};

const TimelineSection: React.FC<TimelineSectionProps> = ({ timeline }) => {
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    auto: false,
    manual: true,
    remove: true,
    status: true,
    other: true,
  });

  const toggleFilter = (key: FilterKey) => setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  const filtered = useMemo(
    () => timeline.filter((e) => filters[classifyEvent(e)]),
    [timeline, filters]
  );

  return (
    <>
      <h6 className="fw-bold mt-4 mb-2">
        <i className="fas fa-stream me-2 text-secondary"></i>Персональний журнал
      </h6>
      <div className="d-flex gap-1 flex-wrap mb-2">
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`btn btn-sm ${filters[key] ? 'btn-outline-dark' : 'btn-outline-secondary text-decoration-line-through'}`}
            onClick={() => toggleFilter(key)}
            style={{ fontSize: '0.7rem' }}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle table-align-center">
          <thead className="table-light">
            <tr>
              <th style={{ width: '110px' }}>Дата</th>
              <th style={{ width: '220px' }}>Подія</th>
              <th>Деталі</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted py-3">
                  Подій не знайдено
                </td>
              </tr>
            ) : (
              filtered.map((e, idx) => (
                <tr key={`${e.date}-${idx}`}>
                  <td className="text-nowrap small">{e.date}</td>
                  <td>
                    <span className={`badge text-bg-${e.tone}`}>{e.title}</span>
                  </td>
                  <td className="small text-muted">{e.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default TimelineSection;
