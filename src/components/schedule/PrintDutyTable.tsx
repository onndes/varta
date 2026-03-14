import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName, compareByRankAndName } from '../../utils/helpers';
import { toAssignedUserIds } from '../../utils/assignment';
import { getStatusPeriodAtDate } from '../../utils/userStatus';
import { DAY_NAMES_FULL, DEFAULT_PRINT_MAX_ROWS, STATUSES } from '../../utils/constants';

/** Час заступання (відображається у кожній комірці) */
const DUTY_TIME = '08.00';
const FOOTER_RESERVED_ROWS = 2;

interface PrintDutyTableProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  /** Ліміт рядків, що вміщуються на одну сторінку */
  maxRowsPerPage?: number;
  /** Якщо false — друкувати тільки тих, хто призначений на поточний тиждень */
  showAllUsers?: boolean;
  /** Блок, який має бути надрукований разом з останньою сторінкою таблиці */
  footer?: React.ReactNode;
}

// ── Допоміжні ─────────────────────────────────────────────────────────

/** Сортувати бійців за званням та ПІБ */
const sortByRank = (list: User[]): User[] => [...list].sort(compareByRankAndName);

const paginateUsers = (list: User[], maxRowsPerPage: number): User[][] => {
  if (list.length === 0) return [[]];

  const pages: User[][] = [];
  for (let index = 0; index < list.length; index += maxRowsPerPage) {
    pages.push(list.slice(index, index + maxRowsPerPage));
  }
  return pages;
};

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

const getCellContent = (
  user: User,
  date: string,
  schedule: Record<string, ScheduleEntry>
): { text: string; className: string } => {
  const isOnDuty = user.id ? toAssignedUserIds(schedule[date]?.userId).includes(user.id) : false;
  if (isOnDuty) {
    return { text: DUTY_TIME, className: ' duty-highlight' };
  }

  const statusPeriod = getStatusPeriodAtDate(user, date);
  if (statusPeriod) {
    return {
      text: STATUSES[statusPeriod.status] || statusPeriod.status,
      className: ' duty-status-highlight',
    };
  }

  return { text: DUTY_TIME, className: '' };
};

// ── Таблиця ───────────────────────────────────────────────────────────

interface TablePageProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  startIndex: number;
}

const DutyTable: React.FC<TablePageProps> = ({ users, weekDates, schedule, startIndex }) => {
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
                const cell = getCellContent(user, date, schedule);
                return (
                  <td key={date} className={`col-day${cell.className}`}>
                    {cell.text}
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
 * Друк: таблиця чергувань з пагінацією.
 *
 * - За замовчуванням друкує всіх активних осіб;
 * - За потреби може друкувати тільки тих, хто призначений на поточний тиждень;
 * - Якщо рядків більше за ліміт, продовжує таблицю на наступних сторінках.
 */
const PrintDutyTable: React.FC<PrintDutyTableProps> = ({
  weekDates,
  schedule,
  users,
  maxRowsPerPage = DEFAULT_PRINT_MAX_ROWS,
  showAllUsers = true,
  footer = null,
}) => {
  const activeUsers = sortByRank(users.filter((u) => u.isActive));
  const scheduledIds = collectScheduledIds(weekDates, schedule);
  const printableUsers = showAllUsers
    ? activeUsers
    : sortByRank(activeUsers.filter((u) => scheduledIds.has(u.id!)));
  const safeMaxRows = Math.max(
    1,
    footer ? maxRowsPerPage - FOOTER_RESERVED_ROWS : maxRowsPerPage
  );
  const pages = paginateUsers(printableUsers, safeMaxRows);

  return (
    <>
      {pages.map((pageUsers, pageIndex) => (
        <div
          key={`print-duty-page-${pageIndex + 1}`}
          className={`print-only print-duty-table-wrapper${pageIndex > 0 ? ' print-overflow-page' : ''}`}
        >
          <DutyTable
            users={pageUsers}
            weekDates={weekDates}
            schedule={schedule}
            startIndex={pageIndex * safeMaxRows}
          />
          {footer && pageIndex === pages.length - 1 ? footer : null}
        </div>
      ))}
    </>
  );
};

export default PrintDutyTable;
