import React from 'react';
import type { User, ScheduleEntry, Signatories } from '../../types';
import { formatRank, splitFormattedName, compareByRankAndName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';
import { STATUSES, DAY_SHORT_NAMES } from '../../utils/constants';
import { getUserStatusPeriods } from '../../utils/userStatus';

interface PrintStatusListProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  weekDates: string[];
  signatories: Signatories;
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

/** Перетворити ISO-індекс дня (1=Пн..7=Нд) → JS-індекс (0=Нд..6=Сб) */
const isoToJsDayIndex = (iso: number): number => (iso === 7 ? 0 : iso);

/** Форматувати заблоковані дні у скорочений вигляд: «ПН, СР, ПТ» */
const formatBlockedDays = (days: number[]): string =>
  days.map((d) => DAY_SHORT_NAMES[isoToJsDayIndex(d)] || `${d}`).join(', ');

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

/** Зібрати бійців із заблокованими днями (навіть якщо статус ACTIVE) */
const collectBlockedRows = (users: User[]): StatusRow[] =>
  users
    .filter((u) => u.isActive && u.blockedDays && u.blockedDays.length > 0)
    .sort(compareByRankAndName)
    .map((user) => ({
      user,
      reason: `Блок: ${formatBlockedDays(user.blockedDays!)}`,
      from: formatDate(user.blockedDaysFrom),
      to: formatDate(user.blockedDaysTo),
      comment: [user.note, user.blockedDaysComment].filter(Boolean).join('. '),
    }));

// ── Футер з підписом ──────────────────────────────────────────────────

/** Підпис «Довідку склав:» — аналогічно до PrintFooter */
const ReportCreatorFooter: React.FC<{ signatories: Signatories }> = ({ signatories }) => {
  const rankLower = (r: string) => (r ? r.charAt(0).toLowerCase() + r.slice(1) : '');
  const hasFilled =
    signatories.reportCreatorPos || signatories.reportCreatorRank || signatories.reportCreatorName;

  return (
    <div className="print-status-footer">
      <div className="status-footer-label">Довідку склав:</div>
      {hasFilled ? (
        <>
          {signatories.reportCreatorPos && (
            <div className="creator-pos">{signatories.reportCreatorPos}</div>
          )}
          <div className="creator-filled-row">
            {signatories.reportCreatorRank ? (
              <span>{rankLower(signatories.reportCreatorRank)}&nbsp;&nbsp;</span>
            ) : null}
            <span style={{ width: '80px', display: 'inline-block' }}></span>
            {signatories.reportCreatorName ? (
              <span>&nbsp;&nbsp;{signatories.reportCreatorName}</span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="creator-line-empty"></div>
          <div className="creator-row">
            <div className="creator-line-empty"></div>
          </div>
        </>
      )}
    </div>
  );
};

// ── Компонент ─────────────────────────────────────────────────────────

/**
 * Друк: довідка по особовому складу.
 *
 * Показує:
 * - Бійців з не-активними статусами (відпустка, лікування тощо)
 * - Бійців із заблокованими днями (з причиною)
 * - Інформацію про заміни/обміни на поточний тиждень
 */
const PrintStatusList: React.FC<PrintStatusListProps> = ({
  users,
  schedule,
  weekDates,
  signatories,
}) => {
  const usersMap = new Map(users.map((u) => [u.id!, u]));

  // Бійці з не-активними статусами (всі статус-періоди)
  const statusRows: StatusRow[] = users
    .sort(compareByRankAndName)
    .flatMap((user) =>
      getUserStatusPeriods(user).map((period) => ({
        user,
        reason: STATUSES[period.status] || period.status,
        from: formatDate(period.from),
        to: formatDate(period.to),
        comment: [user.note, period.comment].filter(Boolean).join('. '),
      }))
    );

  // Бійці із заблокованими днями
  const blockedRows = collectBlockedRows(users);

  // Заміни/обміни за тиждень
  const swapRows = collectSwaps(weekDates, schedule, usersMap);

  const allRows = [...statusRows, ...blockedRows, ...swapRows];

  const todayFormatted = new Date().toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const activeCount = users.filter((u) => u.status === 'ACTIVE' && u.isActive).length;
  const excludedCount = users.filter((u) => !u.isActive).length;
  const blockedCount = blockedRows.length;

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
        {blockedCount > 0 && (
          <p>
            Із заблокованими днями: <strong>{blockedCount}</strong>
          </p>
        )}
        {excludedCount > 0 && (
          <p>
            Виключений зі списків: <strong>{excludedCount}</strong>
          </p>
        )}
      </div>

      {/* Підпис — «Довідку склав:» (два рядки, як у графіку) */}
      <ReportCreatorFooter signatories={signatories} />
    </div>
  );
};

export default PrintStatusList;
