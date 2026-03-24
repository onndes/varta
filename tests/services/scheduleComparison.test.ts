/**
 * Schedule Comparison: W14–W22 (2026-03-30 to 2026-05-31)
 * Compares old logic (evenWeeklyDistribution=false) vs new logic (evenWeeklyDistribution=true)
 * using real backup data from VARTA_FULL_BACKUP_Графiк_1_2026-03-24.json (ws_1773686669271 "Графiк 1")
 *
 * Run: npx vitest run tests/services/scheduleComparison.test.ts
 */

import { describe, it, vi, beforeAll, afterAll } from 'vitest';
import type { AutoScheduleOptions, DayWeights, ScheduleEntry, User } from '@/types';
import { autoFillSchedule } from '@/services/autoScheduler';

// ── Users from backup (ws_1773686669271) ─────────────────────────────────────

const USERS: User[] = [
  {
    id: 1,
    name: 'ХЛИВНЮК',
    rank: 'Капітан',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-08',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [
      { status: 'TRIP', from: '2026-03-18', to: '2026-03-19', restBefore: true, restAfter: false },
      {
        status: 'VACATION',
        from: '2026-03-23',
        to: '2026-04-08',
        restBefore: false,
        restAfter: false,
      },
    ],
  },
  {
    id: 2,
    name: 'СТРАТІЛАТ',
    rank: 'Ст.лейтенант',
    status: 'SICK',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-15',
    statusFrom: '2026-02-27',
    statusTo: '2026-05-10',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [
      { status: 'SICK', from: '2026-02-27', to: '2026-05-10', restBefore: false, restAfter: false },
    ],
  },
  {
    id: 3,
    name: 'ВИЛЬОТНІКОВ',
    rank: 'Ст.лейтенант',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-10',
    blockedDays: [],
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [],
  },
  {
    id: 4,
    name: 'АВДІЄВСЬКА',
    rank: 'Гол.сержант',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: true, // excluded from auto
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-12',
    blockedDays: [1, 2, 3, 4, 7],
    blockedDaysFrom: '2026-02-23',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [],
  },
  {
    id: 5,
    name: 'ПАНКОВА',
    rank: 'Ст.солдат',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-11',
    incompatibleWith: [7],
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [],
  },
  {
    id: 6,
    name: 'ЄРМОЛЕНКО',
    rank: 'Ст.солдат',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-02-23',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [
      { status: 'TRIP', from: '2026-03-23', restBefore: false, restAfter: false }, // no end (indefinite)
    ],
  },
  {
    id: 7,
    name: 'БРИЯЛОВСЬКА',
    rank: 'Ст.солдат',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-01-07',
    incompatibleWith: [5],
    statusFrom: '',
    statusTo: '',
    restBeforeStatus: false,
    restAfterStatus: false,
  },
  {
    id: 8,
    name: 'ЛИТВИНЧУК',
    rank: 'Капітан',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: true, // excluded from auto
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-02-14',
    blockedDays: [1, 2, 3, 4, 7],
    blockedDaysFrom: '2026-02-23',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [],
  },
  {
    id: 9,
    name: 'БАХЛУЛОВ',
    rank: 'Ст.солдат',
    status: 'VACATION',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-03-01',
    statusFrom: '2026-03-20',
    statusTo: '2026-04-26',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [
      {
        status: 'VACATION',
        from: '2026-03-20',
        to: '2026-04-26',
        restBefore: false,
        restAfter: false,
      },
    ],
  },
  {
    id: 13,
    name: 'шльончик',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    excludeFromAuto: false,
    debt: 0,
    owedDays: {},
    dateAddedToAuto: '2026-03-21',
    restBeforeStatus: false,
    restAfterStatus: false,
    statusPeriods: [],
  },
];

// ── Schedule context (all entries up to W13 end) ─────────────────────────────

