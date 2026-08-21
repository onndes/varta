// Tests for «Штатний черговий» — власна тижнева норма замість ліміту 1/тиждень.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AutoScheduleOptions, ScheduleEntry, User } from '@/types';
import { autoFillSchedule } from '@/services/autoScheduler';
import { filterByWeeklyCap, filterByRestDays } from '@/services/autoScheduler/comparator';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '@/utils/constants';
import { getWeeklyDutyTarget } from '@/utils/staffDuty';
import { toAssignedUserIds } from '@/utils/assignment';
import { buildPreGenerationSummary } from '@/utils/preGenerationSummary';
import { db } from '@/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const mkUser = (id: number, name: string, extra?: Partial<User>): User => ({
  id,
  name,
  rank: 'Солдат',
  status: 'ACTIVE',
  isActive: true,
  ...extra,
});

// Тиждень свідомо в майбутньому: autoFillSchedule пропускає дати до сьогодні.
const WEEK = [
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
  '2026-09-12',
  '2026-09-13',
];

const scheduleOf = (pairs: Array<[string, number]>): Record<string, ScheduleEntry> =>
  Object.fromEntries(
    pairs.map(([date, userId]) => [date, { date, userId, type: 'auto' as const }])
  );

describe('getWeeklyDutyTarget', () => {
  it('звичайний боєць — 1, штатний — власна норма в межах 2..4', () => {
    expect(getWeeklyDutyTarget(mkUser(1, 'Regular'))).toBe(1);
    expect(getWeeklyDutyTarget(mkUser(2, 'Staff', { isStaffDuty: true }))).toBe(3);
    expect(
      getWeeklyDutyTarget(mkUser(3, 'Staff2', { isStaffDuty: true, staffWeeklyTarget: 4 }))
    ).toBe(4);
    // Поза діапазоном — обрізається
    expect(
      getWeeklyDutyTarget(mkUser(4, 'Staff3', { isStaffDuty: true, staffWeeklyTarget: 9 }))
    ).toBe(4);
  });
});

describe('filterByWeeklyCap зі штатним черговим', () => {
  const pool = [
    mkUser(1, 'Regular'),
    mkUser(2, 'Staff', { isStaffDuty: true, staffWeeklyTarget: 3 }),
  ];
  const allUsers = [...pool, ...[3, 4, 5, 6, 7].map((id) => mkUser(id, `Filler${id}`))];

  it('штатний проходить далі, коли звичайний уже вибрав свою норму', () => {
    const schedule = scheduleOf([
      ['2026-09-07', 1],
      ['2026-09-08', 2],
    ]);
    const filtered = filterByWeeklyCap(pool, allUsers, '2026-09-10', schedule);
    expect(filtered.map((u) => u.id)).toEqual([2]);
  });

  it('штатний відсікається після виконання власної норми', () => {
    const schedule = scheduleOf([
      ['2026-09-07', 2],
      ['2026-09-09', 2],
      ['2026-09-11', 2],
    ]);
    const filtered = filterByWeeklyCap(pool, allUsers, '2026-09-12', schedule);
    expect(filtered.map((u) => u.id)).toEqual([1]);
  });
});

describe('filterByRestDays зі штатним черговим', () => {
  it('штатному вистачає 1 дня відпочинку, звичайному — налаштованих 2', () => {
    const pool = [
      mkUser(1, 'Regular'),
      mkUser(2, 'Staff', { isStaffDuty: true }),
    ];
    // Обидва чергували позавчора (відстань 2 дні)
    const schedule = scheduleOf([['2026-09-07', 1]]);
    schedule['2026-09-07'] = { date: '2026-09-07', userId: [1, 2], type: 'auto' };
    const filtered = filterByRestDays(pool, '2026-09-09', 2, schedule);
    expect(filtered.map((u) => u.id)).toEqual([2]);
  });

  it('два наряди поспіль штатному все одно заборонені', () => {
    const pool = [mkUser(2, 'Staff', { isStaffDuty: true })];
    const schedule = scheduleOf([['2026-09-08', 2]]);
    // Єдиний кандидат — фільтр повертає пул як fallback, тому перевіряємо
    // разом зі звичайним «запасним» бійцем.
    const poolWithBackup = [...pool, mkUser(3, 'Backup')];
    const filtered = filterByRestDays(poolWithBackup, '2026-09-09', 1, schedule);
    expect(filtered.map((u) => u.id)).toEqual([3]);
  });
});

describe('autoFillSchedule зі штатним черговим', () => {
  it('штатний отримує свою тижневу норму, решта — по одному наряду', async () => {
    const users: User[] = [
      mkUser(1, 'Staff', { isStaffDuty: true, staffWeeklyTarget: 3 }),
      ...[2, 3, 4, 5, 6, 7, 8].map((id) => mkUser(id, `User${id}`)),
    ];
    const options: AutoScheduleOptions = {
      ...DEFAULT_AUTO_SCHEDULE_OPTIONS,
      limitOneDutyPerWeekWhenSevenPlus: true,
      useMultiRestart: false,
      useTabuSearch: false,
    };
    const updates = await autoFillSchedule(WEEK, users, {}, { 0: 1.2, 6: 1.6 }, 1, options);
    const counts = new Map<number, number>();
    for (const e of updates) {
      for (const id of toAssignedUserIds(e.userId)) {
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    // Штатний узяв більше одного наряду, але не більше норми
    const staffCount = counts.get(1) || 0;
    expect(staffCount).toBeGreaterThan(1);
    expect(staffCount).toBeLessThanOrEqual(3);
    // Ніхто зі звичайних не перевищив 1 наряд на тиждень
    for (const [id, count] of counts) {
      if (id !== 1) expect(count).toBeLessThanOrEqual(1);
    }
    // Штатний не чергує два дні поспіль
    const staffDates = updates
      .filter((e) => toAssignedUserIds(e.userId).includes(1))
      .map((e) => e.date)
      .sort();
    for (let i = 1; i < staffDates.length; i++) {
      const gap =
        (new Date(staffDates[i]).getTime() - new Date(staffDates[i - 1]).getTime()) / 86400000;
      expect(gap).toBeGreaterThan(1);
    }
  });
});

describe('buildPreGenerationSummary зі штатним черговим', () => {
  it('норма штатного враховується в місткості тижня', () => {
    // 5 бійців: 4 звичайних (по 1) + 1 штатний з нормою 3 → місткість 7 = потрібним 7
    const users: User[] = [
      mkUser(1, 'Staff', { isStaffDuty: true, staffWeeklyTarget: 3 }),
      ...[2, 3, 4, 5].map((id) => mkUser(id, `User${id}`)),
    ];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.lowPoolWeeks).toEqual([]);
  });

  it('без штатного ті самі 5 бійців дають попередження', () => {
    const users: User[] = [1, 2, 3, 4, 5].map((id) => mkUser(id, `User${id}`));
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.lowPoolWeeks).toHaveLength(1);
    expect(summary.lowPoolWeeks[0].weeklyCapacity).toBe(5);
    expect(summary.lowPoolWeeks[0].requiredCount).toBe(7);
  });
});
