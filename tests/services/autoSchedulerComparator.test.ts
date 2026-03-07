import { describe, it, expect } from 'vitest';
import type { User, ScheduleEntry, AutoScheduleOptions, DayWeights } from '@/types';
import {
  filterByRestDays,
  filterByIncompatiblePairs,
  filterByWeeklyCap,
  filterForceUseAllWhenFew,
  buildUserComparator,
} from '@/services/autoScheduler/comparator';

// ─── Фабрики ───────────────────────────────────────────────────────

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  name: 'Alpha',
  rank: 'Солдат',
  status: 'ACTIVE',
  isActive: true,
  debt: 0,
  owedDays: {},
  ...overrides,
});

const defaultOptions: AutoScheduleOptions = {
  avoidConsecutiveDays: true,
  respectOwedDays: true,
  considerLoad: true,
  minRestDays: 1,
  aggressiveLoadBalancing: false,
  aggressiveLoadBalancingThreshold: 0.2,
  limitOneDutyPerWeekWhenSevenPlus: true,
  allowDebtUsersExtraWeeklyAssignments: false,
  debtUsersWeeklyLimit: 1,
  prioritizeFasterDebtRepayment: false,
  forceUseAllWhenFew: true,
};

const defaultDayWeights: DayWeights = {
  0: 1.5,
  1: 1.0,
  2: 1.0,
  3: 1.0,
  4: 1.0,
  5: 1.5,
  6: 2.0,
};

/** Створити масив активних бійців */
const makeActiveUsers = (count: number): User[] =>
  Array.from({ length: count }, (_, i) => makeUser({ id: i + 1, name: `User${i + 1}` }));

// ─── filterByRestDays ──────────────────────────────────────────────

describe('filterByRestDays', () => {
  const userA = makeUser({ id: 1, name: 'Alpha' });
  const userB = makeUser({ id: 2, name: 'Bravo' });
  const userC = makeUser({ id: 3, name: 'Charlie' });

  it('немає недавніх призначень → повертає всіх', () => {
    const pool = [userA, userB, userC];
    const schedule: Record<string, ScheduleEntry> = {};
    const result = filterByRestDays(pool, '2026-03-10', 1, schedule);
    expect(result).toEqual(pool);
  });

  it('боєць чергував вчора → відфільтрований', () => {
    const pool = [userA, userB, userC];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    const result = filterByRestDays(pool, '2026-03-10', 1, schedule);
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.id)).toEqual([2, 3]);
  });

  it('боєць чергував завтра (вже призначений) → відфільтрований', () => {
    const pool = [userA, userB, userC];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-11': { date: '2026-03-11', userId: 2, type: 'manual' },
    };
    const result = filterByRestDays(pool, '2026-03-10', 1, schedule);
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.id)).toEqual([1, 3]);
  });

  it('усі відфільтровані → fallback до оригінального пулу', () => {
    const pool = [userA];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    const result = filterByRestDays(pool, '2026-03-10', 1, schedule);
    // Fallback: повертає пул як є
    expect(result).toEqual(pool);
  });

  it('minRest=2 → перевіряє 2 дні назад і вперед', () => {
    const pool = [userA, userB, userC];
    const schedule: Record<string, ScheduleEntry> = {
      // userA чергував 2 дні тому
      '2026-03-08': { date: '2026-03-08', userId: 1, type: 'auto' },
    };
    const result = filterByRestDays(pool, '2026-03-10', 2, schedule);
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.id)).toEqual([2, 3]);
  });

  it('minRest=2 → день 1 тому OK при minRest=1, але 2-й фільтрує', () => {
    const pool = [userA, userB];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-08': { date: '2026-03-08', userId: 1, type: 'auto' },
    };
    // minRest=1: перевіряє лише 1 день, 2026-03-08 за 2 дні → не фільтрується
    const result1 = filterByRestDays(pool, '2026-03-10', 1, schedule);
    expect(result1.map((u) => u.id)).toEqual([1, 2]);

    // minRest=2: перевіряє 2 дні, 2026-03-08 за 2 дні → фільтрується
    const result2 = filterByRestDays(pool, '2026-03-10', 2, schedule);
    expect(result2.map((u) => u.id)).toEqual([2]);
  });

  it('масив userId в schedule → всі ID фільтруються', () => {
    const pool = [userA, userB, userC];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: [1, 2], type: 'auto' },
    };
    const result = filterByRestDays(pool, '2026-03-10', 1, schedule);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });
});

