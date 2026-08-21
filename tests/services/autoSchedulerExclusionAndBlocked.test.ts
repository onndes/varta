// Tests for date-aware exclude-from-auto periods, period-aware blocked DOWs,
// and force-override fairness accounting.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AutoScheduleOptions, ScheduleEntry, User } from '@/types';
import { autoFillSchedule } from '@/services/autoScheduler';
import { isHardEligible } from '@/services/autoScheduler/swapOptimizer';
import {
  countUnavailableDaysInRange,
  buildFairnessExclusionSet,
  applyForceOverrideAccounting,
  computeGlobalObjective,
} from '@/services/autoScheduler/helpers';
import { getEffectiveBlockedDows } from '@/utils/userBlockedDays';
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

const mkUser = (id: number, name: string, extra?: Partial<User>): User => ({
  id,
  name,
  rank: 'Солдат',
  status: 'ACTIVE',
  isActive: true,
  ...extra,
});

describe('exclude-from-auto periods (date-aware)', () => {
  it('isHardEligible respects excludeFromAutoPeriods2 boundaries', () => {
    const u = mkUser(1, 'Excluded', {
      excludeFromAutoPeriods2: [{ from: '2026-08-01', to: '2026-08-15' }],
    });
    expect(isHardEligible(u, '2026-07-31')).toBe(true);
    expect(isHardEligible(u, '2026-08-01')).toBe(false);
    expect(isHardEligible(u, '2026-08-15')).toBe(false);
    expect(isHardEligible(u, '2026-08-16')).toBe(true);
  });

  it('autoFillSchedule never assigns a user during an exclusion period', async () => {
    const users: User[] = [
      mkUser(1, 'Alpha', { excludeFromAutoPeriods2: [{ from: '2026-08-01', to: '2026-12-31' }] }),
      mkUser(2, 'Bravo'),
      mkUser(3, 'Charlie'),
      mkUser(4, 'Delta'),
    ];
    const dates = [
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ];
    const options: AutoScheduleOptions = { ...DEFAULT_AUTO_SCHEDULE_OPTIONS, useMultiRestart: false };
    const updates = await autoFillSchedule(dates, users, {}, { 0: 1.2, 6: 1.6 }, 1, options);
    for (const e of updates) {
      expect(toAssignedUserIds(e.userId)).not.toContain(1);
    }
    // The other three users cover the whole week
    expect(updates.filter((e) => e.userId !== null).length).toBe(7);
  });
});

describe('period-aware blocked DOWs', () => {
  it('getEffectiveBlockedDows reads active blockedDaysPeriods', () => {
    const u = mkUser(8, 'Blocked', {
      blockedDaysPeriods: [
        { days: [1, 2, 3, 4, 7], from: '2026-01-01', to: '2026-05-02' },
        { days: [6, 7], from: '2026-05-02' },
      ],
    });
    // In June only the open-ended Sat+Sun period is active
    expect(getEffectiveBlockedDows(u, '2026-06-10')).toEqual([6, 7]);
    // In March the Mon-Thu+Sun period is active too
    expect(getEffectiveBlockedDows(u, '2026-03-10')).toEqual([1, 2, 3, 4, 7]);
  });

  it('getEffectiveBlockedDows falls back to legacy blockedDays', () => {
    const u = mkUser(9, 'Legacy', { blockedDays: [6, 7] });
    expect(getEffectiveBlockedDows(u, '2026-06-10')).toEqual([6, 7]);
  });

  it('countUnavailableDaysInRange counts blocked-day periods without status periods', () => {
    const u = mkUser(10, 'BlockedOnly', {
      blockedDaysPeriods: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '2026-06-01' }],
    });
    // Entire June is blocked → all 30 days unavailable
    expect(countUnavailableDaysInRange(u, '2026-06-01', '2026-06-30')).toBe(30);
  });
});

describe('force-override fairness accounting', () => {
  const schedule: Record<string, ScheduleEntry> = {
    '2026-08-03': { date: '2026-08-03', userId: 1, type: 'force' },
    '2026-08-04': { date: '2026-08-04', userId: 2, type: 'auto' },
    '2026-08-05': { date: '2026-08-05', userId: 3, type: 'manual', availabilityOverrideUserIds: [3] },
  };

  it('buildFairnessExclusionSet collects force and override pairs in neutral mode', () => {
    const options: AutoScheduleOptions = {
      ...DEFAULT_AUTO_SCHEDULE_OPTIONS,
      forceOverrideAccounting: 'neutral',
    };
    const set = buildFairnessExclusionSet(schedule, options);
    expect(set).toBeDefined();
    expect(set!.has('2026-08-03:1')).toBe(true);
    expect(set!.has('2026-08-05:3')).toBe(true);
    expect(set!.has('2026-08-04:2')).toBe(false);
  });

  it('buildFairnessExclusionSet returns undefined in normal mode', () => {
    expect(buildFairnessExclusionSet(schedule, DEFAULT_AUTO_SCHEDULE_OPTIONS)).toBeUndefined();
  });

  it('applyForceOverrideAccounting strips overridden assignments in neutral mode', () => {
    const options: AutoScheduleOptions = {
      ...DEFAULT_AUTO_SCHEDULE_OPTIONS,
      forceOverrideAccounting: 'neutral',
    };
    const view = applyForceOverrideAccounting(schedule, options);
    expect(view['2026-08-03']).toBeUndefined();
    expect(view['2026-08-04']).toBeDefined();
    expect(view['2026-08-05']).toBeUndefined();
    // Normal mode: same object, untouched
    expect(applyForceOverrideAccounting(schedule, DEFAULT_AUTO_SCHEDULE_OPTIONS)).toBe(schedule);
  });

  it('computeGlobalObjective ignores excluded pairs', () => {
    const users = [mkUser(1, 'A'), mkUser(2, 'B')];
    const userIds = [1, 2];
    const weights = { 0: 1, 6: 1 };
    // User 1 hoards duties via force entries; neutral accounting should see balance.
    const sched: Record<string, ScheduleEntry> = {
      '2026-08-03': { date: '2026-08-03', userId: 1, type: 'force' },
      '2026-08-04': { date: '2026-08-04', userId: 1, type: 'force' },
      '2026-08-05': { date: '2026-08-05', userId: 2, type: 'auto' },
      '2026-08-06': { date: '2026-08-06', userId: 1, type: 'auto' },
    };
    const exclusions = new Set(['2026-08-03:1', '2026-08-04:1']);
    const zWith = computeGlobalObjective(userIds, sched, weights, users, false, undefined, exclusions);
    const zWithout = computeGlobalObjective(userIds, sched, weights, users, false, undefined);
    // With exclusions both users have 1 counted duty → lower imbalance terms.
    expect(zWith).toBeLessThan(zWithout);
  });
});
