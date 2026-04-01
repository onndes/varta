import * as XLSX from 'xlsx';
import type { User } from '../types';
import { toLocalISO } from '../utils/dateUtils';

export interface ColumnConfig {
  rankCol: string;
  nameCol: string;
  birthdayCol: string;
  startRow: number;
  sheetIndex: number;
}

export type ImportPreset = 'simple' | 'oos' | 'custom';

export const PRESETS: Record<ImportPreset, { label: string; config: ColumnConfig }> = {
  simple: {
    label: 'Простий список (A-Звання, B-ПІБ, C-Дата народження)',
    config: { rankCol: 'A', nameCol: 'B', birthdayCol: 'C', startRow: 2, sheetIndex: 0 },
  },
  oos: {
    label: 'ООС / штатний документ (A-Звання, B-ПІБ, Y-Дата народження)',
    config: { rankCol: 'A', nameCol: 'B', birthdayCol: 'Y', startRow: 6, sheetIndex: 1 },
  },
  custom: {
    label: 'Власні налаштування',
    config: { rankCol: '', nameCol: '', birthdayCol: '', startRow: 1, sheetIndex: 0 },
  },
};

export interface ParsedPersonRow {
  rowNumber: number;
  name: string;
  rank: string;
  birthday?: string;
  skipped: boolean;
  skipReason?: string;
  warning?: string;
}

const DEFAULT_IMPORT_RANK = 'Рядовий';
const SKIP_REASON = 'Порожній рядок або заголовок';
const HEADER_MARKERS = [
  'прізвище',
  'призвище',
  'прізвище (за наявності)',
  "ім'я",
  'по батькові',
  'звання',
  'в/звання',
  'посада',
  'підрозділ',
  'підрозділу',
  'облік',
  'особового складу',
  'особовий склад',
  'список',
  'відомість',
  'таблиця',
  'п/п',
  '№',
  'n/n',
  'дата народження',
  'дата нар',
] as const;

const readArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error('Не вдалося прочитати файл'));
    };
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл'));
    reader.readAsArrayBuffer(file);
  });

const readWorkbook = async (file: File): Promise<XLSX.WorkBook> => {
  const buffer = await readArrayBuffer(file);
  return XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
};

const getSheetByIndex = (workbook: XLSX.WorkBook, sheetIndex: number): XLSX.WorkSheet => {
  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName) {
    throw new Error('Аркуш не знайдено');
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Аркуш не знайдено');
  }

  return sheet;
};

const getSheetRows = (sheet: XLSX.WorkSheet): unknown[][] =>
  XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: undefined,
    raw: true,
  }) as unknown[][];

const normalizeImportName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/['`’ʼ]/g, '');

export function colLetterToIndex(letter: string): number {
  const normalized = letter.trim().toUpperCase();
  if (!normalized) return -1;
  if (!/^[A-Z]+$/.test(normalized)) return -1;

  let result = 0;
  for (const char of normalized) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }

  return result - 1;
}

export function parseBirthday(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return toLocalISO(raw);
  }

  if (typeof raw === 'number' && raw > 1 && raw < 100000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const d = new Date(parsed.y, parsed.m - 1, parsed.d);
        if (!Number.isNaN(d.getTime())) return toLocalISO(d);
      }
    } catch {
      // fallback below
    }
  }

  const s = String(raw).trim();
  if (!s) return undefined;

  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmy) {
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += year < 30 ? 2000 : 1900;
    const d = new Date(year, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  }

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const d = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  }

  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let year = parseInt(mdy[3], 10);
    if (year < 100) year += year < 30 ? 2000 : 1900;
    const d = new Date(year, parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  }

  const dmy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy2) {
    const d = new Date(
      parseInt(dmy2[3], 10),
      parseInt(dmy2[2], 10) - 1,
      parseInt(dmy2[1], 10)
    );
    if (!Number.isNaN(d.getTime())) return toLocalISO(d);
  }

  return undefined;
}

export function isDataRow(rawName: unknown): boolean {
  if (rawName === undefined || rawName === null) return false;

  const s = String(rawName).trim();
  if (s === '') return false;
  if (s.length < 2) return false;

  if (/^[\d\s.,;:\-\/\\()№#]+$/.test(s)) return false;

  const lower = s.toLowerCase();

  if (HEADER_MARKERS.some((marker) => lower.includes(marker))) return false;

  if (/^\d+[\.\)]\s*/.test(s) && s.replace(/^\d+[\.\)]\s*/, '').trim().length < 3) return false;

  if (!/[а-яёіїєґА-ЯЁІЇЄҐ]/.test(s)) return false;

  if (s.length > 80) return false;

  return true;
}

