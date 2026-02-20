import { describe, it, expect } from 'vitest';
import type { DayWeights, ScheduleEntry, User } from '@/types';
import { calculateOptimalAssignment } from '@/services/autoScheduler';

describe('autoScheduler', () => {
  describe('calculateOptimalAssignment', () => {
    it('не повинен змушувати наздоганяти після службової відсутності', () => {
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

      // First day after status window. Bravo should not get forced "catch-up" priority.
      const selected = calculateOptimalAssignment('2026-03-01', users, schedule, dayWeights);
      expect(selected?.id).toBe(1);
    });
  });
});
