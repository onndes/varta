import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';
import { RANK_WEIGHTS, STATUSES } from '../../utils/constants';

interface PrintStatusListProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  weekDates: string[];
}

/** Інформація про статус/подію бійця */
interface StatusRow {
  user: User;
  reason: string;
  from: string;
  to: string;
  comment: string;
}

// ── Допоміжні ─────────────────────────────────────────────────────────

const formatDate = (d?: string): string =>
  d
    ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

const formatFullName = (name: string): string => {
  const { surname, firstName, middleName } = splitFormattedName(name);
  return [surname, firstName, middleName].filter(Boolean).join(' ');
};

/** Зібрати замін/обмінів з розкладу */
const collectSwaps = (
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>,
  usersMap: Map<number, User>
): StatusRow[] => {
  const rows: StatusRow[] = [];
  const seen = new Set<string>();

  for (const date of weekDates) {
    const entry = schedule[date];
    if (!entry?.userId || (entry.type !== 'swap' && entry.type !== 'replace')) continue;

    const ids = toAssignedUserIds(entry.userId);
    for (const id of ids) {
      const key = `${entry.type}-${id}-${date}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const user = usersMap.get(id);
      if (!user) continue;

      const label = entry.type === 'swap' ? 'Обмін' : 'Заміна';
      rows.push({
        user,
        reason: label,
        from: formatDate(date),
        to: formatDate(date),
        comment: '',
      });
    }
  }

  return rows;
};

// ── Компонент ─────────────────────────────────────────────────────────

/**
 * Друк: довідка по особовому складу.
 *
 * Показує бійців з не-активними статусами (відпустка, лікування тощо)
 * та інформацію про заміни/обміни на поточний тиждень.
 */
const PrintStatusList: React.FC<PrintStatusListProps> = ({ users, schedule, weekDates }) => {
  const usersMap = new Map(users.map((u) => [u.id!, u]));

  // Бійці з не-активними статусами
  const statusRows: StatusRow[] = users
    .filter((u) => u.status !== 'ACTIVE')
    .sort((a, b) => (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0))
    .map((user) => ({
      user,
      reason: STATUSES[user.status] || user.status,
      from: formatDate(user.statusFrom),
      to: formatDate(user.statusTo),
      comment: user.statusComment || '',
    }));

  // Заміни/обміни за тиждень
  const swapRows = collectSwaps(weekDates, schedule, usersMap);

  const allRows = [...statusRows, ...swapRows];

  const todayFormatted = new Date().toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const activeCount = users.filter((u) => u.status === 'ACTIVE' && u.isActive).length;
  const excludedCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="print-only print-status-list-wrapper">
      <h3 className="print-status-title">Довідка по особовому складу</h3>
      <p className="print-status-date">Станом на {todayFormatted}</p>

      {allRows.length === 0 ? (
        <p className="print-status-empty">Всі бійці в строю. Змін та обмінів немає.</p>
      ) : (
        <table className="print-status-table">
          <thead>
            <tr>
              <th className="col-num">№</th>
              <th className="col-rank">Звання</th>
              <th className="col-name">Прізвище, ім'я, по батькові</th>
              <th className="col-reason">Статус / Подія</th>
              <th className="col-date">Від</th>
              <th className="col-date">До</th>
              <th className="col-comment">Примітка</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, idx) => (
              <tr key={`${row.user.id}-${row.reason}-${idx}`}>
                <td className="col-num">{idx + 1}.</td>
                <td className="col-rank">{formatRank(row.user.rank)}</td>
                <td className="col-name">{formatFullName(row.user.name)}</td>
                <td className="col-reason">{row.reason}</td>
                <td className="col-date">{row.from}</td>
                <td className="col-date">{row.to}</td>
                <td className="col-comment">{row.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Підсумок по складу */}
      <div className="print-status-summary">
        <p>
          Всього особового складу: <strong>{users.length}</strong>
        </p>
        <p>
          В строю: <strong>{activeCount}</strong>
        </p>
        {statusRows.length > 0 && (
          <p>
            Відсутні: <strong>{statusRows.length}</strong>
          </p>
        )}
        {excludedCount > 0 && (
          <p>
            Виключений зі списків: <strong>{excludedCount}</strong>
          </p>
        )}
      </div>

      {/* Підпис — «Довідку склав:» */}
      <div className="print-status-footer">
        <div className="status-footer-label">Довідку склав:</div>
        <div className="status-footer-line"></div>
        <div className="status-footer-row">
          <span className="status-footer-hint">(посада)</span>
          <span className="status-footer-hint">(звання)</span>
          <span className="status-footer-hint">(підпис)</span>
          <span className="status-footer-hint">(ініціали, прізвище)</span>
        </div>
      </div>
    </div>
  );
};

export default PrintStatusList;