export async function parsePersonnelFromExcel(
  file: File,
  config: ColumnConfig
): Promise<ParsedPersonRow[]> {
  const workbook = await readWorkbook(file);
  const sheet = getSheetByIndex(workbook, config.sheetIndex);
  const rows = getSheetRows(sheet);
  const nameColIdx = colLetterToIndex(config.nameCol);

  if (nameColIdx < 0) {
    throw new Error('Вкажіть колонку ПІБ');
  }

  const rankColIdx = colLetterToIndex(config.rankCol);
  const birthdayColIdx = colLetterToIndex(config.birthdayCol);
  const parsedRows: ParsedPersonRow[] = [];
  const startIndex = Math.max(0, (config.startRow || 1) - 1);

  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    const rowNumber = rowIndex + 1;
    const rawName = row[nameColIdx];

    if (!isDataRow(rawName)) {
      parsedRows.push({
        rowNumber,
        name: rawName == null ? '' : String(rawName).replace(/\s+/g, ' ').trim(),
        rank: DEFAULT_IMPORT_RANK,
        skipped: true,
        skipReason: SKIP_REASON,
      });
      continue;
    }

    const name = String(rawName).replace(/\s+/g, ' ').trim();
    const rawRank = rankColIdx >= 0 ? row[rankColIdx] : undefined;
    let rank = rawRank == null ? DEFAULT_IMPORT_RANK : String(rawRank).trim();
    if (!rank) {
      rank = DEFAULT_IMPORT_RANK;
    }

    let birthday: string | undefined;
    let warning: string | undefined;
    if (birthdayColIdx >= 0 && config.birthdayCol !== '') {
      const rawBirthday = row[birthdayColIdx];
      const hasBirthdayValue =
        rawBirthday !== undefined &&
        rawBirthday !== null &&
        String(rawBirthday).trim() !== '';

      birthday = parseBirthday(rawBirthday);
      if (hasBirthdayValue && !birthday) {
        warning = `Не вдалося розпізнати дату: "${String(rawBirthday)}"`;
      }
    }

    parsedRows.push({
      rowNumber,
      name,
      rank,
      birthday,
      skipped: false,
      warning,
    });
  }

  return parsedRows;
}

export async function getSheetNames(file: File): Promise<string[]> {
  const workbook = await readWorkbook(file);
  return workbook.SheetNames;
}

export async function getSheetPreviewRows(
  file: File,
  sheetIndex: number,
  rowCount = 5,
  colCount = 8
): Promise<string[][]> {
  const workbook = await readWorkbook(file);
  const sheet = getSheetByIndex(workbook, sheetIndex);
  const rows = getSheetRows(sheet);

  return rows.slice(0, rowCount).map((row) =>
    Array.from({ length: colCount }, (_, index) => {
      const cellValue = row[index];
      if (cellValue instanceof Date) {
        return toLocalISO(cellValue);
      }
      return cellValue == null ? '' : String(cellValue);
    })
  );
}

export function parsedRowToUser(row: ParsedPersonRow): Omit<User, 'id'> {
  return {
    name: row.name,
    rank: row.rank || DEFAULT_IMPORT_RANK,
    birthday: row.birthday,
    status: 'ACTIVE',
    isDutyMember: false,
    isActive: false,
    isPersonnel: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    statusPeriods: [],
    restAfterStatus: false,
    dateAddedToAuto: undefined,
  };
}

export function isDuplicateName(importedName: string, existingUsers: User[]): boolean {
  const normImport = normalizeImportName(importedName);
  if (!normImport) return false;

  const importParts = normImport.split(' ').filter(Boolean);

  return existingUsers.some((user) => {
    const normExisting = normalizeImportName(user.name);
    if (!normExisting) return false;
    if (normImport === normExisting) return true;

    const existingParts = normExisting.split(' ').filter(Boolean);
    return (
      importParts.length >= 2 &&
      existingParts.length >= 2 &&
      importParts[0] === existingParts[0] &&
      importParts[1][0] === existingParts[1][0]
    );
  });
}
