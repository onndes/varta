// src/utils/helpers.ts
import { RANKS_SHORT } from './constants';

// Re-export date utils to maintain backward compatibility
export { toLocalISO, getWeekNumber, getMondayOfWeek } from './dateUtils';

export const formatRank = (rank: string) => RANKS_SHORT[rank] || rank;

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
