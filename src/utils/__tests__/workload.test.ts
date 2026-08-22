import { describe, expect, it } from 'vitest';
import type { ScheduleEntry, User, UserStatusPeriod } from '../../types';
import { computeWorkload, getWorkloadBand } from '../workload';

const makeUser = (id: number, overrides: Partial<User> = {}): User =>
  ({
    id,
    name: `Боєць ${id}`,
    rank: 'солдат',
    isActive: true,
    dateAddedToAuto: '2026-01-01',
    ...overrides,
  }) as User;

const scheduleOf = (pairs: Array<[string, number]>): Record<string, ScheduleEntry> =>
  Object.fromEntries(
    pairs.map(([date, userId]) => [date, { date, userId, type: 'auto' as const }])
  );

// Показаний тиждень 12–14.01 (пн–ср): облік зупиняється 11.01.
const week = ['2026-01-12', '2026-01-13', '2026-01-14'];

describe('computeWorkload', () => {
  it('ділить наряди на доступні дні', () => {
    const users = [makeUser(1)];
    const schedule = scheduleOf([
      ['2026-01-02', 1],
      ['2026-01-06', 1],
    ]);
    const w = computeWorkload(users, schedule, week).byUser.get(1)!;
    // 01-01 .. 01-11 = 11 днів, 2 наряди
    expect(w.countedThrough).toBe('2026-01-11');
    expect(w.availableDays).toBe(11);
    expect(w.duties).toBe(2);
    expect(w.daysPerDuty).toBeCloseTo(5.5);
  });

  it('відпустка не збільшує знаменник — показник не псується', () => {
    const vacation: UserStatusPeriod[] = [
      { status: 'VACATION', from: '2026-01-02', to: '2026-01-06' } as UserStatusPeriod,
    ];
    const users = [makeUser(1), makeUser(2, { statusPeriods: vacation })];
    const schedule = scheduleOf([
      ['2026-01-01', 1],
      ['2026-01-07', 2],
    ]);
    const data = computeWorkload(users, schedule, week);
    const a = data.byUser.get(1)!;
    const b = data.byUser.get(2)!;
    expect(a.availableDays).toBe(11);
    expect(b.availableDays).toBe(6); // 5 днів відпустки віднято
    expect(b.rate).toBeGreaterThan(a.rate); // 1/6 проти 1/11
  });

  it('не враховує наряди показаного тижня та планування наперед', () => {
    const users = [makeUser(1)];
    const schedule = scheduleOf([
      ['2026-01-06', 1], // минулий тиждень — рахується
      ['2026-01-13', 1], // всередині показаного тижня — ні
      ['2026-02-20', 1], // заплановано наперед — ні
    ]);
    const w = computeWorkload(users, schedule, week).byUser.get(1)!;
    expect(w.duties).toBe(1);
    expect(w.availableDays).toBe(11);
  });

  it('індекс 100 = середнє по підрозділу', () => {
    const users = [makeUser(1), makeUser(2)];
    const schedule = scheduleOf([
      ['2026-01-05', 1],
      ['2026-01-06', 2],
    ]);
    const data = computeWorkload(users, schedule, week);
    expect(data.byUser.get(1)!.index).toBe(100);
    expect(getWorkloadBand(data.byUser.get(2)!)).toBe('mid');
  });
});
