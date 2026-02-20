import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/db';
import {
  applyKarmaForTransfer,
  findScheduleConflicts,
  findScheduleGaps,
  getAllSchedule,
  getScheduleByDate,
  removeAssignmentWithDebt,
  saveScheduleEntry,
  deleteScheduleEntry,
  calculateEffectiveLoad,
} from '@/services/scheduleService';
import type { ScheduleEntry, DayWeights, User } from '@/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('scheduleService', () => {
  describe('saveScheduleEntry', () => {
    it('повинен створити новий запис графіка', async () => {
      const entry: ScheduleEntry = {
        date: '2026-02-20',
        userId: 1,
        type: 'auto',
      };

      await saveScheduleEntry(entry);

      const saved = await db.schedule.get('2026-02-20');
      expect(saved).toBeDefined();
      expect(saved?.userId).toBe(1);
      expect(saved?.type).toBe('auto');
    });

    it('повинен оновити існуючий запис', async () => {
      await db.schedule.put({
        date: '2026-02-20',
        userId: 1,
        type: 'auto',
      });

      await saveScheduleEntry({
        date: '2026-02-20',
        userId: 2,
        type: 'manual',
      });

      const saved = await db.schedule.get('2026-02-20');
      expect(saved?.userId).toBe(2);
      expect(saved?.type).toBe('manual');
    });
  });

  describe('getScheduleByDate', () => {
    it('повинен повертати запис за датою', async () => {
      await db.schedule.put({
        date: '2026-02-20',
        userId: 1,
        type: 'auto',
      });

      const entry = await getScheduleByDate('2026-02-20');
      expect(entry).toBeDefined();
      expect(entry?.userId).toBe(1);
    });

    it('повинен повертати undefined для неіснуючої дати', async () => {
      const entry = await getScheduleByDate('2026-12-31');
      expect(entry).toBeUndefined();
    });
  });

  describe('getAllSchedule', () => {
    it("повинен повертати всі записи як об'єкт", async () => {
      await db.schedule.bulkPut([
        { date: '2026-02-20', userId: 1, type: 'auto' },
        { date: '2026-02-21', userId: 2, type: 'manual' },
      ]);

      const schedule = await getAllSchedule();
      expect(Object.keys(schedule)).toHaveLength(2);
      expect(schedule['2026-02-20']).toBeDefined();
      expect(schedule['2026-02-21']).toBeDefined();
    });
  });

  describe('deleteScheduleEntry', () => {
    it('повинен видалити запис', async () => {
      await db.schedule.put({
        date: '2026-02-20',
        userId: 1,
        type: 'auto',
      });

      await deleteScheduleEntry('2026-02-20');

      const entry = await db.schedule.get('2026-02-20');
      expect(entry).toBeUndefined();
    });
  });

  describe('calculateEffectiveLoad', () => {
    beforeEach(async () => {
      await db.users.add({
        id: 1,
        name: 'Test User',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
    });

    it('повинен розрахувати навантаження з вагами днів', async () => {
      const user = (await db.users.get(1))!;

      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-17': { date: '2026-02-17', userId: 1, type: 'auto' }, // ПН = 1.0
        '2026-02-21': { date: '2026-02-21', userId: 1, type: 'auto' }, // ПТ = 1.5
        '2026-02-22': { date: '2026-02-22', userId: 1, type: 'auto' }, // СБ = 2.0
      };

      const dayWeights: DayWeights = {
        0: 1.5, // НД
        1: 1.0, // ПН
        2: 1.0, // ВТ
        3: 1.0, // СР
        4: 1.0, // ЧТ
        5: 1.5, // ПТ
        6: 2.0, // СБ
      };

      const load = calculateEffectiveLoad(user, schedule, dayWeights);

      // 1.0 (ПН) + 1.5 (ПТ) + 2.0 (СБ) = 4.5
      expect(load).toBe(4.5);
    });

    it('повинен враховувати борг користувача', async () => {
      await db.users.update(1, { debt: -1.5 });
      const user = (await db.users.get(1))!;

      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-17': { date: '2026-02-17', userId: 1, type: 'auto' }, // ПН = 1.0
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

      const load = calculateEffectiveLoad(user, schedule, dayWeights);

      // 1.0 (дежурство) + (-1.5) (борг) = -0.5
      expect(load).toBe(-0.5);
    });

    it('повинен повертати 0 якщо немає дежурств', async () => {
      const user = (await db.users.get(1))!;
      const schedule: Record<string, ScheduleEntry> = {};
      const dayWeights: DayWeights = {
        0: 1.5,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.0,
        5: 1.5,
        6: 2.0,
      };

      const load = calculateEffectiveLoad(user, schedule, dayWeights);
      expect(load).toBe(0);
    });
  });

  describe('multi-slot behavior', () => {
    it('повинен знімати лише конкретного бійця в multi-slot дні', async () => {
      await db.users.bulkAdd([
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
      ]);

      await db.schedule.put({
        date: '2026-03-10',
        userId: [1, 2],
        type: 'manual',
      });

      const weights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      await removeAssignmentWithDebt('2026-03-10', 'work', weights, 2);

      const entry = await db.schedule.get('2026-03-10');
      expect(entry).toBeDefined();
      expect(entry?.userId).toBe(1);
    });

    it('повинен кидати помилку при знятті без targetUserId у multi-slot дні', async () => {
      await db.schedule.put({
        date: '2026-03-10',
        userId: [1, 2],
        type: 'manual',
      });
      const weights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      await expect(removeAssignmentWithDebt('2026-03-10', 'work', weights)).rejects.toThrow();
    });

    it('повинен знаходити конфлікт, якщо один з userId недоступний', () => {
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-10': { date: '2026-03-10', userId: [1, 2], type: 'auto' },
      };

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
          status: 'SICK',
          statusFrom: '2026-03-01',
          statusTo: '2026-03-20',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];

      const conflicts = findScheduleConflicts(schedule, users);
      expect(conflicts).toEqual(['2026-03-10']);
    });

    it('повинен вважати день прогалиною, якщо призначено менше ніж dutiesPerDay', () => {
      const schedule: Record<string, ScheduleEntry> = {
        '2026-03-10': { date: '2026-03-10', userId: [1], type: 'auto' },
      };
      const gaps = findScheduleGaps(schedule, ['2026-03-10'], 2);
      expect(gaps).toEqual(['2026-03-10']);
    });
  });

  describe('transfer karma', () => {
    it('повинен застосовувати карму за перенос на важчий день', async () => {
      await db.users.add({
        id: 1,
        name: 'Mover',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      const weights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
      // Thu -> Sat => +1.0
      await applyKarmaForTransfer(1, '2026-03-12', '2026-03-14', weights);
      const user = await db.users.get(1);
      expect(user?.debt).toBe(1);
    });
  });
});