const INITIAL_SCHEDULE: Record<string, ScheduleEntry> = {
  '2026-01-07': { date: '2026-01-07', userId: 7, type: 'history' },
  '2026-01-08': { date: '2026-01-08', userId: 1, type: 'history' },
  '2026-01-10': { date: '2026-01-10', userId: 3, type: 'history' },
  '2026-01-11': { date: '2026-01-11', userId: 5, type: 'history' },
  '2026-01-12': { date: '2026-01-12', userId: 4, type: 'history' },
  '2026-01-15': { date: '2026-01-15', userId: 2, type: 'history' },
  '2026-01-16': { date: '2026-01-16', userId: 1, type: 'history' },
  '2026-01-18': { date: '2026-01-18', userId: 3, type: 'history' },
  '2026-01-19': { date: '2026-01-19', userId: 7, type: 'history' },
  '2026-01-20': { date: '2026-01-20', userId: 4, type: 'history' },
  '2026-01-21': { date: '2026-01-21', userId: 5, type: 'history' },
  '2026-01-22': { date: '2026-01-22', userId: 2, type: 'history' },
  '2026-01-24': { date: '2026-01-24', userId: 1, type: 'history' },
  '2026-01-26': { date: '2026-01-26', userId: 3, type: 'history' },
  '2026-01-27': { date: '2026-01-27', userId: 7, type: 'history' },
  '2026-01-28': { date: '2026-01-28', userId: 4, type: 'history' },
  '2026-01-29': { date: '2026-01-29', userId: 5, type: 'history' },
  '2026-02-01': { date: '2026-02-01', userId: 2, type: 'history' },
  '2026-02-02': { date: '2026-02-02', userId: 7, type: 'history' },
  '2026-02-03': { date: '2026-02-03', userId: 4, type: 'history' },
  '2026-02-04': { date: '2026-02-04', userId: 5, type: 'history' },
  '2026-02-06': { date: '2026-02-06', userId: 1, type: 'history' },
  '2026-02-07': { date: '2026-02-07', userId: 2, type: 'history' },
  '2026-02-08': { date: '2026-02-08', userId: 3, type: 'history' },
  '2026-02-09': { date: '2026-02-09', userId: 4, type: 'history' },
  '2026-02-10': { date: '2026-02-10', userId: 5, type: 'history' },
  '2026-02-11': { date: '2026-02-11', userId: 2, type: 'history' },
  '2026-02-12': { date: '2026-02-12', userId: 1, type: 'history' },
  '2026-02-13': { date: '2026-02-13', userId: 7, type: 'history' },
  '2026-02-14': { date: '2026-02-14', userId: 8, type: 'history' },
  '2026-02-15': { date: '2026-02-15', userId: 3, type: 'history' },
  '2026-02-16': { date: '2026-02-16', userId: 5, type: 'history' },
  '2026-02-17': { date: '2026-02-17', userId: 2, type: 'history' },
  '2026-02-19': { date: '2026-02-19', userId: 7, type: 'history' },
  '2026-02-20': { date: '2026-02-20', userId: 1, type: 'history' },
  '2026-02-21': { date: '2026-02-21', userId: 3, type: 'history' },
  '2026-02-22': { date: '2026-02-22', userId: 4, type: 'history' },
  '2026-02-23': { date: '2026-02-23', userId: 6, type: 'history' },
  '2026-02-24': { date: '2026-02-24', userId: 5, type: 'history' },
  '2026-02-25': { date: '2026-02-25', userId: 7, type: 'history' },
  '2026-02-26': { date: '2026-02-26', userId: 1, type: 'manual' },
  '2026-02-27': { date: '2026-02-27', userId: 3, type: 'manual' },
  '2026-02-28': { date: '2026-02-28', userId: 8, type: 'manual' },
  '2026-03-01': { date: '2026-03-01', userId: 9, type: 'manual' },
  '2026-03-02': { date: '2026-03-02', userId: 5, type: 'manual' },
  '2026-03-03': { date: '2026-03-03', userId: 9, type: 'manual' },
  '2026-03-04': { date: '2026-03-04', userId: 1, type: 'manual' },
  '2026-03-05': { date: '2026-03-05', userId: 3, type: 'manual' },
  '2026-03-06': { date: '2026-03-06', userId: 8, type: 'replace' },
  '2026-03-07': { date: '2026-03-07', userId: 6, type: 'swap' },
  '2026-03-08': { date: '2026-03-08', userId: 9, type: 'swap' },
  '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
  '2026-03-10': { date: '2026-03-10', userId: 9, type: 'swap' },
  '2026-03-11': { date: '2026-03-11', userId: 3, type: 'auto' },
  '2026-03-12': { date: '2026-03-12', userId: 6, type: 'swap' },
  '2026-03-13': { date: '2026-03-13', userId: 5, type: 'auto' },
  '2026-03-14': { date: '2026-03-14', userId: 8, type: 'replace' },
  '2026-03-15': { date: '2026-03-15', userId: 7, type: 'auto' },
  '2026-03-16': { date: '2026-03-16', userId: 3, type: 'replace' },
  '2026-03-17': { date: '2026-03-17', userId: 5, type: 'swap' },
  '2026-03-18': { date: '2026-03-18', userId: 6, type: 'swap' },
  '2026-03-19': { date: '2026-03-19', userId: 7, type: 'swap' },
  '2026-03-20': { date: '2026-03-20', userId: 4, type: 'manual' },
  '2026-03-21': { date: '2026-03-21', userId: 1, type: 'manual' },
  '2026-03-22': { date: '2026-03-22', userId: 6, type: 'auto' },
  '2026-03-23': { date: '2026-03-23', userId: 13, type: 'auto' },
  '2026-03-24': { date: '2026-03-24', userId: 3, type: 'auto' },
  '2026-03-25': { date: '2026-03-25', userId: 5, type: 'auto' },
  '2026-03-26': { date: '2026-03-26', userId: 13, type: 'auto' },
  '2026-03-27': { date: '2026-03-27', userId: 3, type: 'auto' },
  '2026-03-28': { date: '2026-03-28', userId: 7, type: 'auto' },
  '2026-03-29': { date: '2026-03-29', userId: 13, type: 'auto' },
};