// ─── filterByIncompatiblePairs ─────────────────────────────────────

describe('filterByIncompatiblePairs', () => {
  it('немає сусідів → повертає всіх', () => {
    const pool = [makeUser({ id: 1, name: 'Alpha' }), makeUser({ id: 2, name: 'Bravo' })];
    const schedule: Record<string, ScheduleEntry> = {};
    const result = filterByIncompatiblePairs(pool, pool, '2026-03-10', schedule);
    expect(result).toEqual(pool);
  });

  it('сусід має кандидата в incompatibleWith → відфільтрований', () => {
    const userA = makeUser({ id: 1, name: 'Alpha' });
    const userB = makeUser({ id: 2, name: 'Bravo' });
    const neighbor = makeUser({ id: 3, name: 'Neighbor', incompatibleWith: [1] });
    const pool = [userA, userB];
    const allUsers = [userA, userB, neighbor];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 3, type: 'auto' },
    };
    const result = filterByIncompatiblePairs(pool, allUsers, '2026-03-10', schedule);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('кандидат має сусіда в своєму incompatibleWith → відфільтрований (reverse)', () => {
    const userA = makeUser({ id: 1, name: 'Alpha', incompatibleWith: [3] });
    const userB = makeUser({ id: 2, name: 'Bravo' });
    const neighbor = makeUser({ id: 3, name: 'Neighbor' });
    const pool = [userA, userB];
    const allUsers = [userA, userB, neighbor];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 3, type: 'auto' },
    };
    const result = filterByIncompatiblePairs(pool, allUsers, '2026-03-10', schedule);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('усі відфільтровані → fallback до оригінального пулу', () => {
    const userA = makeUser({ id: 1, name: 'Alpha', incompatibleWith: [3] });
    const neighbor = makeUser({ id: 3, name: 'Neighbor', incompatibleWith: [1] });
    const pool = [userA];
    const allUsers = [userA, neighbor];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 3, type: 'auto' },
    };
    const result = filterByIncompatiblePairs(pool, allUsers, '2026-03-10', schedule);
    // Fallback
    expect(result).toEqual(pool);
  });

  it('сусід на наступний день → теж перевіряється', () => {
    const userA = makeUser({ id: 1, name: 'Alpha' });
    const userB = makeUser({ id: 2, name: 'Bravo' });
    const neighbor = makeUser({ id: 3, name: 'Neighbor', incompatibleWith: [2] });
    const pool = [userA, userB];
    const allUsers = [userA, userB, neighbor];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-11': { date: '2026-03-11', userId: 3, type: 'manual' },
    };
    const result = filterByIncompatiblePairs(pool, allUsers, '2026-03-10', schedule);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('incompatibleWith порожній масив → всі проходять', () => {
    const userA = makeUser({ id: 1, name: 'Alpha', incompatibleWith: [] });
    const neighbor = makeUser({ id: 3, name: 'Neighbor', incompatibleWith: [] });
    const pool = [userA];
    const allUsers = [userA, neighbor];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 3, type: 'auto' },
    };
    const result = filterByIncompatiblePairs(pool, allUsers, '2026-03-10', schedule);
    expect(result).toEqual(pool);
  });
});

// ─── filterByWeeklyCap ─────────────────────────────────────────────

