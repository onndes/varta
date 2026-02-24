// src/services/importScheduleService.ts

import type { ScheduleEntry, User } from '../types';
import { bulkSaveSchedule, getScheduleByDate } from './scheduleService';

/** One parsed row from user input */
export interface ParsedRow {
  line: number;
  raw: string;
  date: string | null; // ISO date or null if unparseable
  name: string;
  matchedUser: User | null;
  error?: string;
}

/** Summary returned after import */
export interface ImportResult {
  imported: number;
  skippedExisting: number;
  skippedErrors: number;
}

// ── Parsing helpers ───────────────────────────────────────────────────

/**
 * Parse a date string in various formats to ISO YYYY-MM-DD.
 * Supports: dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, yyyy/mm/dd
 */
export const parseFlexDate = (raw: string): string | null => {
  const trimmed = raw.trim();

  // ISO: 2025-03-15
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00');
    if (!isNaN(d.getTime())) return trimmed;
  }

  // dd.mm.yyyy  dd/mm/yyyy  dd-mm-yyyy
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime())) return iso;
  }

  // yyyy/mm/dd
  const ymdSlash = trimmed.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (ymdSlash) {
    const [, yyyy, mm, dd] = ymdSlash;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00');
    if (!isNaN(d.getTime())) return iso;
  }

  return null;
};

/**
 * Normalise a name for fuzzy matching: lowercase, collapse whitespace, strip rank prefixes.
 */
const normaliseName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Find a user by name (case-insensitive, trims whitespace).
 * First tries exact match, then substring match.
 */
export const matchUser = (rawName: string, users: User[]): User | null => {
  const needle = normaliseName(rawName);
  if (!needle) return null;

  // Exact match
  const exact = users.find((u) => normaliseName(u.name) === needle);
  if (exact) return exact;

  // Substring match (user name contains the needle or vice-versa)
  const partial = users.find(
    (u) => normaliseName(u.name).includes(needle) || needle.includes(normaliseName(u.name))
  );
  return partial ?? null;
};

// ── Parsing ───────────────────────────────────────────────────────────

/**
 * Parse multiline text into structured rows.
 * Each line is expected as: `date<separator>name`
 * Separator: tab, semicolon, comma (only first occurrence for comma to allow names with commas).
 * Blank lines and comment lines (starting with #) are skipped.
 */
export const parseScheduleText = (text: string, users: User[]): ParsedRow[] => {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;

    // Split by tab, semicolon, or first comma
    let parts: string[];
    if (raw.includes('\t')) {
      parts = raw.split('\t').map((s) => s.trim());
    } else if (raw.includes(';')) {
      parts = raw.split(';').map((s) => s.trim());
    } else {
      const commaIdx = raw.indexOf(',');
      if (commaIdx > 0) {
        parts = [raw.slice(0, commaIdx).trim(), raw.slice(commaIdx + 1).trim()];
      } else {
        // Try splitting by whitespace (first token = date, rest = name)
        const spaceMatch = raw.match(/^(\S+)\s+(.+)$/);
        if (spaceMatch) {
          parts = [spaceMatch[1], spaceMatch[2]];
        } else {
          rows.push({
            line: i + 1,
            raw,
            date: null,
            name: '',
            matchedUser: null,
            error: 'Невідомий формат рядка',
          });
          continue;
        }
      }
    }

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      rows.push({
        line: i + 1,
        raw,
        date: null,
        name: '',
        matchedUser: null,
        error: "Потрібно: дата та ім'я",
      });
      continue;
    }

    const date = parseFlexDate(parts[0]);
    const name = parts[1];

    if (!date) {
      rows.push({
        line: i + 1,
        raw,
        date: null,
        name,
        matchedUser: null,
        error: `Невідома дата: "${parts[0]}"`,
      });
      continue;
    }

    const matchedUser = matchUser(name, users);
    const row: ParsedRow = { line: i + 1, raw, date, name, matchedUser };
    if (!matchedUser) {
      row.error = `Особу "${name}" не знайдено`;
    }
    rows.push(row);
  }

  return rows;
};

// ── Import ────────────────────────────────────────────────────────────

/**
 * Import parsed rows into the schedule database.
 * - Skips rows with errors (no user matched, bad date).
 * - Skips dates that already have schedule entries (unless overwrite=true).
 * - Creates entries with type='manual'.
 */
export const importParsedSchedule = async (
  rows: ParsedRow[],
  overwrite: boolean
): Promise<ImportResult> => {
  const validRows = rows.filter((r) => r.date && r.matchedUser && !r.error);

  // Group by date — multiple users on the same date → multi-duty
  const byDate = new Map<string, number[]>();
  for (const row of validRows) {
    const date = row.date!;
    const userId = row.matchedUser!.id!;
    const existing = byDate.get(date) ?? [];
    if (!existing.includes(userId)) {
      existing.push(userId);
    }
    byDate.set(date, existing);
  }

  let imported = 0;
  let skippedExisting = 0;
  const entries: ScheduleEntry[] = [];

  for (const [date, userIds] of byDate) {
    const existing = await getScheduleByDate(date);

    if (existing && !overwrite) {
      skippedExisting++;
      continue;
    }

    entries.push({
      date,
      userId: userIds.length === 1 ? userIds[0] : userIds,
      type: 'import',
      isLocked: false,
    });
    imported++;
  }

  if (entries.length > 0) {
    await bulkSaveSchedule(entries);
  }

  return {
    imported,
    skippedExisting,
    skippedErrors: rows.length - validRows.length,
  };
};
