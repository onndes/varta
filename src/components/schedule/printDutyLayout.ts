// src/components/schedule/printDutyLayout.ts
//
// Розкладка друкованої таблиці чергувань:
//  • «ущільнення» — якщо людей трохи більше за ліміт сторінки, весь друк
//    пропорційно стискається (шрифт + відступи), щоб усі влізли на один аркуш;
//  • балансування сторінок — якщо все одно не вміщується, люди діляться між
//    сторінками рівномірно, щоб на останній не залишався 1–2 рядки.

import type { User, ScheduleEntry } from '../../types';
import { toAssignedUserIds } from '../../utils/assignment';
import { getStatusPeriodAtDate } from '../../utils/userStatus';

/**
 * Наскільки більше рядків можна втиснути на сторінку за рахунок ущільнення.
 * 1.6 → при ліміті 12 на сторінку влізе до 19 осіб (шрифт ×0.625).
 */
export const PRINT_MAX_STRETCH = 1.6;

/** Мінімальна щільність (менше — вже нечитабельно) */
export const PRINT_MIN_DENSITY = 1 / PRINT_MAX_STRETCH;

/** Бажаний мінімум рядків на останній сторінці */
export const PRINT_MIN_LAST_PAGE_ROWS = 3;

/**
 * Чи людина «випадає» з тижня повністю:
 * жодного наряду і кожен день тижня — відпустка / лікарняний / відрядження.
 */
export const isFullyAbsentForWeek = (
  user: User,
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>
): boolean => {
  if (weekDates.length === 0) return false;
  const hasDuty = weekDates.some((date) =>
    user.id ? toAssignedUserIds(schedule[date]?.userId).includes(user.id) : false
  );
  if (hasDuty) return false;
  return weekDates.every((date) => getStatusPeriodAtDate(user, date) !== null);
};

/**
 * Розбити список на сторінки з рівномірним заповненням.
 *
 * Спочатку рахуємо мінімальну кількість сторінок з урахуванням ущільнення,
 * далі ділимо людей порівну — різниця між сторінками не більша за 1 рядок,
 * тому «самотній» рядок на останній сторінці неможливий.
 */
export const balancePages = <T>(list: T[], baseRowsPerPage: number): T[][] => {
  if (list.length === 0) return [[]];

  const base = Math.max(1, baseRowsPerPage);
  const stretched = Math.max(1, Math.floor(base * PRINT_MAX_STRETCH));
  const pageCount = Math.max(1, Math.ceil(list.length / stretched));

  const perPage = Math.floor(list.length / pageCount);
  const remainder = list.length % pageCount;

  const pages: T[][] = [];
  let cursor = 0;
  for (let page = 0; page < pageCount; page++) {
    const size = perPage + (page < remainder ? 1 : 0);
    pages.push(list.slice(cursor, cursor + size));
    cursor += size;
  }
  return pages;
};

/**
 * Коефіцієнт ущільнення для всього документа (щоб усі сторінки виглядали
 * однаково): 1 — звичайний розмір, менше — стиснуто.
 */
export const computeDensity = (pages: unknown[][], baseRowsPerPage: number): number => {
  const base = Math.max(1, baseRowsPerPage);
  const maxRows = pages.reduce((max, page) => Math.max(max, page.length), 0);
  if (maxRows <= base) return 1;
  return Math.max(PRINT_MIN_DENSITY, base / maxRows);
};
