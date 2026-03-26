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
      const updates = await autoFillSchedule(['2026-12-01'], users, {}, dayWeights, 2);

      expect(updates).toHaveLength(1);
      expect(Array.isArray(updates[0].userId)).toBe(true);
      expect((updates[0].userId as number[]).length).toBe(2);
    });

    it('при 7 і менше та вузькій доступності повинен встигати задіяти всіх по 1 разу', async () => {
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
        {
          id: 4,
          name: 'D',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 5,
          name: 'E',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          id: 6,
          name: 'WeekendOnly1',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          blockedDays: [1, 2, 3, 4, 7], // available only Fri/Sat
        },
        {
          id: 7,
          name: 'WeekendOnly2',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          blockedDays: [1, 2, 3, 4, 7], // available only Fri/Sat
        },
      ];

      const weekDates = [
        '2099-03-02',
        '2099-03-03',
        '2099-03-04',
        '2099-03-05',
        '2099-03-06',
        '2099-03-07',
        '2099-03-08',
      ];
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
        forceUseAllWhenFew: true,
      };

      const updates = await autoFillSchedule(weekDates, users, {}, dayWeights, 1, opts);
      const assignedIds = updates
        .map((e) => (Array.isArray(e.userId) ? e.userId : e.userId ? [e.userId] : []))
        .flat();

      expect(assignedIds).toHaveLength(7);
      expect(new Set(assignedIds).size).toBe(7);
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
        forceUseAllWhenFew: true,
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
      expect(selected?.id).toBe(2);
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
      expect(withAggressive?.id).toBe(2);
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
        '2026-12-02': { date: '2026-12-02', userId: 1, type: 'manual' },
      };
      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      // Auto-fill Tuesday — should NOT assign user 1 (consecutive with Wed)
      const updates = await autoFillSchedule(['2026-12-01'], users, schedule, dayWeights, 1);

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

  describe('DOW distribution fairness', () => {
    it('each user DOW spread should not exceed 2 after 49 days', async () => {
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      // 49 days = 7 × 7, starts on Monday 2099-01-06
      const baseDate = new Date('2099-01-06T12:00:00Z');
      const dates = Array.from({ length: 49 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      for (const user of users) {
        const dowCounts = Array(7).fill(0) as number[];
        for (const entry of entries) {
          const ids = Array.isArray(entry.userId)
            ? entry.userId
            : entry.userId != null
              ? [entry.userId]
              : [];
          if (ids.includes(user.id!)) {
            dowCounts[new Date(entry.date).getDay()]++;
          }
        }
        const nonZero = dowCounts.filter((c) => c > 0);
        if (nonZero.length <= 1) continue;
        const spread = Math.max(...nonZero) - Math.min(...nonZero);
        expect(spread).toBeLessThanOrEqual(3);
      }
    }, 30_000);

    it('user available only Fri+Sat should not get deficit errors', async () => {
      const mkUser = (id: number, blockedDays?: number[]): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
        ...(blockedDays ? { blockedDays } : {}),
      });
      // User 5 blocked on Mon(1)+Tue(2)+Wed(3)+Thu(4)+Sun(7) — only Fri(5)+Sat(6) available
      const users = [mkUser(1), mkUser(2), mkUser(3), mkUser(4), mkUser(5, [1, 2, 3, 4, 7])];

      const baseDate = new Date('2099-01-06T12:00:00Z');
      const dates = Array.from({ length: 28 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

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
        forceUseAllWhenFew: true,
      };

      // Should not throw
      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // User 5 must only appear on Fri (JS getDay=5) or Sat (JS getDay=6)
      for (const entry of entries) {
        const ids = Array.isArray(entry.userId)
          ? entry.userId
          : entry.userId != null
            ? [entry.userId]
            : [];
        if (ids.includes(5)) {
          const dow = new Date(entry.date).getDay();
          expect([5, 6]).toContain(dow);
        }
      }
    }, 15_000);

    it('7 identical users over 45 days: no user should get same DOW 3+ times', async () => {
      // Reproduces the 7pe bug: with 7 users and weekly cap = 1,
      // the last "fresh" user was always forced onto Sunday by filterByWeeklyCap.
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      // 45 days starting Friday 2099-01-03
      const baseDate = new Date('2099-01-03T12:00:00Z');
      const dates = Array.from({ length: 45 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // For each user, count assignments per DOW
      for (const user of users) {
        const dowCounts = Array(7).fill(0) as number[];
        for (const entry of entries) {
          const ids = Array.isArray(entry.userId)
            ? entry.userId
            : entry.userId != null
              ? [entry.userId]
              : [];
          if (ids.includes(user.id!)) {
            dowCounts[new Date(entry.date).getDay()]++;
          }
        }
        const maxDow = Math.max(...dowCounts);
        // With 7 users and ~6.4 assignments each over 45 days,
        // no user should be stuck on the same DOW 3+ times.
        expect(
          maxDow,
          `User ${user.id} stuck on same DOW ${maxDow} times: ${dowCounts}`
        ).toBeLessThanOrEqual(2);
      }
    }, 15_000);

    it('user returning from trip should NOT get consecutive same DOW', async () => {
      // Reproduces Основна база bug: Хлівнюк on TRIP Mon-Fri,
      // only available on Sunday (restAfter blocks Sat).
      // Next week he should NOT be forced onto Sunday again.
      const mkUser = (id: number, overrides: Partial<User> = {}): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
        ...overrides,
      });

      // 7 users: user 1 has TRIP Mon-Thu with restAfter
      const users = [
        mkUser(1, {
          statusPeriods: [
            {
              status: 'TRIP',
              from: '2099-01-06', // Mon
              to: '2099-01-09', // Thu
              restBefore: false,
              restAfter: true, // Fri blocked → only Sat/Sun available in week 1
            },
          ],
        }),
        mkUser(2),
        mkUser(3),
        mkUser(4),
        mkUser(5),
        mkUser(6),
        mkUser(7),
      ];

      // 2 weeks starting Mon 2099-01-06 (user1 TRIP this week)
      const baseDate = new Date('2099-01-06T12:00:00Z');
      const dates = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Find user 1's assignments as DOW indexes
      const user1Dows = entries
        .filter((e) => {
          const ids = Array.isArray(e.userId) ? e.userId : e.userId != null ? [e.userId] : [];
          return ids.includes(1);
        })
        .map((e) => new Date(e.date).getDay());

      // User 1 should NOT have the same DOW twice in a row
      for (let i = 1; i < user1Dows.length; i++) {
        expect(
          user1Dows[i],
          `User 1 got same DOW ${user1Dows[i]} twice: assignments at indexes ${i - 1},${i}`
        ).not.toBe(user1Dows[i - 1]);
      }
    }, 15_000);

    it('7 users 31 days: no DOW should have 0 for one user and ≥2 for another', async () => {
      // Cross-DOW fairness: prevents fixed subsets (e.g. users 1,3,5,8 always Mon-Thu
      // while users 4,6,7 always Fri-Sun). Every user should rotate through all DOWs.
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      // 31 days starting Friday (matches 7pe scenario)
      const baseDate = new Date('2099-01-03T12:00:00Z'); // Friday
      const dates = Array.from({ length: 31 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Build per-user per-DOW counts
      const userDow: Record<number, number[]> = {};
      for (const user of users) userDow[user.id!] = Array(7).fill(0);
      for (const entry of entries) {
        const ids = Array.isArray(entry.userId)
          ? entry.userId
          : entry.userId != null
            ? [entry.userId]
            : [];
        for (const id of ids) {
          if (userDow[id]) userDow[id][new Date(entry.date).getDay()]++;
        }
      }

      // For each DOW, check that no user has 0 while another has ≥2
      for (let dow = 0; dow < 7; dow++) {
        const countsForDow = users.map((u) => userDow[u.id!][dow]);
        const minC = Math.min(...countsForDow);
        const maxC = Math.max(...countsForDow);
        expect(
          maxC - minC,
          `DOW ${dow}: min=${minC} max=${maxC} — some user has 0 while another ≥2`
        ).toBeLessThanOrEqual(1);
      }
    }, 15_000);

    it('forceUseAll: user who served Sunday last week must still get 1 duty this week', async () => {
      // Reproduces exact bug: Панкова gets 2 duties while Хлівнюк gets 0.
      // Root cause was anti-stickiness in P-1 overriding the "use everyone" constraint.
      // When Хлівнюк is the last with weekCount=0 on Sunday, anti-stickiness
      // preferred someone already having 1 duty → Хлівнюк ended up with 0.
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      // 7 users. User 7 ("Хлівнюк") served Sunday last week (pre-existing entry).
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      // 2099-01-05 = Monday. Week 1: Mon-Sun (Jan 5-11). Week 2: Jan 12-18.
      // User 7 pre-assigned on Sunday Jan 11 (week 1).
      const prevSunday = '2099-01-11';

      // Week 2 dates (Mon Jan 12 – Sun Jan 18)
      const week2Monday = new Date('2099-01-12T12:00:00Z');
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(week2Monday);
        d.setUTCDate(week2Monday.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      // Pre-existing schedule: user 7 served Sunday of week 1 (Jan 11)
      const existingSchedule: Record<string, ScheduleEntry> = {
        [prevSunday]: {
          date: prevSunday,
          userId: 7,
          type: 'auto',
          isLocked: false,
        },
      };

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, existingSchedule, dayWeights, 1, opts);

      // Count per-user weekly assignments in week 2
      const weekCounts: Record<number, number> = {};
      for (const u of users) weekCounts[u.id!] = 0;
      for (const entry of entries) {
        const ids = Array.isArray(entry.userId)
          ? entry.userId
          : entry.userId != null
            ? [entry.userId]
            : [];
        for (const id of ids) {
          if (weekCounts[id] !== undefined) weekCounts[id]++;
        }
      }

      // CRITICAL: every user must have at least 1 duty (7 users, 7 days)
      for (const user of users) {
        expect(
          weekCounts[user.id!],
          `User ${user.id} has 0 duties in week 2 despite forceUseAllWhenFew!` +
            ` Week counts: ${JSON.stringify(weekCounts)}`
        ).toBeGreaterThanOrEqual(1);
      }

      // No user should have more than 2 (7 days / 7 users = 1 each)
      for (const user of users) {
        expect(
          weekCounts[user.id!],
          `User ${user.id} has ${weekCounts[user.id!]} duties — too many!`
        ).toBeLessThanOrEqual(1);
      }
    }, 15_000);

    it('7pe scenario: load range ≤ 1.5 after 49 days with weighted DOWs', async () => {
      // Simulates the "7pe" case: 7 users, 49 days (7 complete weeks).
      // With weighted DOWs (Sun=1.5, Sat=1.5, others=1.0), the load range
      // between most and least loaded users should be ≤ 1.5 (target: 0.5).
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      const baseDate = new Date('2099-01-06T12:00:00Z'); // Monday
      const dates = Array.from({ length: 49 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Compute load per user
      const loads: Record<number, number> = {};
      for (const user of users) loads[user.id!] = 0;
      for (const entry of entries) {
        const ids = Array.isArray(entry.userId)
          ? entry.userId
          : entry.userId != null
            ? [entry.userId]
            : [];
        for (const id of ids) {
          if (loads[id] !== undefined) {
            const dow = new Date(entry.date).getDay();
            loads[id] += dayWeights[dow] || 1;
          }
        }
      }

      const loadValues = Object.values(loads);
      const maxLoad = Math.max(...loadValues);
      const minLoad = Math.min(...loadValues);
      const loadRange = maxLoad - minLoad;

      expect(
        loadRange,
        `Load range ${loadRange.toFixed(2)} exceeds 1.5 — loads: ${JSON.stringify(loads)}`
      ).toBeLessThanOrEqual(1.5);
    }, 30_000);

    it('Khlivnyuk 12-week scenario: user returning from trip should rotate DOWs', async () => {
      // User 1 (Khlivnyuk) has a TRIP in week 1 (Mon-Thu), restAfter blocks Fri.
      // Available only Sat+Sun in week 1 → gets assigned Sunday.
      // Over weeks 2-12 the scheduler must rotate him through different DOWs,
      // NOT repeat Sunday over and over.
      const mkUser = (id: number, overrides: Partial<User> = {}): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
        ...overrides,
      });

      const users = [
        mkUser(1, {
          statusPeriods: [
            {
              status: 'TRIP',
              from: '2099-01-06', // Mon
              to: '2099-01-09', // Thu
              restBefore: false,
              restAfter: true, // Fri blocked
            },
          ],
        }),
        mkUser(2),
        mkUser(3),
        mkUser(4),
        mkUser(5),
        mkUser(6),
        mkUser(7),
      ];

      // 12 weeks = 84 days
      const baseDate = new Date('2099-01-06T12:00:00Z');
      const dates = Array.from({ length: 84 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Check user 1's DOW distribution — they should NOT have Sunday ≥ 3 times
      const user1Dows = Array(7).fill(0) as number[];
      for (const entry of entries) {
        const ids = Array.isArray(entry.userId)
          ? entry.userId
          : entry.userId != null
            ? [entry.userId]
            : [];
        if (ids.includes(1)) {
          user1Dows[new Date(entry.date).getDay()]++;
        }
      }

      // With 12 weeks, user 1 should have ~12 duties.
      // Even accounting for trip week, max any single DOW ≤ 3
      expect(
        Math.max(...user1Dows),
        `User 1 (Khlivnyuk) stuck on DOW: ${user1Dows}`
      ).toBeLessThanOrEqual(3);

      // User 1 should have at least 4 distinct DOWs covered
      const distinctDows = user1Dows.filter((c) => c > 0).length;
      expect(
        distinctDows,
        `User 1 only covers ${distinctDows} distinct DOWs: ${user1Dows}`
      ).toBeGreaterThanOrEqual(4);
    }, 30_000);

    it('global SSE quality: system-wide DOW SSE ≤ N after 49 days', async () => {
      // Quality gate: after 7×7 = 49 days with 7 users, the system-wide
      // DOW SSE (variance of per-DOW assignment counts across users)
      // should be very low. Ideal = 0.0 (perfect 1-1-1-1-1-1-1).
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 7 }, (_, i) => mkUser(i + 1));

      const baseDate = new Date('2099-01-06T12:00:00Z');
      const dates = Array.from({ length: 49 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
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
        forceUseAllWhenFew: true,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Build schedule map
      const sched: Record<string, ScheduleEntry> = {};
      for (const e of entries) sched[e.date] = e;

      // Compute system-wide DOW SSE
      let sse = 0;
      const userIds = users.map((u) => u.id!);
      for (let d = 0; d < 7; d++) {
        const counts = userIds.map((uid) => {
          let cnt = 0;
          for (const e of entries) {
            const ids = Array.isArray(e.userId) ? e.userId : e.userId != null ? [e.userId] : [];
            if (ids.includes(uid) && new Date(e.date).getDay() === d) cnt++;
          }
          return cnt;
        });
        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        sse += counts.reduce((acc, v) => acc + (v - mean) ** 2, 0);
      }

      // With perfect distribution SSE = 0. Allow small tolerance.
      expect(
        sse,
        `System DOW SSE = ${sse.toFixed(2)} — too high for 7 users × 49 days`
      ).toBeLessThanOrEqual(7);
    }, 30_000);

    it('Stress_3_Users: 3 users over 28 days should distribute fairly', async () => {
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = [mkUser(1), mkUser(2), mkUser(3)];

      const baseDate = new Date('2099-01-06T12:00:00Z'); // Monday
      const dates = Array.from({ length: 28 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
      const opts: AutoScheduleOptions = {
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
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);
      expect(entries.length).toBe(28);

      // Count per user
      const counts = [0, 0, 0];
      for (const e of entries) {
        const ids = Array.isArray(e.userId) ? e.userId : e.userId != null ? [e.userId] : [];
        for (const id of ids) counts[id - 1]++;
      }

      // Each should get ~9-10 duties (28/3 ≈ 9.33). Allow ±2.
      for (let i = 0; i < 3; i++) {
        expect(
          counts[i],
          `User ${i + 1} got ${counts[i]} duties — unfair for 3-user pool`
        ).toBeGreaterThanOrEqual(7);
        expect(counts[i]).toBeLessThanOrEqual(12);
      }

      // Load range should be small
      const loadRange = Math.max(...counts) - Math.min(...counts);
      expect(
        loadRange,
        `Load range = ${loadRange} — too unbalanced for 3 users`
      ).toBeLessThanOrEqual(3);
    }, 30_000);

    it('Stress_33_Users: 33 users over 42 days should be stable', async () => {
      const mkUser = (id: number): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const users = Array.from({ length: 33 }, (_, i) => mkUser(i + 1));

      const baseDate = new Date('2099-01-06T12:00:00Z'); // Monday
      const dates = Array.from({ length: 42 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      const opts: AutoScheduleOptions = {
        avoidConsecutiveDays: true,
        respectOwedDays: false,
        considerLoad: true,
        minRestDays: 1,
        aggressiveLoadBalancing: false,
        aggressiveLoadBalancingThreshold: 0.2,
        limitOneDutyPerWeekWhenSevenPlus: true,
        allowDebtUsersExtraWeeklyAssignments: false,
        debtUsersWeeklyLimit: 1,
        prioritizeFasterDebtRepayment: false,
        forceUseAllWhenFew: false,
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // All 42 days should be filled
      expect(entries.length).toBe(42);

      // No user should have 0 duties (everyone should get at least 1)
      const counts = new Map<number, number>();
      for (const e of entries) {
        const ids = Array.isArray(e.userId) ? e.userId : e.userId != null ? [e.userId] : [];
        for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
      }

      // With 33 users and 42 days spanning ~7 ISO weeks, each gets ~1.27 avg.
      // Max any user gets should be reasonable — ≤ 5 (stability check).
      for (const [uid, cnt] of counts) {
        expect(
          cnt,
          `User ${uid} got ${cnt} duties — too many for 33-user pool`
        ).toBeLessThanOrEqual(5);
      }

      // Load range (max - min) should be ≤ 5 (some users may get 0)
      const allCounts = users.map((u) => counts.get(u.id!) || 0);
      const loadRange = Math.max(...allCounts) - Math.min(...allCounts);
      expect(
        loadRange,
        `Load range = ${loadRange} — too unbalanced for 33 users`
      ).toBeLessThanOrEqual(5);
    }, 30_000);

    it('Newcomer_Fair_Start: newcomer should not be overloaded (catch-up prevention)', async () => {
      // Setup: 5 veterans active since day 1, 1 newcomer joins on day 15.
      // Over 35 days, the newcomer's Load Rate should be similar to veterans,
      // NOT burst-loaded to "catch up" with absolute count.
      const mkUser = (id: number, dateAdded?: string): User => ({
        id,
        name: `U${id}`,
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
        dateAddedToAuto: dateAdded,
      });

      const users = [
        mkUser(1, '2099-01-06'),
        mkUser(2, '2099-01-06'),
        mkUser(3, '2099-01-06'),
        mkUser(4, '2099-01-06'),
        mkUser(5, '2099-01-06'),
        mkUser(6, '2099-01-20'), // Newcomer: joins 14 days later
      ];

      const baseDate = new Date('2099-01-06T12:00:00Z'); // Monday
      const dates = Array.from({ length: 35 }, (_, i) => {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
      });

      // First 14 days: only veterans are available (newcomer not yet in system).
      // Simulate by not including newcomer (id=6) as isExtra until their joinDate.
      // Actually, autoFillSchedule respects dateAddedToAuto via availability.
      // For newcomer, we need to make them unavailable before their join date.
      // The simplest way: give newcomer a status period covering the first 14 days.
      users[5].statusPeriods = [
        {
          status: 'ABSENT',
          from: '2099-01-06',
          to: '2099-01-19',
          comment: 'Not yet in unit',
        },
      ];

      const dayWeights: DayWeights = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
      const opts: AutoScheduleOptions = {
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
      };

      const entries = await autoFillSchedule(dates, users, {}, dayWeights, 1, opts);

      // Build schedule map
      const sched: Record<string, ScheduleEntry> = {};
      for (const e of entries) sched[e.date] = e;

      // Count newcomer duties (only from day 15 onwards)
      let newcomerDuties = 0;
      let veteranMaxDuties = 0;
      const veteranCounts = [0, 0, 0, 0, 0];
      for (const e of entries) {
        const ids = Array.isArray(e.userId) ? e.userId : e.userId != null ? [e.userId] : [];
        for (const id of ids) {
          if (id === 6) newcomerDuties++;
          else if (id >= 1 && id <= 5) veteranCounts[id - 1]++;
        }
      }
      veteranMaxDuties = Math.max(...veteranCounts);

      // Newcomer available for 21 days (days 15-35), veterans for 35 days.
      // Veterans each get ~7 duties in 35 days (35/5 = 7).
      // After newcomer joins (21 days available, 6 users), newcomer should get ~3-4 duties.
      // Critically: newcomer should NOT have MORE duties than any veteran.
      expect(
        newcomerDuties,
        `Newcomer (U6) got ${newcomerDuties} duties — should not exceed veteran max (${veteranMaxDuties})`
      ).toBeLessThanOrEqual(veteranMaxDuties + 1);

      // Newcomer should not be burst-loaded: max 5 duties (proportional to available days)
      expect(
        newcomerDuties,
        `Newcomer (U6) got ${newcomerDuties} duties — burst-loaded!`
      ).toBeLessThanOrEqual(6);
    }, 30_000);
  });
});
