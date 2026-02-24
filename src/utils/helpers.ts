// src/utils/helpers.ts
import { RANKS_SHORT, RANK_WEIGHTS } from './constants';
import type { User } from '../types';

// Re-export date utils to maintain backward compatibility
export { toLocalISO, getWeekNumber, getWeekYear, getMondayOfWeek } from './dateUtils';

/** Порівняння двох користувачів за званням (від вищого) та ПІБ (а-я) */
export const compareByRankAndName = (a: User, b: User): number => {
  const rankDiff = (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name, 'uk');
};

/** Тип ключа сортування */
export type SortKey = 'rank' | 'name';
export type SortDir = 'asc' | 'desc';

/** Сортування масиву користувачів за ключем і напрямком */
export const sortUsersBy = (list: User[], key: SortKey, dir: SortDir): User[] => {
  return [...list].sort((a, b) => {
    let cmp: number;
    if (key === 'rank') {
      cmp = (RANK_WEIGHTS[a.rank] || 0) - (RANK_WEIGHTS[b.rank] || 0);
    } else {
      cmp = a.name.localeCompare(b.name, 'uk');
    }
    return dir === 'desc' ? -cmp : cmp;
  });
};

/** Отримати скорочення звання ("Старший солдат" → "ст. сол.") */
export const formatRank = (rank: string) => RANKS_SHORT[rank] || rank;

/**
 * Форматувати ПІБ для друку: «ПРІЗВИЩЕ Ім'я По-батькові»
 * Формат: прізвище — ВЕЛИКИМИ, ініціали — з великої букви
 */
export const formatNameForPrint = (fullName: string) => {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return '';
  const surname = parts[0].toUpperCase();
  const others = parts
    .slice(1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
  return `${surname} ${others}`;
};

/** Розділити ПІБ на окремі поля (прізвище, ім'я, по-батькові) */
export const splitFormattedName = (fullName: string) => {
  if (!fullName) {
    return {
      surname: '',
      firstName: '',
      middleName: '',
    };
  }
  const parts = fullName.trim().split(/\s+/);
  const surname = parts[0]?.toUpperCase() || '';
  const firstName = parts[1]
    ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase()
    : '';
  const middleName = parts[2]
    ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1).toLowerCase()
    : '';

  return {
    surname,
    firstName,
    middleName,
  };
};
