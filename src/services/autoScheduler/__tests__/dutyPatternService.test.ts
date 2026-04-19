import { describe, expect, it } from 'vitest';
import type {
  AutoScheduleOptions,
  DayWeights,
  DutyPattern,
  ScheduleEntry,
  User,
} from '../../../types';
import { autoFillSchedule } from '../scheduler';
import {
  computeSuggestedPattern,
  getBlockRotationPhase,
  isBlockContinuation,
  isEligibleBlockRotation,
} from '../dutyPatternService';

const BLOCK_PATTERN: DutyPattern = {
  mode: 'block-rotation',
  dutyDays: 4,
  restDays: 2,
};

const buildSchedule = (dates: string[], userId = 1): Record<string, ScheduleEntry> =>
  Object.fromEntries(dates.map((date) => [date, { date, userId, type: 'auto' as const }]));

describe('dutyPatternService', () => {
  it('returns duty phase for a user in the middle of a block', () => {
    const schedule = buildSchedule(['2026-01-01', '2026-01-02', '2026-01-03']);

    expect(getBlockRotationPhase(1, '2026-01-03', schedule, BLOCK_PATTERN)).toEqual({
      phase: 'duty',
      dayInBlock: 2,
    });
  });

  it('returns rest phase and blocks eligibility during mandatory rest', () => {
    const schedule = buildSchedule(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);

    expect(getBlockRotationPhase(1, '2026-01-05', schedule, BLOCK_PATTERN)).toEqual({
      phase: 'rest',
      dayInRest: 0,
    });
    expect(isEligibleBlockRotation(1, '2026-01-05', schedule, BLOCK_PATTERN)).toBe(false);
  });

  it('returns free after the cycle ends and allows starting a new block', () => {
    const schedule = buildSchedule(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);

    expect(getBlockRotationPhase(1, '2026-01-07', schedule, BLOCK_PATTERN)).toEqual({
      phase: 'free',
    });
    expect(isEligibleBlockRotation(1, '2026-01-07', schedule, BLOCK_PATTERN)).toBe(true);
  });

  it('detects block continuation and stops requiring continuation on the last duty day', () => {
    const midBlockSchedule = buildSchedule(['2026-01-01', '2026-01-02']);
    const lastDaySchedule = buildSchedule(['2026-01-01', '2026-01-02', '2026-01-03']);

    expect(isBlockContinuation(1, '2026-01-03', midBlockSchedule, BLOCK_PATTERN)).toBe(true);
    expect(isBlockContinuation(1, '2026-01-04', lastDaySchedule, BLOCK_PATTERN)).toBe(false);
  });

  it('computes a suggested pattern for a 1:1 workload ratio', () => {
    expect(computeSuggestedPattern(6, 3)).toEqual({
      mode: 'block-rotation',
      dutyDays: 1,
      restDays: 1,
    });
  });
});

describe('classic-mode regression', () => {
  it('keeps the pre-change 6-person 4-week classic output unchanged', async () => {
    const users: User[] = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      name: `U${i + 1}`,
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
      debt: 0,
      owedDays: {},
    }));

    const baseDate = new Date('2099-01-06T12:00:00Z');
    const dates = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(baseDate);
      date.setUTCDate(date.getUTCDate() + i);
      return date.toISOString().slice(0, 10);
    });

    const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    const options: AutoScheduleOptions = {
      avoidConsecutiveDays: true,
      respectOwedDays: false,
      considerLoad: true,
      minRestDays: 1,
      aggressiveLoadBalancing: false,
      aggressiveLoadBalancingThreshold: 0.2,
      limitOneDutyPerWeekWhenSevenPlus: false,
      allowDebtUsersExtraWeeklyAssignments: false,
      debtUsersWeeklyLimit: 1,
      prioritizeFasterDebtRepayment: false,
      forceUseAllWhenFew: true,
      evenWeeklyDistribution: false,
      useFirstDutyDateAsActiveFrom: true,
    };

    const result = await autoFillSchedule(dates, users, {}, dayWeights, 1, options);
    expect(result.map((entry) => [entry.date, entry.userId])).toEqual([
      ['2099-01-06', 1],
      ['2099-01-07', 2],
      ['2099-01-08', 3],
      ['2099-01-09', 4],
      ['2099-01-10', 5],
      ['2099-01-11', 6],
      ['2099-01-12', 1],
      ['2099-01-13', 2],
      ['2099-01-14', 3],
      ['2099-01-15', 4],
      ['2099-01-16', 5],
      ['2099-01-17', 6],
      ['2099-01-18', 1],
      ['2099-01-19', 2],
      ['2099-01-20', 3],
      ['2099-01-21', 4],
      ['2099-01-22', 5],
      ['2099-01-23', 6],
      ['2099-01-24', 1],
      ['2099-01-25', 2],
      ['2099-01-26', 3],
      ['2099-01-27', 4],
      ['2099-01-28', 5],
      ['2099-01-29', 6],
      ['2099-01-30', 1],
      ['2099-01-31', 2],
      ['2099-02-01', 3],
      ['2099-02-02', 4],
    ]);
  });
});

describe('block-rotation scheduling integration', () => {
  it('keeps the same user on the final day of a duty block', async () => {
    const users: User[] = [
      {
        id: 1,
        name: 'U1',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      },
      {
        id: 2,
        name: 'U2',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      },
    ];

    const dates = ['2099-03-01', '2099-03-02', '2099-03-03', '2099-03-04'];
    const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
    const options: AutoScheduleOptions = {
      avoidConsecutiveDays: true,
      respectOwedDays: false,
      considerLoad: true,
      minRestDays: 1,
      aggressiveLoadBalancing: false,
      aggressiveLoadBalancingThreshold: 0.2,
      limitOneDutyPerWeekWhenSevenPlus: false,
      allowDebtUsersExtraWeeklyAssignments: false,
      debtUsersWeeklyLimit: 1,
      prioritizeFasterDebtRepayment: false,
      forceUseAllWhenFew: false,
      evenWeeklyDistribution: false,
      useFirstDutyDateAsActiveFrom: true,
      lookaheadDepth: 0,
      useTabuSearch: false,
      useMultiRestart: false,
      dutyPattern: {
        mode: 'block-rotation',
        dutyDays: 2,
        restDays: 1,
      },
    };

    const result = await autoFillSchedule(dates, users, {}, dayWeights, 1, options);

    expect(result.map((entry) => [entry.date, entry.userId])).toEqual([
      ['2099-03-01', 1],
      ['2099-03-02', 1],
      ['2099-03-03', 2],
      ['2099-03-04', 2],
    ]);
  });
});
