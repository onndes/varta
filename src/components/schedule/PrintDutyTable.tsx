import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';
import { RANK_WEIGHTS, DAY_NAMES_FULL } from '../../utils/constants';

/** Максимум бійців на одній сторінці таблиці */
const MAX_ROWS_PER_PAGE = 12;

/** Час заступання (відображається у кожній комірці) */
const DUTY_TIME = '08.00';

interface PrintDutyTableProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  /** Показувати затвердження/підписи (false для overflow-сторінок) */
  showSignatures?: boolean;
}

// ── Допоміжні ─────────────────────────────────────────────────────────

/** Розбити масив на частини по N елементів */
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

/** Сортувати бійців за вагою звання (вище звання — першим) */
const sortByRank = (list: User[]): User[] =>
  [...list].sort((a, b) => (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0));

/** Зібрати ID всіх бійців, призначених на тиждень */
const collectScheduledIds = (
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>
): Set<number> => {
  const ids = new Set<number>();
  for (const date of weekDates) {
    toAssignedUserIds(schedule[date]?.userId).forEach((id) => ids.add(id));
  }
  return ids;
};

// ── Одна сторінка таблиці ─────────────────────────────────────────────

interface TablePageProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  startIndex: number;
}

const DutyTablePage: React.FC<TablePageProps> = ({ users, weekDates, schedule, startIndex }) => {
  return (
    <table className="print-duty-table">
      <thead>
        <tr>
          <th className="col-num">№</th>
          <th className="col-rank">в/звання</th>
          <th className="col-name">Прізвище, ім'я, по батькові</th>
          {weekDates.map((date) => {
            const d = new Date(date);
            const dayName = DAY_NAMES_FULL[d.getDay()] || '';
            return (
              <th key={date} className="col-day">
                {d.toLocaleDateString('uk-UA', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
                <br />
                {dayName}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {users.map((user, idx) => {
          const { surname, firstName, middleName } = splitFormattedName(user.name);
          const fullName = [surname, firstName, middleName].filter(Boolean).join(' ');

          return (
            <tr key={user.id}>
              <td className="col-num">{startIndex + idx + 1}.</td>
              <td className="col-rank">{formatRank(user.rank)}</td>
              <td className="col-name">{fullName}</td>
              {weekDates.map((date) => {
                const isOnDuty = user.id
                  ? toAssignedUserIds(schedule[date]?.userId).includes(user.id)
                  : false;
                return (
                  <td key={date} className={`col-day${isOnDuty ? ' duty-highlight' : ''}`}>
                    {DUTY_TIME}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// ── Головний компонент ────────────────────────────────────────────────

/**
 * Друк: таблиця чергувань (як офіційний документ ЗСУ).
 *
 * Якщо бійців > MAX_ROWS_PER_PAGE:
 * - перша сторінка = тільки ті, хто в графіку цього тижня
 * - решта — на окремих сторінках без затверджень
 */
const PrintDutyTable: React.FC<PrintDutyTableProps> = ({ weekDates, schedule, users }) => {
  const activeUsers = sortByRank(users.filter((u) => u.isActive));
  const scheduledIds = collectScheduledIds(weekDates, schedule);

  // Якщо всі поміщаються — одна таблиця
  if (activeUsers.length <= MAX_ROWS_PER_PAGE) {
    return (
      <div className="print-only print-duty-table-wrapper">
        <DutyTablePage
          users={activeUsers}
          weekDates={weekDates}
          schedule={schedule}
          startIndex={0}
        />
      </div>
    );
  }

  // Розділити: перша сторінка = ті хто в графіку, решта — overflow
  const scheduled = sortByRank(activeUsers.filter((u) => scheduledIds.has(u.id!)));
  const remaining = sortByRank(activeUsers.filter((u) => !scheduledIds.has(u.id!)));
  const overflowPages = chunkArray(remaining, MAX_ROWS_PER_PAGE);

  return (
    <div className="print-only print-duty-table-wrapper">
      {/* Перша сторінка: бійці з графіку */}
      <DutyTablePage users={scheduled} weekDates={weekDates} schedule={schedule} startIndex={0} />

      {/* Overflow: решта бійців на окремих сторінках (без підписів) */}
      {overflowPages.map((chunk, pageIdx) => (
        <div key={pageIdx} className="print-overflow-page">
          <DutyTablePage
            users={chunk}
            weekDates={weekDates}
            schedule={schedule}
            startIndex={scheduled.length + pageIdx * MAX_ROWS_PER_PAGE}
          />
        </div>
      ))}
    </div>
  );
};

export default PrintDutyTable;
