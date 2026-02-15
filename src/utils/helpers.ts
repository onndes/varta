// src/utils/helpers.ts
import { RANKS_SHORT } from './constants';

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

export const toLocalISO = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export const getWeekNumber = (d: Date) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const getMondayOfWeek = (year: number, week: number) => {
  const d = new Date(year, 0, 4);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
};
