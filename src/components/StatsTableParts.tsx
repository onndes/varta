// src/components/StatsTableParts.tsx — header, row, and legend sub-components for StatsView
import React from 'react';
import { formatRank } from '../utils/helpers';
import type { SortKey, SortDir } from '../utils/helpers';
import type { UserStats } from '../hooks/useStatsData';

// ─── StatsTableHeader ─────────────────────────────────────────────────────────

interface StatsTableHeaderProps {
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

/** Two-row sticky table header with sortable rank/name columns. */
export const StatsTableHeader: React.FC<StatsTableHeaderProps> = ({ sortKey, sortDir, onSort }) => (
  <thead className="table-light small">
    <tr>
      <th
        rowSpan={2}
        style={{ userSelect: 'none', minWidth: '70px', whiteSpace: 'nowrap' }}
        className="text-start"
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
      <th rowSpan={2} style={{ userSelect: 'none' }} className="text-start">
        <span
          className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
          style={{ cursor: 'pointer', fontSize: '0.7rem' }}
          onClick={() => onSort('name')}
          title="Сортувати за ПІБ"
        >
          ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </span>
      </th>
      <th rowSpan={2} style={{ minWidth: '72px' }}>
        Чергувань
        <br />
        <small className="fw-normal">всього</small>
      </th>
      <th rowSpan={2} style={{ minWidth: '80px' }} className="text-center">
        В черзі
      </th>
      <th rowSpan={2} style={{ minWidth: '90px' }} className="text-center">
        Днів в графіку
        <br />
        <small className="fw-normal">в обліку</small>
      </th>
      <th colSpan={7} className="text-center border-start">
        По днях (у черзі)
      </th>
      <th rowSpan={2} className="text-center border-start" style={{ minWidth: '90px' }}>
        Навантаження
        <br />
        (бали)
      </th>
      <th rowSpan={2} className="text-center" style={{ minWidth: '70px' }}>
        Карма
      </th>
      <th rowSpan={2} className="text-center" style={{ minWidth: '70px' }}>
        Рейтинг
      </th>
      <th rowSpan={2} className="text-center border-start" style={{ minWidth: '80px' }}>
        Частота
        <br />
        <small className="fw-normal">(нар/день)</small>
      </th>
      <th rowSpan={2} className="text-center border-start" style={{ minWidth: '85px' }}>
        З дати
        <i
          className="fas fa-circle-info ms-1 text-muted"
          title="Базова дата участі в авточерзі. Після повернення з відпустки/відрядження/лікарняного облік не скидається: порівняння враховує доступність у періоді."
        />
        <br />
        <small className="fw-normal">(учет)</small>
      </th>
    </tr>
    <tr>
      {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d, i) => (
        <th
          key={d}
          className={`text-center${i === 0 ? ' border-start' : ''}`}
          style={{ width: '40px' }}
        >
          {d}
        </th>
      ))}
    </tr>
  </thead>
);

// ─── StatsTableRow ─────────────────────────────────────────────────────────────

interface StatsTableRowProps {
  u: UserStats;
  onSelect: (u: UserStats) => void;
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

/** Single user row in the stats table. */
export const StatsTableRow: React.FC<StatsTableRowProps> = ({ u, onSelect }) => (
  <tr className={!u.isActive ? 'user-row-inactive' : ''}>
    <td className="text-start">
      <small
        className="text-muted text-uppercase"
        style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
      >
        {formatRank(u.rank)}
      </small>
    </td>
    <td className="text-start">
      <button
        type="button"
        className="btn btn-link p-0 text-decoration-none text-start"
        onClick={() => onSelect(u)}
      >
        <div
          className="fw-bold text-uppercase"
          style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
        >
          {u.name.trim().split(/\s+/)[0]}
        </div>
        {u.name.trim().split(/\s+/).length > 1 && (
          <div
            className="text-muted"
            style={{ fontSize: '0.73rem', opacity: 0.7, lineHeight: 1.2 }}
          >
            {u.name.trim().split(/\s+/).slice(1).join(' ')}
          </div>
        )}
      </button>
    </td>
    <td className="text-center fw-bold text-primary">{u.totalAllDuties}</td>
    <td className="text-center fw-bold">{u.totalComparableDuties}</td>
    <td className="text-center">{u.availableDaysForDuty}</td>
    {DAYS_ORDER.map((dayIdx, i) => (
      <td key={dayIdx} className={`text-center small${i === 0 ? ' border-start' : ''}`}>
        {u.dayCountComparable[dayIdx] || 0}
      </td>
    ))}
    <td className="text-center border-start">{u.comparableLoad.toFixed(1)}</td>
    <td
      className={
        u.balance < 0 ? 'text-danger fw-bold' : u.balance > 0 ? 'text-success fw-bold' : ''
      }
    >
      {u.balance > 0 ? `+${u.balance}` : u.balance}
    </td>
    <td className="text-center fw-bold">{u.effectiveComparable.toFixed(1)}</td>
    <td
      className="text-center border-start fw-bold"
      title={`${u.totalComparableDuties} нарядів / ${u.availableDaysForDuty} днів`}
    >
      {u.availableDaysForDuty > 0 ? (
        <span
          className={
            u.dutyRate > 0.15 ? 'text-danger' : u.dutyRate > 0.08 ? 'text-warning' : 'text-success'
          }
        >
          {u.dutyRate.toFixed(3)}
        </span>
      ) : (
        <span className="text-muted">—</span>
      )}
    </td>
    <td className="text-center border-start small">
      <div className="text-muted">
        {new Date(u.trackingFrom).toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })}
      </div>
      <div className="fw-bold">{u.totalComparableDuties}</div>
    </td>
  </tr>
);

// ─── StatsLegend ──────────────────────────────────────────────────────────────

/** Footer legend explaining each stats column. */
export const StatsLegend: React.FC = () => (
  <div className="p-3 text-muted small bg-light">
    <div className="row">
      <div className="col-md-6">
        <ul className="mb-0">
          <li>
            <strong>Чергувань всього</strong>: Загальна кількість нарядів за всю історію в базі.
          </li>
          <li>
            <strong>В черзі</strong>: Скільки нарядів враховується саме для поточної авточерги.
          </li>
          <li>
            <strong>Днів в графіку</strong>: Кількість календарних днів від дати включення в облік
            до сьогодні (мінус відпустка/відрядження/лікарняний). Це період перебування в обліку, а
            не кількість призначень.
          </li>
          <li>
            <strong>Пн-Нд</strong>: Розподіл нарядів по дням тижня тільки в межах поточного
            облікового періоду.
          </li>
        </ul>
      </div>
      <div className="col-md-6">
        <ul className="mb-0">
          <li>
            <strong>Карма</strong>: Мінус (-) коли знявся з наряду за рапортом (винен системі). Плюс
            (+) коли виручив (поставлений вручну на важчий день).
          </li>
          <li>
            <strong>Рейтинг</strong>: Навантаження + Карма. Чим менше, тим вища черга на наряд.
          </li>
          <li>
            <strong>Частота (нар/день)</strong>: Кількість нарядів поділена на кількість днів у
            черзі. Чим менше значення, тим рідше особа чергує відносно свого часу в обліку.
            Використовується для порівняння чесності розподілу між особами, які чергують різний
            період часу.
          </li>
          <li>
            <strong>З дати</strong>: Дата, з якої система веде порівняння для авточерги. Це не
            перезапуск "з нуля" після повернення, а базова дата участі в авточерзі.
          </li>
        </ul>
      </div>
    </div>
  </div>
);