describe('filterByWeeklyCap', () => {
  // Потрібно 7+ active бійців щоб cap спрацював
  const buildLargePool = (): User[] => makeActiveUsers(8);

  it('боєць вже має наряд цього тижня → відфільтрований', () => {
    const allUsers = buildLargePool();
    const pool = allUsers.slice(0, 3); // Тестуємо пул з перших 3
    const schedule: Record<string, ScheduleEntry> = {
      // User1 вже має наряд у цьому тижні
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    const result = filterByWeeklyCap(pool, allUsers, '2026-03-11', schedule, defaultOptions);
    expect(result.map((u) => u.id)).toEqual([2, 3]);
  });

  it('боєць нижче cap → проходить', () => {
    const allUsers = buildLargePool();
    const pool = allUsers.slice(0, 3);
    const schedule: Record<string, ScheduleEntry> = {};
    const result = filterByWeeklyCap(pool, allUsers, '2026-03-10', schedule, defaultOptions);
    expect(result).toHaveLength(3);
  });

  it('<7 eligible бійців → cap не діє, повертає весь пул', () => {
    const allUsers = makeActiveUsers(5);
    const pool = allUsers.slice(0, 3);
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    // Менше 7 eligible → cap не діє
    const result = filterByWeeklyCap(pool, allUsers, '2026-03-11', schedule, defaultOptions);
    expect(result).toHaveLength(3);
  });

  it('усі на cap → fallback до пулу', () => {
    const allUsers = buildLargePool();
    const pool = [allUsers[0]]; // Тільки User1
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    const result = filterByWeeklyCap(pool, allUsers, '2026-03-11', schedule, defaultOptions);
    // Fallback: повертає пул
    expect(result).toEqual(pool);
  });

  it('боржник з extra weekly caps → може мати більше нарядів', () => {
    const allUsers = buildLargePool();
    // Боржник: debt=-3
    allUsers[0] = makeUser({ id: 1, name: 'User1', debt: -3 });
    const pool = [allUsers[0], allUsers[1]];
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
    };
    const optionsWithDebt: AutoScheduleOptions = {
      ...defaultOptions,
      allowDebtUsersExtraWeeklyAssignments: true,
      debtUsersWeeklyLimit: 2,
    };
    const result = filterByWeeklyCap(pool, allUsers, '2026-03-11', schedule, optionsWithDebt);
    // User1 (боржник) ще може мати наряди (cap=2, assigned=1), User2 теж
    expect(result.map((u) => u.id)).toEqual([1, 2]);
  });
});

// ─── buildUserComparator ───────────────────────────────────────────

describe('buildUserComparator', () => {
  it('боєць з меншою кількістю нарядів має вищий пріоритет', () => {
    const userA = makeUser({ id: 1, name: 'Alpha' });
    const userB = makeUser({ id: 2, name: 'Bravo' });
    // Обидва мають однакову дату останнього наряду, немає нарядів у вівторок (dayIdx=2),
    // щоб пріоритети 3-5 були рівні і порівняння дійшло до пріоритету 6 (загальна кількість)
    const correctedSchedule: Record<string, ScheduleEntry> = {
      '2026-03-02': { date: '2026-03-02', userId: 1, type: 'auto' },
      '2026-03-04': { date: '2026-03-04', userId: 1, type: 'auto' },
      '2026-03-06': { date: '2026-03-06', userId: [1, 2], type: 'auto' },
    };
    const compare = buildUserComparator(
      '2026-03-10',
      correctedSchedule,
      defaultDayWeights,
      defaultOptions
    );
    // userB має 1 наряд, userA має 3 → userB має вищий пріоритет
    const sorted = [userA, userB].sort(compare);
    expect(sorted[0].id).toBe(2);
  });

  it('боєць з owedDays для цього дня має вищий пріоритет (respectOwedDays)', () => {
    const userA = makeUser({ id: 1, name: 'Alpha', owedDays: {} });
    const userB = makeUser({ id: 2, name: 'Bravo', owedDays: { 2: 3 } });
    // 2026-03-10 = вівторок, JS dayIdx=2
    const schedule: Record<string, ScheduleEntry> = {};
    const options: AutoScheduleOptions = { ...defaultOptions, respectOwedDays: true };
    const compare = buildUserComparator('2026-03-10', schedule, defaultDayWeights, options);
    const sorted = [userA, userB].sort(compare);
    expect(sorted[0].id).toBe(2);
  });

  it('боєць з більшим часом очікування має вищий пріоритет', () => {
    const userA = makeUser({ id: 1, name: 'Alpha' });
    const userB = makeUser({ id: 2, name: 'Bravo' });
    const schedule: Record<string, ScheduleEntry> = {
      // Alpha чергував нещодавно (3 дні тому)
      '2026-03-07': { date: '2026-03-07', userId: 1, type: 'auto' },
      // Bravo чергував давно (10 днів тому)
      '2026-02-28': { date: '2026-02-28', userId: 2, type: 'auto' },
    };
    const compare = buildUserComparator('2026-03-10', schedule, defaultDayWeights, defaultOptions);
    const sorted = [userA, userB].sort(compare);
    expect(sorted[0].id).toBe(2);
  });
});

