// src/components/schedule/ScheduleTableHeader.tsx — sortable thead for standard schedule table
import React from 'react';
import type { SortKey, SortDir } from '../../utils/helpers';

interface ScheduleTableHeaderProps {
  weekDates: string[];
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onDateClick: (date: string) => void;
}

/** Sortable <thead> for the standard (≤20 users) weekly schedule table. */
export const ScheduleTableHeader: React.FC<ScheduleTableHeaderProps> = ({
  weekDates,
  sortKey,
  sortDir,
  onSort,
  onDateClick,
}) => (
  <thead>
    <tr>
      <th style={{ width: '40px' }}>#</th>
      <th
        className="col-user-screen"
        style={{
          width: '96px',
          minWidth: '96px',
          maxWidth: '96px',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        <span
          className={`badge ${sortKey === 'rank' ? 'bg-primary' : 'bg-light text-secondary border'} fw-semibold text-dark`}
          style={{ cursor: 'pointer', fontSize: '0.7rem' }}
          onClick={() => onSort('rank')}
          title="Сортувати за званням"
        >
          <i className="fas fa-medal me-1" style={{ fontSize: '0.65rem' }}></i>Зв.
          {sortKey === 'rank' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </span>
      </th>
      <th className="col-user-screen" style={{ width: '170px', userSelect: 'none' }}>
        <span
          className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
          style={{ cursor: 'pointer', fontSize: '0.7rem' }}
          onClick={() => onSort('name')}
          title="Сортувати за ПІБ"
        >
          ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </span>
      </th>
      <th className="col-user-print" style={{ width: '120px' }}>
        Військове звання
      </th>
      <th className="col-user-print" style={{ width: '180px' }}>
        Прізвище та ініціали
      </th>
      {weekDates.map((date) => {
        const d = new Date(date);
        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
        const dayMonth = d.toLocaleDateString('uk-UA', {
          weekday: 'short',
          day: 'numeric',
          month: '2-digit',
        });
        return (
          <th
            key={date}
            onClick={() => onDateClick(date)}
            style={{
              width: '10%',
              backgroundColor: isWeekend
                ? 'var(--app-table-weekend-bg, #e9ecef)'
                : 'var(--app-table-header-bg, #f8f9fa)',
              color: 'var(--bs-body-color)',
              cursor: 'pointer',
            }}
            title="Відкрити список осіб на цю дату"
          >
            {dayMonth}
          </th>
        );
      })}
    </tr>
  </thead>
);
