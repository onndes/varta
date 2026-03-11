import * as XLSX from 'xlsx';
import type {
  ScheduleDocumentMode,
  User,
  ScheduleEntry,
  PrintWeekRange,
  Signatories,
} from '../types';
import { toAssignedUserIds } from '../utils/assignment';
import { DAY_NAMES_FULL, DEFAULT_PRINT_MAX_ROWS } from '../utils/constants';
import { compareByRankAndName, formatRank, splitFormattedName } from '../utils/helpers';
import { getCurrentMonday, getWeekDates, getWeekRangeDates, toLocalISO } from '../utils/dateUtils';
import { saveBinaryFile } from '../utils/platform';

const DUTY_TIME = '08.00';

interface ExportScheduleToExcelParams {
  mode: ScheduleDocumentMode;
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  signatories?: Signatories;
  weekDates?: string[];
  weekRange?: PrintWeekRange | null;
  maxRowsPerPage?: number;
}

const formatDate = (iso: string, shortYear = false): string =>
  new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: shortYear ? '2-digit' : 'numeric',
  });

const formatFullName = (name: string): string => {
  const { surname, firstName, middleName } = splitFormattedName(name);
  return [surname, firstName, middleName].filter(Boolean).join(' ');
};

const formatCalendarCell = (user: User): string => {
  const { surname, firstName, middleName } = splitFormattedName(user.name);
  return [formatRank(user.rank), surname, firstName, middleName].filter(Boolean).join('\n');
};

const sanitizeFilenamePart = (value: string): string =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const getWeekDatesOrDefault = (weekDates?: string[]): string[] =>
  weekDates && weekDates.length === 7 ? weekDates : getWeekDates(getCurrentMonday());

const rankLower = (rank?: string): string =>
  rank ? rank.charAt(0).toLowerCase() + rank.slice(1) : '';

