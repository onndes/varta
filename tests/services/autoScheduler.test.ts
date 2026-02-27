import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AutoScheduleOptions, DayWeights, ScheduleEntry, User } from '@/types';
import { autoFillSchedule, calculateOptimalAssignment } from '@/services/autoScheduler';
import { db } from '@/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('autoScheduler', () => {
  describe('calculateOptimalAssignment', () => {
    it('повинен враховувати доступність без перезапуску обліку після відсутності', () => {
      const users: User[] = [
        {
          id: 1,
          name: 'Alpha',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'Bravo',
          rank: 'Солдат',
          status: 'TRIP',
          statusFrom: '2026-02-20',
          statusTo: '2026-02-28',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];

      // Historical duties before Bravo returns.
      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-10': { date: '2026-02-10', userId: 1, type: 'auto' },
        '2026-02-12': { date: '2026-02-12', userId: 1, type: 'auto' },
        '2026-02-18': { date: '2026-02-18', userId: 1, type: 'auto' },
      };

      const dayWeights: DayWeights = {
        0: 1.5,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.0,
        5: 1.5,
        6: 2.0,
      };

      // First day after status window: candidate with lower normalized load can be selected.
      const selected = calculateOptimalAssignment('2026-03-01', users, schedule, dayWeights);
      expect(selected?.id).toBe(2);
    });
  });

  describe('autoFillSchedule with perDay', () => {
    it('повинен ставити кількох чергових на день при dutiesPerDay=2', async () => {
      const users: User[] = [
        {
          id: 1,
          name: 'A',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'B',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 3,
          name: 'C',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];

      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      const updates = await autoFillSchedule(['2026-03-15'], users, {}, dayWeights, 2);

      expect(updates).toHaveLength(1);
      expect(Array.isArray(updates[0].userId)).toBe(true);
      expect((updates[0].userId as number[]).length).toBe(2);
    });
  });

  describe('priority soft rules', () => {
    it('повинен віддавати пріоритет менш завантаженому в поточному тижні', async () => {
      const users: User[] = [
        {
          id: 1,
          name: 'A',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'B',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' }, // same week
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-11', users, schedule, dayWeights);
      expect(selected?.id).toBe(2);
    });

    it('повинен віддавати tie-break тому, хто довше не чергував', async () => {
      const users: User[] = [
        {
          id: 1,
          name: 'A',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'B',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-01': { date: '2026-03-01', userId: 2, type: 'auto' },
        '2026-03-10': { date: '2026-03-10', userId: 1, type: 'auto' }, // more recent
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-12', users, schedule, dayWeights);
      expect(selected?.id).toBe(2);
    });

    it('при 7+ доступних бійцях повинен спочатку ставити тих, хто ще не чергував у тижні', () => {
      const users: User[] = Array.from({ length: 7 }, (_, idx) => ({
        id: idx + 1,
        name: `U${idx + 1}`,
        rank: 'Солдат',
        status: 'ACTIVE' as const,
        isActive: true,
        debt: 0,
        owedDays: {},
      }));

      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-10', users, schedule, dayWeights);
      expect(selected?.id).not.toBe(1);
    });

    it('повинен робити fallback, якщо всі доступні вже мають чергування в тижні', () => {
      const users: User[] = Array.from({ length: 7 }, (_, idx) => ({
        id: idx + 1,
        name: `U${idx + 1}`,
        rank: 'Солдат',
        status: 'ACTIVE' as const,
        isActive: true,
        debt: 0,
        owedDays: {},
      }));

      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
        '2026-03-10': { date: '2026-03-10', userId: 2, type: 'auto' },
        '2026-03-11': { date: '2026-03-11', userId: 3, type: 'auto' },
        '2026-03-12': { date: '2026-03-12', userId: 4, type: 'auto' },
        '2026-03-13': { date: '2026-03-13', userId: 5, type: 'auto' },
        '2026-03-14': { date: '2026-03-14', userId: 6, type: 'auto' },
        '2026-03-15': { date: '2026-03-15', userId: 7, type: 'auto' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-15', users, schedule, dayWeights);
      expect(selected).toBeTruthy();
    });

    it('для бійця з боргом дозволяє >1 чергування на тиждень (за налаштуванням)', () => {
      const users: User[] = Array.from({ length: 7 }, (_, idx) => ({
        id: idx + 1,
        name: `U${idx + 1}`,
        rank: 'Солдат',
        status: 'ACTIVE' as const,
        isActive: true,
        debt: idx === 0 ? -2 : 0,
        owedDays: idx === 0 ? ({ 0: 1 } as Record<number, number>) : ({} as Record<number, number>),
      }));

      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-09': { date: '2026-03-09', userId: 1, type: 'auto' },
        '2026-03-10': { date: '2026-03-10', userId: 2, type: 'auto' },
        '2026-03-11': { date: '2026-03-11', userId: 3, type: 'auto' },
        '2026-03-12': { date: '2026-03-12', userId: 4, type: 'auto' },
        '2026-03-13': { date: '2026-03-13', userId: 5, type: 'auto' },
        '2026-03-14': { date: '2026-03-14', userId: 6, type: 'auto' },
        '2026-03-15': { date: '2026-03-15', userId: 7, type: 'auto' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      const opts: AutoScheduleOptions = {
        avoidConsecutiveDays: true,
        respectOwedDays: true,
        considerLoad: true,
        minRestDays: 1,
        aggressiveLoadBalancing: false,
        aggressiveLoadBalancingThreshold: 0.2,
        limitOneDutyPerWeekWhenSevenPlus: true,
        allowDebtUsersExtraWeeklyAssignments: true,
        debtUsersWeeklyLimit: 3,
        prioritizeFasterDebtRepayment: true,
      };

      const selected = calculateOptimalAssignment('2026-03-15', users, schedule, dayWeights, opts);
      expect(selected?.id).toBe(1);
    });

    it('за пріоритету погашення карми обирає того, кому вигідніше гасити борг', () => {
      const users: User[] = [
        {
          id: 1,
          name: 'Debt Heavy',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: -3,
          owedDays: { 6: 2 },
        },
        {
          id: 2,
          name: 'Debt Light',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: -1,
          owedDays: { 6: 1 },
        },
      ];

      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-10': { date: '2026-03-10', userId: 1, type: 'auto' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      const opts: AutoScheduleOptions = {
        avoidConsecutiveDays: true,
        respectOwedDays: true,
        considerLoad: true,
        minRestDays: 1,
        aggressiveLoadBalancing: false,
        aggressiveLoadBalancingThreshold: 0.2,
        limitOneDutyPerWeekWhenSevenPlus: false,
        allowDebtUsersExtraWeeklyAssignments: true,
        debtUsersWeeklyLimit: 3,
        prioritizeFasterDebtRepayment: true,
        forceUseAllWhenFew: true,
      };

      const selected = calculateOptimalAssignment('2026-03-14', users, schedule, dayWeights, opts);
      expect(selected?.id).toBe(1);
    });

    it('жорсткий баланс ON/OFF реально міняє вибір при великій різниці навантаження', () => {
      const users: User[] = [
        {
          id: 1,
          name: 'LowLoad',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'HighLoad',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-01': { date: '2026-03-01', userId: 2, type: 'auto' },
        '2026-03-02': { date: '2026-03-02', userId: 2, type: 'auto' },
        '2026-03-03': { date: '2026-03-03', userId: 2, type: 'auto' },
        '2026-03-10': { date: '2026-03-10', userId: 1, type: 'auto' }, // week soft rule would prefer user2 on 03-12
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const optsOff: AutoScheduleOptions = {
        avoidConsecutiveDays: true,
        respectOwedDays: true,
        considerLoad: true,
        minRestDays: 1,
        aggressiveLoadBalancing: false,
        aggressiveLoadBalancingThreshold: 0.2,
        limitOneDutyPerWeekWhenSevenPlus: false,
        allowDebtUsersExtraWeeklyAssignments: true,
        debtUsersWeeklyLimit: 3,
        prioritizeFasterDebtRepayment: false,
        forceUseAllWhenFew: true,
      };
      const optsOn: AutoScheduleOptions = { ...optsOff, aggressiveLoadBalancing: true };

      const withoutAggressive = calculateOptimalAssignment(
        '2026-03-12',
        users,
        schedule,
        dayWeights,
        optsOff
      );
      const withAggressive = calculateOptimalAssignment(
        '2026-03-12',
        users,
        schedule,
        dayWeights,
        optsOn
      );

      expect(withoutAggressive?.id).toBe(2);
      expect(withAggressive?.id).toBe(1);
    });
  });

  describe('forward rest-day check (BUG FIX)', () => {
    it('не повинен ставити бійця на день перед існуючим призначенням (підряд)', async () => {
      const users: User[] = [
        {
          id: 1,
          name: 'A',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 2,
          name: 'B',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];

      // User 1 already assigned on Wednesday (manual)
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-11': { date: '2026-03-11', userId: 1, type: 'manual' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      // Auto-fill Tuesday — should NOT assign user 1 (consecutive with Wed)
      const updates = await autoFillSchedule(['2026-03-10'], users, schedule, dayWeights, 1);

      expect(updates).toHaveLength(1);
      // Should pick user 2 (A has Wed manual, so Tue would be consecutive)
      expect(updates[0].userId).toBe(2);
    });
  });

  describe('calculateOptimalAssignment filters (BUG FIX)', () => {
    it('не повинен пропонувати isExtra бійця як оптимального', () => {
      const users: User[] = [
        {
          id: 1,
          name: 'Extra',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          isExtra: true,
        },
        {
          id: 2,
          name: 'Normal',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-10', users, {}, dayWeights);
      expect(selected?.id).toBe(2);
    });

    it('не повинен пропонувати excludeFromAuto бійця як оптимального', () => {
      const users: User[] = [
        {
          id: 1,
          name: 'Excluded',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          excludeFromAuto: true,
        },
        {
          id: 2,
          name: 'Normal',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const selected = calculateOptimalAssignment('2026-03-10', users, {}, dayWeights);
      expect(selected?.id).toBe(2);
    });
  });
});
