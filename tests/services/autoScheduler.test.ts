import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DayWeights, ScheduleEntry, User } from '@/types';
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
        { id: 1, name: 'A', rank: 'Солдат', status: 'ACTIVE', isActive: true, debt: 0, owedDays: {} },
        { id: 2, name: 'B', rank: 'Солдат', status: 'ACTIVE', isActive: true, debt: 0, owedDays: {} },
        { id: 3, name: 'C', rank: 'Солдат', status: 'ACTIVE', isActive: true, debt: 0, owedDays: {} },
      ];

      const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      const updates = await autoFillSchedule(
        ['2026-03-15'],
        users,
        {},
        dayWeights,
        2
      );

      expect(updates).toHaveLength(1);
      expect(Array.isArray(updates[0].userId)).toBe(true);
      expect((updates[0].userId as number[]).length).toBe(2);
    });
  });
});