const getDefaultSubtitle = (weekDates: string[]): string => {
  const startDate = new Date(weekDates[0]);
  const endDate = new Date(weekDates[weekDates.length - 1]);
  return `добового чергування на ${startDate.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  })} — ${endDate.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
};

const buildMergedRows = (rows: string[][], columnCount: number): XLSX.Range[] =>
  rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.length > 0 && row[0])
    .map(({ index }) => ({
      s: { r: index, c: 0 },
      e: { r: index, c: columnCount - 1 },
    }));

const shiftMerges = (merges: XLSX.Range[], rowOffset: number): XLSX.Range[] =>
  merges.map((merge) => ({
    s: { r: merge.s.r + rowOffset, c: merge.s.c },
    e: { r: merge.e.r + rowOffset, c: merge.e.c },
  }));

const buildScheduleHeaderRows = (
  signatories: Signatories,
  weekDates: string[],
  columnCount: number
): { rows: string[][]; merges: XLSX.Range[] } => {
  const approverLine = [rankLower(signatories.approverRank), signatories.approverName]
    .filter(Boolean)
    .join('  ');
  const rows: string[][] = [
    ['ЗАТВЕРДЖУЮ'],
    [signatories.approverPos || ''],
    [approverLine],
    [],
    [signatories.scheduleTitle || 'ГРАФІК'],
    [signatories.scheduleSubtitle || getDefaultSubtitle(weekDates)],
  ];

  if (signatories.scheduleLine3) {
    rows.push([signatories.scheduleLine3]);
  }
  rows.push([]);

  return {
    rows,
    merges: buildMergedRows(rows, columnCount),
  };
};

const buildScheduleFooterRows = (
  signatories: Signatories,
  columnCount: number
): { rows: string[][]; merges: XLSX.Range[] } => {
  if (signatories.showCreatorFooter === false) {
    return { rows: [], merges: [] };
  }

  const creatorLine = [rankLower(signatories.creatorRank), signatories.creatorName]
    .filter(Boolean)
    .join('  ');
  const rows: string[][] = [
    [],
    ['Графік склав:'],
    [signatories.creatorPos || ''],
    [creatorLine],
  ];

  return {
    rows,
    merges: buildMergedRows(rows, columnCount),
  };
};

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

const buildCalendarSheet = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  weekDates: string[],
  signatories: Signatories
): XLSX.WorkSheet => {
  const columns = weekDates.map((date) => {
    const assignedUsers = toAssignedUserIds(schedule[date]?.userId)
      .map((id) => users.find((user) => user.id === id))
      .filter((user): user is User => Boolean(user));

    return {
      header: `${DAY_NAMES_FULL[new Date(date).getDay()]}\n${formatDate(date, true)}`,
      values: assignedUsers.map(formatCalendarCell),
    };
  });

  const maxRows = Math.max(1, ...columns.map((column) => column.values.length));
  const rows: string[][] = [columns.map((column) => column.header)];

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    rows.push(columns.map((column) => column.values[rowIndex] || ''));
  }

  const { rows: headerRows, merges: headerMerges } = buildScheduleHeaderRows(
    signatories,
    weekDates,
    weekDates.length
  );
  const { rows: footerRows, merges: footerMerges } = buildScheduleFooterRows(
    signatories,
    weekDates.length
  );
  const fullRows = [...headerRows, ...rows, ...footerRows];
  const sheet = XLSX.utils.aoa_to_sheet(fullRows);
  sheet['!cols'] = weekDates.map(() => ({ wch: 22 }));
  sheet['!merges'] = [
    ...headerMerges,
    ...shiftMerges(footerMerges, headerRows.length + rows.length),
  ];
  return sheet;
};

const buildDutyTableSheet = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  weekDates: string[],
  maxRowsPerPage: number,
  signatories: Signatories
): XLSX.WorkSheet => {
  const activeUsers = [...users].filter((user) => user.isActive).sort(compareByRankAndName);
  const scheduledIds = collectScheduledIds(weekDates, schedule);
  const visibleUsers =
    activeUsers.length <= maxRowsPerPage
      ? activeUsers
      : activeUsers.filter((user) => scheduledIds.has(user.id!));

  const rows: string[][] = [
    [
      '№',
      'в/звання',
      "Прізвище, ім'я, по батькові",
      ...weekDates.map(
        (date) => `${formatDate(date)}\n${DAY_NAMES_FULL[new Date(date).getDay()] || ''}`
      ),
    ],
    ...visibleUsers.map((user, index) => [
      `${index + 1}.`,
      formatRank(user.rank),
      formatFullName(user.name),
      ...weekDates.map((date) =>
        user.id && toAssignedUserIds(schedule[date]?.userId).includes(user.id) ? DUTY_TIME : ''
      ),
    ]),
  ];

  const columnCount = rows[0].length;
  const { rows: headerRows, merges: headerMerges } = buildScheduleHeaderRows(
    signatories,
    weekDates,
    columnCount
  );
  const { rows: footerRows, merges: footerMerges } = buildScheduleFooterRows(
    signatories,
    columnCount
  );
  const fullRows = [...headerRows, ...rows, ...footerRows];
  const sheet = XLSX.utils.aoa_to_sheet(fullRows);
  sheet['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 32 }, ...weekDates.map(() => ({ wch: 18 }))];
  sheet['!merges'] = [
    ...headerMerges,
    ...shiftMerges(footerMerges, headerRows.length + rows.length),
  ];
  return sheet;
};

const buildWeekCalendarTableSheet = (
  users: User[],
  schedule: Record<string, ScheduleEntry>,
  weekRange: PrintWeekRange
): XLSX.WorkSheet => {
  const usersById = new Map(users.filter((user) => user.id !== undefined).map((user) => [user.id!, user]));
  const weeks = getWeekRangeDates(weekRange.year, weekRange.fromWeek, weekRange.toWeek);
  const tableRows: string[][] = [
    ['Період', DAY_NAMES_FULL[1], DAY_NAMES_FULL[2], DAY_NAMES_FULL[3], DAY_NAMES_FULL[4], DAY_NAMES_FULL[5], DAY_NAMES_FULL[6], DAY_NAMES_FULL[0]],
    ...weeks.map((dates) => [
      `${formatDate(dates[0], true)} - ${formatDate(dates[6], true)}`,
      ...dates.map((date) =>
        toAssignedUserIds(schedule[date]?.userId)
          .map((id) => usersById.get(id))
          .filter((user): user is User => Boolean(user))
          .map((user) => user.name.trim().split(/\s+/)[0])
          .join(', ')
      ),
    ]),
  ];

  const periodLabel =
    weeks.length > 0
      ? `Графіки за період ${formatDate(weeks[0][0], true)} - ${formatDate(weeks[weeks.length - 1][6], true)}`
      : 'Графіки за період';
  const titleRows: string[][] = [[periodLabel], []];
  const sheet = XLSX.utils.aoa_to_sheet([...titleRows, ...tableRows]);
  sheet['!cols'] = [{ wch: 18 }, ...Array.from({ length: 7 }, () => ({ wch: 18 }))];
  sheet['!merges'] = buildMergedRows(titleRows, 8);
  return sheet;
};

const buildWorkbook = ({
  mode,
  users,
  schedule,
  signatories = {},
  weekDates,
  weekRange,
  maxRowsPerPage = DEFAULT_PRINT_MAX_ROWS,
}: ExportScheduleToExcelParams): { workbook: XLSX.WorkBook; filename: string } => {
  const workbook = XLSX.utils.book_new();
  const resolvedWeekDates = getWeekDatesOrDefault(weekDates);
  const fromDate = resolvedWeekDates[0];
  const toDate = resolvedWeekDates[resolvedWeekDates.length - 1];
  const stamp = toLocalISO(new Date());
  let filename = `varta_schedule_${stamp}.xlsx`;

  if (mode === 'calendar') {
    XLSX.utils.book_append_sheet(
      workbook,
      buildCalendarSheet(users, schedule, resolvedWeekDates, signatories),
      'Графік календар'
    );
    filename = `varta_calendar_${sanitizeFilenamePart(`${fromDate}_${toDate}`)}.xlsx`;
  }

  if (mode === 'duty-table') {
    XLSX.utils.book_append_sheet(
      workbook,
      buildDutyTableSheet(users, schedule, resolvedWeekDates, maxRowsPerPage, signatories),
      'Графік таблиця'
    );
    filename = `varta_table_${sanitizeFilenamePart(`${fromDate}_${toDate}`)}.xlsx`;
  }

  if (mode === 'week-calendar-table') {
    if (!weekRange) {
      throw new Error('Не вибрано діапазон тижнів для експорту в Excel.');
    }
    XLSX.utils.book_append_sheet(
      workbook,
      buildWeekCalendarTableSheet(users, schedule, weekRange),
      'Тижні таблицею'
    );
    filename = `varta_weeks_${weekRange.year}_${weekRange.fromWeek}-${weekRange.toWeek}.xlsx`;
  }

  return { workbook, filename };
};

export const exportScheduleToExcel = async (
  params: ExportScheduleToExcelParams
): Promise<void> => {
  const { workbook, filename } = buildWorkbook(params);
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  await saveBinaryFile(
    data,
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    [{ name: 'Excel', extensions: ['xlsx'] }]
  );
};
