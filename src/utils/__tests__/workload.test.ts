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

const week = ['2026-01-05', '2026-01-06', '2026-01-07'];

describe('computeWorkload', () => {
  it('ділить наряди на доступні дні', () => {
    const users = [makeUser(1)];
    const schedule = scheduleOf([
      ['2026-01-02', 1],
      ['2026-01-06', 1],
    ]);
    const w = computeWorkload(users, schedule, week).byUser.get(1)!;
    // 01-01 .. 01-07 = 7 днів, 2 наряди
    expect(w.availableDays).toBe(7);
    expect(w.duties).toBe(2);
    expect(w.daysPerDuty).toBeCloseTo(3.5);
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
    expect(a.availableDays).toBe(7);
    expect(b.availableDays).toBe(2); // 5 днів відпустки віднято
    expect(b.rate).toBeGreaterThan(a.rate); // 1/2 проти 1/7
  });

  it('накопичує зріз на кожну дату тижня', () => {
    const users = [makeUser(1)];
    const schedule = scheduleOf([['2026-01-06', 1]]);
    const w = computeWorkload(users, schedule, week).byUser.get(1)!;
    expect(w.byDate['2026-01-05'].duties).toBe(0);
    expect(w.byDate['2026-01-06'].duties).toBe(1);
    expect(w.byDate['2026-01-07'].duties).toBe(1);
    expect(w.byDate['2026-01-07'].availableDays).toBe(7);
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
