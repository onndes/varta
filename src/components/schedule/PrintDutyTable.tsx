import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatRank, splitFormattedName, compareByRankAndName } from '../../utils/helpers';
import { toAssignedUserIds, isAssignedInEntry } from '../../utils/assignment';
import { getStatusPeriodAtDate } from '../../utils/userStatus';
import { DAY_NAMES_FULL, DEFAULT_PRINT_MAX_ROWS, STATUSES } from '../../utils/constants';
import { toLocalISO } from '../../utils/dateUtils';
import { countUserDaysOfWeek } from '../../services/scheduleService';
import {
  PRINT_DUTY_MARK,
  PRINT_SHOW_STATUS_LABELS,
  PRINT_DOW_HISTORY_WEEKS,
} from '../../utils/printConfig';

/** Символ наряду — змінюється у src/utils/printConfig.ts → PRINT_DUTY_MARK */
const DUTY_MARK = PRINT_DUTY_MARK;
const FOOTER_RESERVED_ROWS = 2;

interface PrintDutyTableProps {
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  users: User[];
  /** Ліміт рядків, що вміщуються на одну сторінку */
  maxRowsPerPage?: number;
  /** Якщо false — друкувати тільки тих, хто призначений на поточний тиждень */
  showAllUsers?: boolean;
  /** Показувати статистику нарядів у комірках */
  showStats?: boolean;
  /** Глибина історії (тижнів) */
  dowHistoryWeeks?: number;
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
): { text: string; className: string; isDuty: boolean } => {
  const isOnDuty = user.id ? toAssignedUserIds(schedule[date]?.userId).includes(user.id) : false;
  if (isOnDuty) {
    return { text: DUTY_MARK, className: ' duty-highlight', isDuty: true };
  }

  const statusPeriod = PRINT_SHOW_STATUS_LABELS ? getStatusPeriodAtDate(user, date) : null;
  if (statusPeriod) {
    return {
      text: STATUSES[statusPeriod.status] || statusPeriod.status,
      className: ' duty-status-highlight',
      isDuty: false,
    };
  }

  // Empty cell — no time shown
  return { text: '', className: '', isDuty: false };
};

/** Compute which past weeks (1..depth) had the same DOW assignment */
const getDowWeeksAgo = (
  date: string,
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  depth: number
): number[] => {
  const result: number[] = [];
  for (let w = 1; w <= depth; w++) {
    const past = new Date(date);
    past.setDate(past.getDate() - w * 7);
    if (isAssignedInEntry(schedule[toLocalISO(past)], userId)) {
      result.push(w);
    }
  }
  return result;
};

// ── Таблиця ───────────────────────────────────────────────────────────

interface TablePageProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  startIndex: number;
  showStats: boolean;
  dowHistoryWeeks: number;
}

const DutyTable: React.FC<TablePageProps> = ({
  users,
  weekDates,
  schedule,
  startIndex,
  showStats,
  dowHistoryWeeks,
}) => {
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
          const dowAssignmentCounts =
            showStats && user.id ? countUserDaysOfWeek(user.id, schedule) : null;

          return (
            <tr key={user.id}>
              <td className="col-num">{startIndex + idx + 1}.</td>
              <td className="col-rank">{formatRank(user.rank)}</td>
              <td className="col-name">{fullName}</td>
              {weekDates.map((date) => {
                const cell = getCellContent(user, date, schedule);
                const d = new Date(date);
                const dayOfWeek = d.getDay();
                const totalDutiesForDow = dowAssignmentCounts
                  ? dowAssignmentCounts[dayOfWeek] || 0
                  : 0;
                const dowWeeksAgo =
                  showStats && user.id
                    ? getDowWeeksAgo(date, user.id, schedule, dowHistoryWeeks)
                    : [];

                return (
                  <td key={date} className={`col-day${cell.className}`}>
                    <div className="print-duty-cell-wrapper">
                      <div className="print-cell-main-row">
                        <span className="print-cell-main-text">{cell.text}</span>
                        {showStats && (
                          <span className="print-cell-badge-top-right">{totalDutiesForDow}</span>
                        )}
                      </div>
                      {showStats && (
                        <div className="print-cell-bottom-row">
                          {dowWeeksAgo.length > 0 && (
                            <span className="print-cell-badge-bottom-right">
                              {dowWeeksAgo.join('/')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
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
  showStats = false,
  dowHistoryWeeks = PRINT_DOW_HISTORY_WEEKS,
  footer = null,
}) => {
  const activeUsers = sortByRank(users.filter((u) => u.isActive));
  const scheduledIds = collectScheduledIds(weekDates, schedule);
  const printableUsers = showAllUsers
    ? activeUsers
    : sortByRank(activeUsers.filter((u) => scheduledIds.has(u.id!)));
  const safeMaxRows = Math.max(1, footer ? maxRowsPerPage - FOOTER_RESERVED_ROWS : maxRowsPerPage);
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
            showStats={showStats}
            dowHistoryWeeks={dowHistoryWeeks}
          />
          {footer && pageIndex === pages.length - 1 ? footer : null}
        </div>
      ))}
    </>
  );
};

export default PrintDutyTable;
