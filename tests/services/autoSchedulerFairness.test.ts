import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AutoScheduleOptions, DayWeights, ScheduleEntry, User } from '@/types';
import { autoFillSchedule } from '@/services/autoScheduler';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '@/utils/constants';
import { toAssignedUserIds } from '@/utils/assignment';
import { db } from '@/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

/**
 * Regression test: when evenWeeklyDistribution=ON disables the starvation
 * exception in filterBySameWeekdayLastWeek, a zero-duty user whose only
 * remaining slot in the week is the same DOW they served last week would be
 * permanently filtered out. The greedy pass then assigned another user twice.
 *
 * The fix adds a "fairness recovery" step after all filters in the greedy pass
 * that re-admits zero-duty users from hardPool when soft filters removed them all.
 * The swap optimizer Phase 2 guard was also strengthened to check max-min imbalance
 * across all week-eligible participants instead of just the swapped pair.
 */
describe('autoScheduler fairness', () => {
  // 7 users — exactly at MIN_USERS_FOR_WEEKLY_LIMIT threshold
  const mkUser = (id: number, name: string, extra?: Partial<User>): User => ({
    id,
    name,
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    debt: 0,
    owedDays: {},
    ...extra,
  });

  const dayWeights: DayWeights = { 0: 1.3, 6: 1.7 };

  it('should not double-assign when zero-duty user is filtered by sameWeekdayLastWeek', async () => {
    // Setup: 7 active users, 1 sick (excluded by hard eligibility)
    const users: User[] = [
      mkUser(1, 'Alpha'),
      mkUser(2, 'Bravo', { status: 'SICK', statusFrom: '2026-04-01', statusTo: '2026-04-30' }),
      mkUser(3, 'Charlie'),
      mkUser(5, 'Delta'),
      mkUser(6, 'Echo'),
      mkUser(7, 'Foxtrot'),
      mkUser(9, 'Golf'),
      mkUser(10, 'Hotel'),
    ];

    // Previous week (week 15): each user served on a different day.
    // Alpha served on Sunday (04-12) — this means sameWeekdayLastWeek
    // will filter Alpha from Sunday 04-19 of week 16.
    const schedule: Record<string, ScheduleEntry> = {
      '2026-04-06': { date: '2026-04-06', userId: 5, type: 'auto' }, // Mon
      '2026-04-07': { date: '2026-04-07', userId: 3, type: 'auto' }, // Tue
      '2026-04-08': { date: '2026-04-08', userId: 9, type: 'auto' }, // Wed
      '2026-04-09': { date: '2026-04-09', userId: 6, type: 'auto' }, // Thu
      '2026-04-10': { date: '2026-04-10', userId: 10, type: 'auto' }, // Fri
      '2026-04-11': { date: '2026-04-11', userId: 7, type: 'auto' }, // Sat
      '2026-04-12': { date: '2026-04-12', userId: 1, type: 'auto' }, // Sun — Alpha
    };

    const week16Dates = [
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
      '2026-04-19',
    ];

    const options: AutoScheduleOptions = {
      ...DEFAULT_AUTO_SCHEDULE_OPTIONS,
      avoidConsecutiveDays: true,
      minRestDays: 2,
      limitOneDutyPerWeekWhenSevenPlus: true,
      forceUseAllWhenFew: true,
      evenWeeklyDistribution: true,
      considerLoad: true,
    };

    const result = await autoFillSchedule(
      week16Dates,
      users,
      schedule,
      dayWeights,
      1,
      options,
      false
    );

    // Count duties per user in week 16
    const counts: Record<number, number> = {};
    for (const entry of result) {
      for (const id of toAssignedUserIds(entry.userId)) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    // All 7 eligible users (everyone except Bravo=2 who is SICK) should have 1 duty
    const eligibleIds = [1, 3, 5, 6, 7, 9, 10];
    for (const id of eligibleIds) {
      expect(counts[id] ?? 0, `User ${id} should have exactly 1 duty`).toBe(1);
    }
    // Bravo (SICK) should have 0
    expect(counts[2] ?? 0).toBe(0);
  });

  it('swap optimizer should not create weekly imbalance via indirect swaps', async () => {
    // 5 users, 7 days — some users must get 2 duties.
    // The swap optimizer should maintain even distribution (no user at 0 while another at 3).
    const users: User[] = [
      mkUser(1, 'Alpha'),
      mkUser(2, 'Bravo'),
      mkUser(3, 'Charlie'),
      mkUser(4, 'Delta'),
      mkUser(5, 'Echo'),
    ];

    // No prior schedule
    const schedule: Record<string, ScheduleEntry> = {};

    const week16Dates = [
      '2026-04-13',
      '2026-04-14',
      '2026-04-15',
      '2026-04-16',
      '2026-04-17',
      '2026-04-18',
      '2026-04-19',
    ];

    const options: AutoScheduleOptions = {
      ...DEFAULT_AUTO_SCHEDULE_OPTIONS,
      avoidConsecutiveDays: true,
      minRestDays: 1,
      limitOneDutyPerWeekWhenSevenPlus: true,
      forceUseAllWhenFew: true,
      evenWeeklyDistribution: true,
      considerLoad: true,
    };

    const result = await autoFillSchedule(
      week16Dates,
      users,
      schedule,
      dayWeights,
      1,
      options,
      false
    );

    const counts: Record<number, number> = {};
    for (const entry of result) {
      for (const id of toAssignedUserIds(entry.userId)) {
        counts[id] = (counts[id] || 0) + 1;
      }
    }

    // 7 days / 5 users → each user should have 1 or 2 duties (even distribution)
    const values = Object.values(counts);
    const maxCount = Math.max(...values);
    const minCount = Math.min(...values);
    expect(maxCount - minCount, 'Max-min weekly duty gap should be ≤ 1').toBeLessThanOrEqual(1);
    // All 5 users must be assigned
    expect(Object.keys(counts).length).toBe(5);
  });
});
