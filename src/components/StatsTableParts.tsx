// src/components/StatsTableParts.tsx — header, row, and legend sub-components for StatsView
import React from 'react';
import { formatRank } from '../utils/helpers';
import type { SortKey, SortDir } from '../utils/helpers';
import type { UserStats, StatsGroupMeta } from '../hooks/useStatsData';
import type { StatsWindowMode } from '../hooks/useStatsData';

// ═══════════════════════════════════════════════════════════════════════════════
// CLASSIC (default) view — full columns, no progress bars
// ═══════════════════════════════════════════════════════════════════════════════

interface ClassicHeaderProps {
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

export const StatsTableHeaderClassic: React.FC<ClassicHeaderProps> = ({
  sortKey,
  sortDir,
  onSort,
}) => (
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
      <th rowSpan={2} style={{ minWidth: '90px' }} className="text-center">
        Днів в графіку
        <br />
        <small className="fw-normal">усього</small>
      </th>
      <th rowSpan={2} style={{ minWidth: '90px' }} className="text-center">
        З них доступних
        <br />
        <small className="fw-normal">для чергувань</small>
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

interface ClassicRowProps {
  u: UserStats;
  onSelect: (u: UserStats) => void;
}

const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

export const StatsTableRowClassic: React.FC<ClassicRowProps> = ({ u, onSelect }) => (
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
    <td className="text-center">{u.totalWindowDays}</td>
    <td className="text-center">
      {u.availableDaysForDuty > 0 ? u.availableDaysForDuty : <span className="text-muted">—</span>}
    </td>
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
      title={`${u.totalComparableDuties} нарядів / ${u.availableDaysForDuty} доступних днів`}
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

export const StatsLegendClassic: React.FC = () => (
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

// ─── StatsTableHeader ─────────────────────────────────────────────────────────

interface StatsTableHeaderProps {
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  showDayBreakdown: boolean;
}

/** Two-row sticky table header with sortable rank/name columns. */
export const StatsTableHeader: React.FC<StatsTableHeaderProps> = ({
  sortKey,
  sortDir,
  onSort,
  showDayBreakdown,
}) => (
  <thead className="table-light small">
    <tr>
      <th
        rowSpan={showDayBreakdown ? 2 : 1}
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
      <th rowSpan={showDayBreakdown ? 2 : 1} style={{ userSelect: 'none' }} className="text-start">
        <span
          className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
          style={{ cursor: 'pointer', fontSize: '0.7rem' }}
          onClick={() => onSort('name')}
          title="Сортувати за ПІБ"
        >
          ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </span>
      </th>
      <th
        rowSpan={showDayBreakdown ? 2 : 1}
        className="text-center"
        style={{ minWidth: '56px' }}
        title="Всього нарядів в обліку (в черзі)"
      >
        Наряди
        <br />
        <small className="fw-normal">всього / черга</small>
      </th>
      {showDayBreakdown && (
        <th colSpan={7} className="text-center border-start">
          По днях (у черзі)
        </th>
      )}
      <th
        rowSpan={showDayBreakdown ? 2 : 1}
        className="text-center border-start"
        style={{ minWidth: '70px' }}
      >
        Навант.
        <br />
        <small className="fw-normal">(бали)</small>
      </th>
      <th rowSpan={showDayBreakdown ? 2 : 1} className="text-center" style={{ minWidth: '60px' }}>
        Карма
      </th>
      <th rowSpan={showDayBreakdown ? 2 : 1} className="text-center" style={{ minWidth: '60px' }}>
        Рейтинг
      </th>
      <th
        rowSpan={showDayBreakdown ? 2 : 1}
        className="text-center border-start"
        style={{ minWidth: '150px' }}
        title="Частота нарядів на добу. Нормалізована: враховуються лише доступні дні (без лікарняних, відряджень, відпусток). Порівнює людей незалежно від дати вступу і тривалості відсутностей."
      >
        Навантаження відносно групи
        <i className="fas fa-circle-info ms-1 text-muted" style={{ fontSize: '0.65rem' }} />
      </th>
    </tr>
    {showDayBreakdown && (
      <tr>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map((d, i) => (
          <th
            key={d}
            className={`text-center${i === 0 ? ' border-start' : ''}`}
            style={{ width: '36px' }}
          >
            {d}
          </th>
        ))}
      </tr>
    )}
  </thead>
);

// ─── StatsTableRow ─────────────────────────────────────────────────────────────

interface StatsTableRowProps {
  u: UserStats;
  onSelect: (u: UserStats) => void;
  groupMeta: StatsGroupMeta;
  showDayBreakdown: boolean;
  windowMode: StatsWindowMode;
}

/** Returns bar color class and deviation label for the duty rate cell. */
function getRateDisplay(
  dutyRate: number,
  avgDutyRate: number,
  maxDutyRate: number
): { barWidth: number; colorClass: string; deviationText: string; deviationClass: string } {
  const barWidth = maxDutyRate > 0 ? Math.round((dutyRate / maxDutyRate) * 100) : 0;
  const deviation = avgDutyRate > 0 ? (dutyRate - avgDutyRate) / avgDutyRate : 0;
  const deviationPct = Math.round(deviation * 100);
  const deviationText =
    deviationPct === 0 ? '≈ середнє' : deviationPct > 0 ? `+${deviationPct}%` : `${deviationPct}%`;

  let colorClass: string;
  let deviationClass: string;
  if (deviation > 0.2) {
    colorClass = 'bg-danger';
    deviationClass = 'text-danger fw-bold';
  } else if (deviation > 0.05) {
    colorClass = 'bg-warning';
    deviationClass = 'text-warning fw-bold';
  } else if (deviation < -0.1) {
    colorClass = 'bg-success';
    deviationClass = 'text-success';
  } else {
    colorClass = 'bg-primary';
    deviationClass = 'text-primary';
  }

  return { barWidth, colorClass, deviationText, deviationClass };
}

/** Single user row in the stats table. */
export const StatsTableRow: React.FC<StatsTableRowProps> = ({
  u,
  onSelect,
  groupMeta,
  showDayBreakdown,
  windowMode,
}) => {
  const hasDutyRate = u.availableDaysForDuty > 0;
  const rateDisplay = hasDutyRate
    ? getRateDisplay(u.dutyRate, groupMeta.avgDutyRate, groupMeta.maxDutyRate)
    : null;

  return (
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
      <td
        className="text-center"
        title={`Всього: ${u.totalAllDuties} / В черзі: ${u.totalComparableDuties}`}
      >
        <span className="fw-bold text-primary">{u.totalAllDuties}</span>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
          {' '}
          / {u.totalComparableDuties}
        </span>
      </td>
      {showDayBreakdown &&
        DAYS_ORDER.map((dayIdx, i) => (
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
        className="text-center border-start"
        title={
          hasDutyRate
            ? `${u.windowDuties} нарядів / ${u.availableDaysForDuty} доступних днів = ${u.dutyRate.toFixed(4)} нар/день\nСереднє по групі: ${groupMeta.avgDutyRate.toFixed(4)} нар/день`
            : 'Немає даних для розрахунку'
        }
      >
        {rateDisplay ? (
          <div style={{ minWidth: '150px' }}>
            <div
              className="progress mb-1"
              style={{ height: '6px', borderRadius: '3px', background: '#e9ecef' }}
            >
              <div
                className={`progress-bar ${rateDisplay.colorClass}`}
                role="progressbar"
                style={{ width: `${rateDisplay.barWidth}%`, borderRadius: '3px' }}
                aria-valuenow={rateDisplay.barWidth}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted" style={{ fontSize: '0.65rem' }}>
                {u.windowDuties} нар / {u.availableDaysForDuty} дн
              </span>
              <span className={rateDisplay.deviationClass} style={{ fontSize: '0.7rem' }}>
                {rateDisplay.deviationText}
              </span>
            </div>
            <div
              className="text-muted text-start"
              style={{ fontSize: '0.6rem', lineHeight: 1.2, marginTop: '1px' }}
            >
              з{' '}
              {new Date(u.trackingFrom).toLocaleDateString('uk-UA', {
                day: '2-digit',
                month: '2-digit',
              })}
              {windowMode !== 'today' && u.windowEnd > new Date().toLocaleDateString('sv') && (
                <span className="text-info">
                  {' →\u00a0'}
                  {new Date(u.windowEnd).toLocaleDateString('uk-UA', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              )}
              {' · '}
              {u.dutyRate.toFixed(3)} нар/день
              {' · '}
              <span style={{ opacity: 0.7 }}>сер. {groupMeta.avgDutyRate.toFixed(3)}</span>
            </div>
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
};

// ─── StatsLegend ──────────────────────────────────────────────────────────────

/** Footer legend explaining each stats column. */
export const StatsLegend: React.FC = () => (
  <div className="p-3 text-muted small bg-light">
    <div className="row">
      <div className="col-md-6">
        <ul className="mb-0">
          <li>
            <strong>Наряди (всього / черга)</strong>: Ліворуч — загальна кількість нарядів за всю
            історію. Праворуч — скільки враховується для поточної авточерги.
          </li>
          <li>
            <strong>Днів в графіку (усього)</strong>: Загальна кількість календарних днів від дати
            початку обліку до кінця вікна. Без жодних знижок.
          </li>
          <li>
            <strong>З них доступних для чергувань</strong>: Дні, коли боєць фактично міг нести
            наряд. Вираховуються відпустки, відрядження, лікарняні, а також дні деактивації та
            виключення з авторозподілу. Саме цей показник є знаменником у колонці «Частота».
          </li>
          <li>
            <strong>Пн–Нд</strong>: Розподіл нарядів по днях тижня (тільки в обліковому періоді).
            Показується при натисканні «Пн–Нд» у заголовку.
          </li>
          <li>
            <strong>Навант. (бали)</strong>: Зважене навантаження — сума ваг за кожен день наряду.
          </li>
          <li>
            <strong>Карма</strong>: Мінус (-) — знявся з наряду за рапортом. Плюс (+) — виручив,
            поставлений вручну на важчий день.
          </li>
        </ul>
      </div>
      <div className="col-md-6">
        <ul className="mb-0">
          <li>
            <strong>Рейтинг</strong>: Навантаження + Карма. Чим менше, тим вища черга на наряд.
          </li>
          <li>
            <strong>Навантаження відносно групи</strong>: Частота нарядів на доступний день
            (лікарняні, відрядження, відпустки виключені). Полоска показує відносне навантаження в
            групі; відсоток — відхилення від середнього. Так можна порівнювати людей незалежно від
            строку служби та причин відсутності.
          </li>
          <li>
            Натисніть на ім'я для детальної статистики, включаючи дату обліку та розбивку по датах.
          </li>
        </ul>
      </div>
    </div>
  </div>
);