// ─── filterForceUseAllWhenFew ──────────────────────────────────────

describe('filterForceUseAllWhenFew', () => {
  // 2026-03-22 is a Sunday (DOW=0); 7 days prior is 2026-03-15 (same DOW).
  const DATE = '2026-03-22';

  it('повертає нульових користувачів навіть якщо вони повторять той самий день тижня', () => {
    // User1: 0 duties this week (Mar 16-22), but served last Sunday Mar 15.
    // User2: 1 duty this week.
    // The filter always enforces "everyone must have a duty", DOW repeat is handled elsewhere.
    const user1 = makeUser({ id: 1 });
    const user2 = makeUser({ id: 2 });
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-15': { date: '2026-03-15', userId: 1, type: 'auto' }, // last Sunday
      '2026-03-17': { date: '2026-03-17', userId: 2, type: 'auto' }, // this week
    };
    const result = filterForceUseAllWhenFew([user1, user2], DATE, schedule);
    // Zero-duty guarantee: user1 must be in the restricted pool.
    expect(result.map((u) => u.id)).toEqual([1]);
  });

  it('обмежує пул нульовими користувачами, коли вони НЕ повторюють той самий день тижня', () => {
    // User1: 0 duties this week, last duty was on a different day (not Mar 15).
    // User2: 1 duty this week.
    const user1 = makeUser({ id: 1 });
    const user2 = makeUser({ id: 2 });
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-10': { date: '2026-03-10', userId: 1, type: 'auto' }, // Tue, not same DOW
      '2026-03-17': { date: '2026-03-17', userId: 2, type: 'auto' }, // this week
    };
    const result = filterForceUseAllWhenFew([user1, user2], DATE, schedule);
    // User1 would not repeat DOW → filter to zero-duty users only.
    expect(result.map((u) => u.id)).toEqual([1]);
  });

  it('обмежує до нульових, коли ЛИШЕ ЧАСТИНА нульових повторює день тижня', () => {
    // User1: 0 duties this week, served last Sunday Mar 15 → would repeat.
    // User2: 0 duties this week, no prior Sunday → would NOT repeat.
    // User3: 1 duty this week.
    const user1 = makeUser({ id: 1 });
    const user2 = makeUser({ id: 2 });
    const user3 = makeUser({ id: 3 });
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-15': { date: '2026-03-15', userId: 1, type: 'auto' }, // last Sunday
      '2026-03-17': { date: '2026-03-17', userId: 3, type: 'auto' }, // this week
    };
    const result = filterForceUseAllWhenFew([user1, user2, user3], DATE, schedule);
    // NOT all zero-duty users would repeat (user2 wouldn't) → filter to zero-duty subset.
    expect(result.map((u) => u.id).sort()).toEqual([1, 2]);
  });
});
