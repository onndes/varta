import { describe, it, expect } from 'vitest';
import type { User, ScheduleEntry } from '@/types';
import {
  isHardUnavailable,
  countAvailableDaysInWindow,
  getWeekWindow,
  getDatesInRange,
  daysSinceLastAssignment,
  hasDebtBacklog,
  shouldEnforceOneDutyPerWeek,
  getDebtRepaymentScore,
} from '@/services/autoScheduler/helpers';

// ─── Фабрика користувачів ──────────────────────────────────────────

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

// ─── isHardUnavailable ─────────────────────────────────────────────

describe('isHardUnavailable', () => {
  it('активний боєць зі статусом ACTIVE → доступний', () => {
    const user = makeUser();
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('неактивний боєць → недоступний', () => {
    const user = makeUser({ isActive: false });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('blockedDays збігаються з днем тижня дати → недоступний', () => {
    // 2026-03-10 = вівторок, ISO dayIdx = 2
    const user = makeUser({ blockedDays: [2] });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('blockedDays НЕ збігаються з днем тижня дати → доступний', () => {
    // 2026-03-10 = вівторок (2), блокуємо середу (3)
    const user = makeUser({ blockedDays: [3] });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('blockedDays + blockedDaysFrom/To поза діапазоном → доступний', () => {
    // 2026-03-10 = вівторок (2), блок діє лише до 2026-03-08
    const user = makeUser({
      blockedDays: [2],
      blockedDaysFrom: '2026-03-01',
      blockedDaysTo: '2026-03-08',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('blockedDays + blockedDaysFrom/To в межах діапазону → недоступний', () => {
    const user = makeUser({
      blockedDays: [2],
      blockedDaysFrom: '2026-03-01',
      blockedDaysTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('VACATION у межах дат → недоступний', () => {
    const user = makeUser({
      status: 'VACATION',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('TRIP у межах дат → недоступний', () => {
    const user = makeUser({
      status: 'TRIP',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-12')).toBe(true);
  });

  it('SICK у межах дат → недоступний', () => {
    const user = makeUser({
      status: 'SICK',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-11')).toBe(true);
  });

  it('VACATION поза діапазоном дат → доступний', () => {
    const user = makeUser({
      status: 'VACATION',
      statusFrom: '2026-03-20',
      statusTo: '2026-03-25',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('restBeforeStatus — день перед statusFrom → недоступний', () => {
    const user = makeUser({
      status: 'VACATION',
      statusFrom: '2026-03-11',
      statusTo: '2026-03-15',
      restBeforeStatus: true,
    });
    // 2026-03-10 — день перед початком відпустки
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('restAfterStatus — день після statusTo → недоступний', () => {
    const user = makeUser({
      status: 'VACATION',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-14',
      restAfterStatus: true,
    });
    // 2026-03-15 — день після завершення відпустки
    expect(isHardUnavailable(user, '2026-03-15')).toBe(true);
  });

  it('restBeforeStatus — два дні перед statusFrom → доступний', () => {
    const user = makeUser({
      status: 'VACATION',
      statusFrom: '2026-03-12',
      statusTo: '2026-03-15',
      restBeforeStatus: true,
    });
    // 2026-03-10 — два дні перед, не один
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('статус без діапазону дат → постійно недоступний', () => {
    const user = makeUser({ status: 'VACATION' });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('ABSENT у межах дат → недоступний', () => {
    const user = makeUser({
      status: 'ABSENT',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-12')).toBe(true);
  });

  it('OTHER у межах дат → недоступний', () => {
    const user = makeUser({
      status: 'OTHER',
      statusFrom: '2026-03-09',
      statusTo: '2026-03-15',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('OTHER поза діапазоном → доступний', () => {
    const user = makeUser({
      status: 'OTHER',
      statusFrom: '2026-04-01',
      statusTo: '2026-04-10',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(false);
  });

  it('ABSENT без діапазону дат → постійно недоступний', () => {
    const user = makeUser({ status: 'ABSENT' });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('blockedDays з тільки blockedDaysFrom (без To) — дата після From → недоступний', () => {
    // 2026-03-10 = вівторок (2)
    const user = makeUser({
      blockedDays: [2],
      blockedDaysFrom: '2026-03-01',
    });
    expect(isHardUnavailable(user, '2026-03-10')).toBe(true);
  });

  it('неділя — blockedDays=[7] → недоступний', () => {
    // 2026-03-15 = неділя, ISO dayIdx = 7
    const user = makeUser({ blockedDays: [7] });
    expect(isHardUnavailable(user, '2026-03-15')).toBe(true);
  });
});

// ─── countAvailableDaysInWindow ────────────────────────────────────

describe('countAvailableDaysInWindow', () => {
  it('усі дні доступні → повертає кількість днів у діапазоні', () => {
    const user = makeUser();
    // 2026-03-09 (Пн) - 2026-03-15 (Нд) = 7 днів
    expect(countAvailableDaysInWindow(user, '2026-03-09', '2026-03-15')).toBe(7);
  });

  it('деякі дні заблоковані → правильний підрахунок', () => {
    // Блокуємо вівторки (2) — у тижні один вівторок
    const user = makeUser({ blockedDays: [2] });
    expect(countAvailableDaysInWindow(user, '2026-03-09', '2026-03-15')).toBe(6);
  });

  it('з dayIdx фільтром → рахує тільки дні цього дня тижня', () => {
    const user = makeUser();
    // dayIdx=1 це понеділок (JS getDay()=1), у тижні 09-15 є один понеділок
    expect(countAvailableDaysInWindow(user, '2026-03-09', '2026-03-15', 1)).toBe(1);
  });

  it('два тижні, dayIdx=1 (понеділок) → 2 понеділки', () => {
    const user = makeUser();
    expect(countAvailableDaysInWindow(user, '2026-03-09', '2026-03-22', 1)).toBe(2);
  });

  it('fromDate > toDate → повертає 0', () => {
    const user = makeUser();
    expect(countAvailableDaysInWindow(user, '2026-03-15', '2026-03-09')).toBe(0);
  });

  it('один день, доступний → повертає 1', () => {
    const user = makeUser();
    expect(countAvailableDaysInWindow(user, '2026-03-10', '2026-03-10')).toBe(1);
  });

  it('один день, заблокований → повертає 0', () => {
    // 2026-03-10 = вівторок (2)
    const user = makeUser({ blockedDays: [2] });
    expect(countAvailableDaysInWindow(user, '2026-03-10', '2026-03-10')).toBe(0);
  });
});

// ─── getWeekWindow ─────────────────────────────────────────────────

describe('getWeekWindow', () => {
  it('понеділок → повертає цей же тиждень Пн-Нд', () => {
    // 2026-03-09 = понеділок
    const { from, to } = getWeekWindow('2026-03-09');
    expect(from).toBe('2026-03-09');
    expect(to).toBe('2026-03-15');
  });

  it('середа → повертає правильний Пн-Нд', () => {
    // 2026-03-11 = середа
    const { from, to } = getWeekWindow('2026-03-11');
    expect(from).toBe('2026-03-09');
    expect(to).toBe('2026-03-15');
  });

  it('неділя → повертає правильний Пн-Нд', () => {
    // 2026-03-15 = неділя
    const { from, to } = getWeekWindow('2026-03-15');
    expect(from).toBe('2026-03-09');
    expect(to).toBe('2026-03-15');
  });

  it('субота → повертає правильний Пн-Нд', () => {
    // 2026-03-14 = субота
    const { from, to } = getWeekWindow('2026-03-14');
    expect(from).toBe('2026-03-09');
    expect(to).toBe('2026-03-15');
  });

  it("п'ятниця → повертає правильний Пн-Нд", () => {
    // 2026-03-13 = п'ятниця
    const { from, to } = getWeekWindow('2026-03-13');
    expect(from).toBe('2026-03-09');
    expect(to).toBe('2026-03-15');
  });
});

// ─── getDatesInRange ───────────────────────────────────────────────

describe('getDatesInRange', () => {
  it('нормальний діапазон → правильний список дат', () => {
    const dates = getDatesInRange('2026-03-09', '2026-03-12');
    expect(dates).toEqual(['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12']);
  });

  it('одна дата → масив з одного елементу', () => {
    expect(getDatesInRange('2026-03-10', '2026-03-10')).toEqual(['2026-03-10']);
  });

  it('порожній діапазон (from > to) → порожній масив', () => {
    expect(getDatesInRange('2026-03-15', '2026-03-10')).toEqual([]);
  });

  it('повний тиждень → 7 дат', () => {
    const dates = getDatesInRange('2026-03-09', '2026-03-15');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-03-09');
    expect(dates[6]).toBe('2026-03-15');
  });
});

// ─── daysSinceLastAssignment ───────────────────────────────────────

describe('daysSinceLastAssignment', () => {
  it('немає попередніх призначень → Infinity', () => {
    const schedule: Record<string, ScheduleEntry> = {};
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(Infinity);
  });

  it('є попередні призначення → правильна кількість днів', () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-07': { date: '2026-03-07', userId: 1, type: 'auto' },
    };
    // 2026-03-10 - 2026-03-07 = 3 дні
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(3);
  });

  it('кілька попередніх — рахує від останнього', () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-05': { date: '2026-03-05', userId: 1, type: 'auto' },
      '2026-03-08': { date: '2026-03-08', userId: 1, type: 'auto' },
    };
    // Останнє = 2026-03-08, різниця до 2026-03-10 = 2 дні
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(2);
  });

  it('призначення іншого бійця → Infinity для поточного', () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-08': { date: '2026-03-08', userId: 2, type: 'auto' },
    };
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(Infinity);
  });

  it('призначення масивом userId — знаходить бійця', () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-08': { date: '2026-03-08', userId: [1, 2], type: 'auto' },
    };
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(2);
  });

  it('призначення в майбутньому ігноруються', () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-03-12': { date: '2026-03-12', userId: 1, type: 'auto' },
    };
    expect(daysSinceLastAssignment(1, schedule, '2026-03-10')).toBe(Infinity);
  });
});

// ─── hasDebtBacklog ────────────────────────────────────────────────

describe('hasDebtBacklog', () => {
  it('немає боргу → false', () => {
    const user = makeUser({ debt: 0, owedDays: {} });
    expect(hasDebtBacklog(user)).toBe(false);
  });

  it("від'ємна карма → true", () => {
    const user = makeUser({ debt: -2 });
    expect(hasDebtBacklog(user)).toBe(true);
  });

  it('додатна карма, без owedDays → false', () => {
    const user = makeUser({ debt: 1, owedDays: {} });
    expect(hasDebtBacklog(user)).toBe(false);
  });

  it('owedDays > 0 → true', () => {
    const user = makeUser({ debt: 0, owedDays: { 1: 2 } });
    expect(hasDebtBacklog(user)).toBe(true);
  });

  it('owedDays = 0 для всіх днів → false', () => {
    const user = makeUser({ debt: 0, owedDays: { 1: 0, 3: 0 } });
    expect(hasDebtBacklog(user)).toBe(false);
  });

  it("від'ємна карма + owedDays → true", () => {
    const user = makeUser({ debt: -1, owedDays: { 5: 1 } });
    expect(hasDebtBacklog(user)).toBe(true);
  });
});

// ─── shouldEnforceOneDutyPerWeek ───────────────────────────────────

describe('shouldEnforceOneDutyPerWeek', () => {
  const weekDates = getDatesInRange('2026-03-09', '2026-03-15');

  const makeActiveUsers = (count: number): User[] =>
    Array.from({ length: count }, (_, i) => makeUser({ id: i + 1, name: `User${i + 1}` }));

  it('7+ доступних бійців → true', () => {
    const users = makeActiveUsers(8);
    const schedule: Record<string, ScheduleEntry> = {};
    expect(shouldEnforceOneDutyPerWeek(users, schedule, weekDates)).toBe(true);
  });

  it('<7 доступних бійців → false', () => {
    const users = makeActiveUsers(5);
    const schedule: Record<string, ScheduleEntry> = {};
    expect(shouldEnforceOneDutyPerWeek(users, schedule, weekDates)).toBe(false);
  });

  it('рівно 7 доступних → true', () => {
    const users = makeActiveUsers(7);
    const schedule: Record<string, ScheduleEntry> = {};
    expect(shouldEnforceOneDutyPerWeek(users, schedule, weekDates)).toBe(true);
  });

  it('неактивні бійці не рахуються', () => {
    // 6 активних + 2 неактивних = все одно <7 eligible
    const users = [
      ...makeActiveUsers(6),
      makeUser({ id: 7, name: 'Inactive1', isActive: false }),
      makeUser({ id: 8, name: 'Inactive2', isActive: false }),
    ];
    const schedule: Record<string, ScheduleEntry> = {};
    expect(shouldEnforceOneDutyPerWeek(users, schedule, weekDates)).toBe(false);
  });

  it('isExtra та excludeFromAuto бійці не рахуються', () => {
    const users = [
      ...makeActiveUsers(5),
      makeUser({ id: 6, name: 'Extra', isExtra: true }),
      makeUser({ id: 7, name: 'Excluded', excludeFromAuto: true }),
    ];
    const schedule: Record<string, ScheduleEntry> = {};
    expect(shouldEnforceOneDutyPerWeek(users, schedule, weekDates)).toBe(false);
  });
});

// ─── getDebtRepaymentScore ─────────────────────────────────────────

describe('getDebtRepaymentScore', () => {
  it('немає боргу → 0', () => {
    const user = makeUser({ debt: 0, owedDays: {} });
    expect(getDebtRepaymentScore(user, 1, 1.0)).toBe(0);
  });

  it('додатній борг (карма > 0) → 0', () => {
    const user = makeUser({ debt: 2, owedDays: { 1: 1 } });
    expect(getDebtRepaymentScore(user, 1, 1.0)).toBe(0);
  });

  it("від'ємний борг + owedToday > 0 → повертає score", () => {
    const user = makeUser({ debt: -3, owedDays: { 1: 2 } });
    // debtAbs=3, owedToday=2, weight=1.0 → min(3, 2*1.0) = 2
    expect(getDebtRepaymentScore(user, 1, 1.0)).toBe(2);
  });

  it("від'ємний борг + owedToday=0 → 0", () => {
    const user = makeUser({ debt: -3, owedDays: { 1: 0 } });
    expect(getDebtRepaymentScore(user, 1, 1.0)).toBe(0);
  });

  it("від'ємний борг + немає owedDays для цього дня → 0", () => {
    const user = makeUser({ debt: -3, owedDays: { 3: 2 } });
    // dayIdx=1, але owedDays тільки для 3
    expect(getDebtRepaymentScore(user, 1, 1.0)).toBe(0);
  });

  it('debt:-1, owedToday:2, weight:1.5 → min(1, 2*1.5) = 1', () => {
    const user = makeUser({ debt: -1, owedDays: { 5: 2 } });
    expect(getDebtRepaymentScore(user, 5, 1.5)).toBe(1);
  });

  it('debt:-5, owedToday:1, weight:2.0 → min(5, 1*2.0) = 2', () => {
    const user = makeUser({ debt: -5, owedDays: { 0: 1 } });
    expect(getDebtRepaymentScore(user, 0, 2.0)).toBe(2);
  });
});