// ── Options (from backup, no evenWeeklyDistribution saved) ───────────────────

const BASE_OPTIONS = {
  avoidConsecutiveDays: true,
  respectOwedDays: true,
  considerLoad: true,
  minRestDays: 2,
  aggressiveLoadBalancing: false,
  aggressiveLoadBalancingThreshold: 0.2,
  limitOneDutyPerWeekWhenSevenPlus: true,
  allowDebtUsersExtraWeeklyAssignments: true,
  debtUsersWeeklyLimit: 3,
  prioritizeFasterDebtRepayment: true,
  forceUseAllWhenFew: true,
  useExperimentalStatsView: false,
} as AutoScheduleOptions;

const DAY_WEIGHTS: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };

// ── Date helpers ──────────────────────────────────────────────────────────────

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T12:00:00');
  const endDate = new Date(end + 'T12:00:00');
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function getIsoWeekNumber(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getDow(dateStr: string): number {
  // 0=Mon ... 6=Sun
  const d = new Date(dateStr + 'T12:00:00').getDay();
  return d === 0 ? 6 : d - 1;
}

const DOW_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const SHORT_NAMES: Record<number, string> = {
  1: 'ХЛИВНЮК',
  2: 'СТРАТІЛАТ',
  3: 'ВИЛЬОТН',
  5: 'ПАНКОВА',
  6: 'ЄРМОЛ',
  7: 'БРИЯЛОВСЬК',
  9: 'БАХЛУЛОВ',
  13: 'шльончик',
};

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + ' '.repeat(n - s.length);
}

// ── Analysis helpers ──────────────────────────────────────────────────────────

