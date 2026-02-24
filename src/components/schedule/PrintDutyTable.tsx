import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName, compareByRankAndName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';
import { DAY_NAMES_FULL, DEFAULT_PRINT_MAX_ROWS } from '../../utils/constants';

/** Час заступання (відображається у кожній комірці) */
const DUTY_TIME = '08.00';

interface PrintDutyTableProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  /** Ліміт рядків, що вміщуються на одну сторінку */
  maxRowsPerPage?: number;
}

// ── Допоміжні ─────────────────────────────────────────────────────────

/** Сортувати бійців за званням та ПІБ */
const sortByRank = (list: User[]): User[] => [...list].sort(compareByRankAndName);

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

// ── Таблиця ───────────────────────────────────────────────────────────

interface TablePageProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
}

const DutyTable: React.FC<TablePageProps> = ({ users, weekDates, schedule }) => {
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
              <td className="col-num">{idx + 1}.</td>
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
 * Друк: таблиця чергувань (одна сторінка).
 *
 * - Якщо бійців ≤ ліміту — показує всіх;
 * - Якщо бійців > ліміту — показує лише тих, хто в графіку цього тижня.
 */
const PrintDutyTable: React.FC<PrintDutyTableProps> = ({
  weekDates,
  schedule,
  users,
  maxRowsPerPage = DEFAULT_PRINT_MAX_ROWS,
}) => {
  const activeUsers = sortByRank(users.filter((u) => u.isActive));

  // Якщо всі поміщаються — показуємо всіх
  if (activeUsers.length <= maxRowsPerPage) {
    return (
      <div className="print-only print-duty-table-wrapper">
        <DutyTable users={activeUsers} weekDates={weekDates} schedule={schedule} />
      </div>
    );
  }

  // Забагато бійців — показуємо лише тих, хто призначений на цей тиждень
  const scheduledIds = collectScheduledIds(weekDates, schedule);
  const scheduled = sortByRank(activeUsers.filter((u) => scheduledIds.has(u.id!)));

  return (
    <div className="print-only print-duty-table-wrapper">
      <DutyTable users={scheduled} weekDates={weekDates} schedule={schedule} />
    </div>
  );
};

export default PrintDutyTable;
