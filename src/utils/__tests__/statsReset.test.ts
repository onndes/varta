import { describe, expect, it } from 'vitest';
import type { ScheduleEntry, User } from '../../types';
import { applyStatsCutoffs, clampToStatsCutoff, getStatsCutoff } from '../statsReset';
import { computeWorkload } from '../workload';

const makeUser = (id: number, overrides: Partial<User> = {}): User =>
  ({
    id,
    name: `Боєць ${id}`,
    rank: 'солдат',
    isActive: true,
    dateAddedToAuto: '2026-01-01',
    ...overrides,
  }) as User;

const entry = (date: string, userId: number | number[]): ScheduleEntry => ({
  date,
  userId,
  type: 'auto',
});

describe('applyStatsCutoffs', () => {
  it('повертає той самий об’єкт, коли ніхто нічого не ховає', () => {
    const schedule = { '2026-01-02': entry('2026-01-02', 1) };
    expect(applyStatsCutoffs(schedule, [makeUser(1)])).toBe(schedule);
  });

  it('прибирає наряди бійця до його дати обнулення', () => {
    const schedule = {
      '2026-01-02': entry('2026-01-02', 1),
      '2026-02-02': entry('2026-02-02', 1),
    };
    const result = applyStatsCutoffs(schedule, [makeUser(1, { statsHiddenBefore: '2026-02-01' })]);
    expect(Object.keys(result)).toEqual(['2026-02-02']);
  });

  it('не чіпає інших бійців у спільному записі', () => {
    const schedule = { '2026-01-02': entry('2026-01-02', [1, 2]) };
    const result = applyStatsCutoffs(schedule, [
      makeUser(1, { statsHiddenBefore: '2026-02-01' }),
      makeUser(2),
    ]);
    expect(result['2026-01-02'].userId).toBe(2);
  });

  it('не змінює вихідний розклад (наряди лишаються в базі)', () => {
    const schedule = { '2026-01-02': entry('2026-01-02', 1) };
    applyStatsCutoffs(schedule, [makeUser(1, { statsHiddenBefore: '2026-02-01' })]);
    expect(schedule['2026-01-02'].userId).toBe(1);
  });
});

describe('clampToStatsCutoff', () => {
  it('зсуває початок обліку на дату обнулення', () => {
    const user = makeUser(1, { statsHiddenBefore: '2026-03-01' });
    expect(clampToStatsCutoff(user, '2026-01-01')).toBe('2026-03-01');
    expect(clampToStatsCutoff(user, '2026-04-01')).toBe('2026-04-01');
    expect(clampToStatsCutoff(user, undefined)).toBe('2026-03-01');
  });

  it('без обнулення нічого не змінює', () => {
    expect(getStatsCutoff(makeUser(1))).toBeUndefined();
    expect(clampToStatsCutoff(makeUser(1), '2026-01-01')).toBe('2026-01-01');
  });
});

describe('навантаження після обнулення', () => {
  it('ігнорує приховані наряди та рахує з нової дати', () => {
    const week = ['2026-03-02', '2026-03-03'];
    const schedule = {
      '2026-01-05': entry('2026-01-05', 1),
      '2026-01-12': entry('2026-01-12', 1),
      '2026-03-02': entry('2026-03-02', 1),
    };
    const hidden = computeWorkload(
      [makeUser(1, { statsHiddenBefore: '2026-03-01' })],
      schedule,
      week
    ).byUser.get(1)!;
    expect(hidden.duties).toBe(1);
    expect(hidden.trackingFrom).toBe('2026-03-01');

    const restored = computeWorkload([makeUser(1)], schedule, week).byUser.get(1)!;
    expect(restored.duties).toBe(3);
    expect(restored.trackingFrom).toBe('2026-01-01');
  });
});