function analyzeSchedule(
  label: string,
  entries: ScheduleEntry[],
  contextSchedule: Record<string, ScheduleEntry>
): void {
  // merge context + new entries into one map
  const full: Record<string, ScheduleEntry> = { ...contextSchedule };
  for (const e of entries) full[e.date] = e;

  const autoUsers = USERS.filter((u) => u.isActive && !u.excludeFromAuto);
  const autoIds = autoUsers.map((u) => u.id!);

  // Group by ISO week
  const weeks: Record<number, string[]> = {};
  for (const e of entries) {
    const w = getIsoWeekNumber(e.date);
    if (!weeks[w]) weeks[w] = [];
    weeks[w].push(e.date);
  }

  console.log('\n' + '═'.repeat(72));
  console.log(`  ${label}`);
  console.log('═'.repeat(72));

  // ─ Per-week schedule table ─────────────────────────────────────────────────
  let totalDowRepeats = 0;
  const userDowCounts: Record<number, number[]> = {};
  for (const uid of autoIds) userDowCounts[uid] = [0, 0, 0, 0, 0, 0, 0];

  for (const [weekStr, dates] of Object.entries(weeks).sort(([a], [b]) => Number(a) - Number(b))) {
    const week = Number(weekStr);
    const sorted = [...dates].sort();
    const weekStart = sorted[0];
    const weekEnd = sorted[sorted.length - 1];
    console.log(`\n  W${week}  (${weekStart} → ${weekEnd})`);
    console.log('  ' + DOW_NAMES.map((d) => pad(d, 12)).join(' '));

    const row: string[] = Array(7).fill('');
    for (const d of sorted) {
      const dow = getDow(d);
      const uid = full[d]?.userId;
      const uname = uid ? (SHORT_NAMES[uid as number] ?? `#${uid}`) : '(порожньо)';
      row[dow] = uname;
    }
    console.log('  ' + row.map((r) => pad(r || '-', 12)).join(' '));

    // Check DOW same-week repeat (7 days apart from prev week)
    for (const d of sorted) {
      const uid = full[d]?.userId as number | undefined;
      if (!uid) continue;
      const dow = getDow(d);
      if (userDowCounts[uid]) userDowCounts[uid][dow]++;

      // Check 7 days back
      const prev = new Date(d + 'T12:00:00');
      prev.setDate(prev.getDate() - 7);
      const prevStr = prev.toISOString().slice(0, 10);
      const prevEntry = full[prevStr];
      if (prevEntry && prevEntry.userId === uid) {
        const dow7 = DOW_NAMES[getDow(d)];
        console.log(
          `  ⚠️  DOW-REPEAT: ${SHORT_NAMES[uid] ?? uid}  ${prev.toISOString().slice(0, 10)} ${dow7} → ${d} ${dow7}`
        );
        totalDowRepeats++;
      }
    }
  }

  // ─ DOW distribution matrix ────────────────────────────────────────────────
  console.log('\n  DOW distribution (auto users, W14-W22):');
  const header =
    '  ' +
    pad('User', 12) +
    ' | ' +
    DOW_NAMES.map((d) => pad(d, 3)).join(' | ') +
    ' | ' +
    pad('Total', 5);
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const uid of autoIds) {
    const counts = userDowCounts[uid];
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const name = SHORT_NAMES[uid] ?? `#${uid}`;
    const row =
      '  ' +
      pad(name, 12) +
      ' | ' +
      counts.map((c) => pad(String(c), 3)).join(' | ') +
      ' | ' +
      pad(String(total), 5);
    console.log(row);
  }

  // ─ Summary ────────────────────────────────────────────────────────────────
  console.log(`\n  ✦ Total DOW same-week repeats: ${totalDowRepeats}`);

  // DOW balance: max - min per user
  let totalImbalance = 0;
  for (const uid of autoIds) {
    const counts = userDowCounts[uid];
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    totalImbalance += max - min;
  }
  console.log(`  ✦ Sum of per-user DOW imbalance (max-min): ${totalImbalance}`);
}

// ── Target date range W14–W22 ─────────────────────────────────────────────────

const TARGET_DATES = getDatesInRange('2026-03-30', '2026-05-31');

// ── Test ──────────────────────────────────────────────────────────────────────

describe('Schedule Comparison W14–W22', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('OLD логіка (evenWeeklyDistribution=false)', async () => {
    const opts = { ...BASE_OPTIONS, evenWeeklyDistribution: false } as AutoScheduleOptions;
    const result = await autoFillSchedule(
      TARGET_DATES,
      USERS,
      { ...INITIAL_SCHEDULE },
      DAY_WEIGHTS,
      1,
      opts
    );
    analyzeSchedule('СТАРА ЛОГІКА  (evenWeeklyDistribution=false)', result, INITIAL_SCHEDULE);
  }, 60_000);

  it('NEW логіка (evenWeeklyDistribution=true)', async () => {
    const opts = { ...BASE_OPTIONS, evenWeeklyDistribution: true } as AutoScheduleOptions;
    const result = await autoFillSchedule(
      TARGET_DATES,
      USERS,
      { ...INITIAL_SCHEDULE },
      DAY_WEIGHTS,
      1,
      opts
    );
    analyzeSchedule('НОВА ЛОГІКА  (evenWeeklyDistribution=true)', result, INITIAL_SCHEDULE);
  }, 60_000);
});
