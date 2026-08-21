// Tests for the pre-generation confirmation summary builder.
import { describe, it, expect } from 'vitest';
import type { User } from '@/types';
import { buildPreGenerationSummary } from '@/utils/preGenerationSummary';

const mkUser = (id: number, name: string, extra?: Partial<User>): User => ({
  id,
  name,
  rank: 'Солдат',
  status: 'ACTIVE',
  isActive: true,
  ...extra,
});

// Mon 2026-06-15 … Sun 2026-06-21
const WEEK = [
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-20',
  '2026-06-21',
];

describe('buildPreGenerationSummary', () => {
  it('reports status periods overlapping the window', () => {
    const users = [
      mkUser(1, 'Vacation', {
        statusPeriods: [{ status: 'VACATION', from: '2026-06-18', to: '2026-06-25' }],
      }),
      mkUser(2, 'OutsideWindow', {
        statusPeriods: [{ status: 'SICK', from: '2026-07-01', to: '2026-07-10' }],
      }),
      mkUser(3, 'Clean'),
    ];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.statusOverlaps).toHaveLength(1);
    expect(summary.statusOverlaps[0]).toMatchObject({
      userName: 'Vacation',
      status: 'VACATION',
      from: '2026-06-18',
    });
    expect(summary.hasWarnings).toBe(true);
  });

  it('reports exclude-from-auto periods active on window dates', () => {
    const users = [
      mkUser(1, 'PartlyExcluded', {
        excludeFromAutoPeriods2: [{ from: '2026-06-20', to: '2026-06-21' }],
      }),
      mkUser(2, 'FullyExcluded', { excludeFromAutoPeriods2: [{ from: '2026-01-01' }] }),
      mkUser(3, 'NotExcluded'),
    ];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.excludedUsers).toHaveLength(2);
    const partly = summary.excludedUsers.find((e) => e.userName === 'PartlyExcluded');
    expect(partly?.dates).toEqual(['2026-06-20', '2026-06-21']);
    expect(partly?.coversWholeWindow).toBe(false);
    const fully = summary.excludedUsers.find((e) => e.userName === 'FullyExcluded');
    expect(fully?.coversWholeWindow).toBe(true);
  });

  it('reports blocked weekdays active inside the window', () => {
    const users = [
      mkUser(1, 'BlockedWeekend', {
        // ISO 6=Sat, 7=Sun
        blockedDaysPeriods: [{ days: [6, 7], from: '2026-01-01' }],
      }),
      mkUser(2, 'ExpiredBlock', {
        blockedDaysPeriods: [{ days: [1], from: '2026-01-01', to: '2026-05-31' }],
      }),
    ];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.blockedUsers).toHaveLength(1);
    expect(summary.blockedUsers[0].userName).toBe('BlockedWeekend');
    expect(summary.blockedUsers[0].dows).toEqual([6, 7]);
    expect(summary.blockedUsers[0].dates).toEqual(['2026-06-20', '2026-06-21']);
  });

  it('warns when the weekly eligible pool is below dutiesPerDay × 7', () => {
    const users = [mkUser(1, 'A'), mkUser(2, 'B'), mkUser(3, 'C')];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.lowPoolWeeks).toHaveLength(1);
    expect(summary.lowPoolWeeks[0]).toMatchObject({
      weekFrom: '2026-06-15',
      weekTo: '2026-06-21',
      eligibleCount: 3,
      requiredCount: 7,
    });
  });

  it('is silent when the pool is sufficient and nothing overlaps', () => {
    const users = Array.from({ length: 8 }, (_, i) => mkUser(i + 1, `U${i + 1}`));
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.statusOverlaps).toHaveLength(0);
    expect(summary.excludedUsers).toHaveLength(0);
    expect(summary.blockedUsers).toHaveLength(0);
    expect(summary.lowPoolWeeks).toHaveLength(0);
    expect(summary.hasWarnings).toBe(false);
    expect(summary.windowFrom).toBe('2026-06-15');
    expect(summary.windowTo).toBe('2026-06-21');
  });

  it('ignores inactive and extra users in the lists', () => {
    const users = [
      mkUser(1, 'Inactive', {
        isActive: false,
        statusPeriods: [{ status: 'ABSENT', from: '2026-06-15', to: '2026-06-21' }],
      }),
      mkUser(2, 'Extra', {
        isExtra: true,
        blockedDaysPeriods: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '2026-01-01' }],
      }),
      ...Array.from({ length: 8 }, (_, i) => mkUser(i + 10, `U${i}`)),
    ];
    const summary = buildPreGenerationSummary(users, {}, WEEK, 1);
    expect(summary.statusOverlaps).toHaveLength(0);
    expect(summary.blockedUsers).toHaveLength(0);
  });

  it('checks every distinct week of a multi-week window', () => {
    // Window spans two ISO weeks: Sun 2026-06-21 and Mon 2026-06-22
    const dates = ['2026-06-21', '2026-06-22'];
    const users = [mkUser(1, 'A'), mkUser(2, 'B')];
    const summary = buildPreGenerationSummary(users, {}, dates, 1);
    expect(summary.lowPoolWeeks).toHaveLength(2);
    expect(summary.lowPoolWeeks.map((w) => w.weekFrom)).toEqual(['2026-06-15', '2026-06-22']);
  });
});
