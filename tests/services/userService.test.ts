import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/db';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  resetUserDebt,
  isUserAvailable,
  updateUserDebt,
} from '@/services/userService';
import type { User, ScheduleEntry } from '@/types';

// Очищення БД перед кожним тестом
beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('userService', () => {
  describe('createUser', () => {
    it('повинен створити нового користувача', async () => {
      const newUser: Omit<User, 'id'> = {
        name: 'Тестовий Користувач',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const id = await createUser(newUser);

      expect(id).toBeDefined();
      expect(id).toBeGreaterThan(0);

      const user = await db.users.get(id!);
      expect(user).toBeDefined();
      expect(user?.name).toBe('Тестовий Користувач');
      expect(user?.rank).toBe('Солдат');
      expect(user?.status).toBe('ACTIVE');
    });

    it('повинен створити користувача з мінімальними даними', async () => {
      const id = await createUser({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      const user = await db.users.get(id!);
      expect(user).toBeDefined();
    });
  });

  describe('getAllUsers', () => {
    it('повинен повертати всіх користувачів', async () => {
      await db.users.bulkAdd([
        { name: 'User 1', rank: 'Солдат', status: 'ACTIVE', isActive: true, debt: 0, owedDays: {} },
        {
          name: 'User 2',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ]);

      const users = await getAllUsers();
      expect(users).toHaveLength(2);
    });

    it('повинен повертати пустий масив якщо немає користувачів', async () => {
      const users = await getAllUsers();
      expect(users).toEqual([]);
    });
  });

  describe('getUserById', () => {
    it('повинен повертати користувача за ID', async () => {
      const id = await db.users.add({
        name: 'Test User',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      const user = await getUserById(id!);
      expect(user).toBeDefined();
      expect(user?.name).toBe('Test User');
    });

    it('повинен повертати undefined для неіснуючого ID', async () => {
      const user = await getUserById(999);
      expect(user).toBeUndefined();
    });
  });

  describe('updateUser', () => {
    it('повинен оновити дані користувача', async () => {
      const id = await db.users.add({
        name: 'Original Name',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      await updateUser(id!, { name: 'Updated Name', debt: 1.5 });

      const user = await db.users.get(id!);
      expect(user?.name).toBe('Updated Name');
      expect(user?.debt).toBe(1.5);
    });

    it('повинен частково оновлювати дані', async () => {
      const id = await db.users.add({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      await updateUser(id!, { debt: 2.0 });

      const user = await db.users.get(id!);
      expect(user?.name).toBe('Test'); // Незмінено
      expect(user?.debt).toBe(2.0); // Оновлено
    });
  });

  describe('deleteUser', () => {
    it('повинен видалити користувача', async () => {
      const id = await db.users.add({
        name: 'To Delete',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      await deleteUser(id!);

      const user = await db.users.get(id!);
      expect(user).toBeUndefined();
    });
  });

  describe('resetUserDebt', () => {
    it('повинен скинути борг користувача до 0', async () => {
      const id = await db.users.add({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 5.5,
        owedDays: {},
      });

      await resetUserDebt(id!);

      const user = await db.users.get(id!);
      expect(user?.debt).toBe(0);
    });
  });

  describe('isUserAvailable', () => {
    it('повинен повертати false для неактивного користувача', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: false,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-20', {});
      expect(available).toBe(false);
    });

    it('повинен повертати false для користувача на відпустці', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'VACATION',
        statusFrom: '2026-02-19',
        statusTo: '2026-02-25',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-20', {});
      expect(available).toBe(false);
    });

    it('повинен повертати false для командировки', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'TRIP',
        statusFrom: '2026-02-19',
        statusTo: '2026-02-25',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-22', {});
      expect(available).toBe(false);
    });

    it('повинен повертати true для активного користувача без статусу', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-20', {});
      expect(available).toBe(true);
    });

    it('повинен перевіряти день відпочинку після дежурства', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-19': {
          date: '2026-02-19',
          userId: 1,
          type: 'auto',
        },
      };

      // День після дежурства - недоступний
      const available = isUserAvailable(user, '2026-02-20', schedule);
      expect(available).toBe(false);
    });

    it('повинен перевіряти заблоковані дні тижня', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
        blockedDays: [6], // Субота заблокована
      };

      // 2026-02-21 = Субота
      const available = isUserAvailable(user, '2026-02-21', {});
      expect(available).toBe(false);
    });
  });

  describe('updateUserDebt', () => {
    it('повинен додати до боргу', async () => {
      const id = await db.users.add({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 1.0,
        owedDays: {},
      });

      await updateUserDebt(id!, 1.5);

      const user = await db.users.get(id!);
      expect(user?.debt).toBe(2.5);
    });

    it('повинен віднімати від боргу', async () => {
      const id = await db.users.add({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 3.0,
        owedDays: {},
      });

      await updateUserDebt(id!, -1.5);

      const user = await db.users.get(id!);
      expect(user?.debt).toBe(1.5);
    });

    it('повинен обмежувати максимальний негативний борг', async () => {
      const id = await db.users.add({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: -3.0,
        owedDays: {},
      });

      await updateUserDebt(id!, -10.0); // Намагаємось додати багато

      const user = await db.users.get(id!);
      expect(user?.debt).toBeGreaterThanOrEqual(-4.0); // MAX_DEBT = 4.0
    });
  });

  describe('deleteUser — multi-slot safety', () => {
    it('повинен видалити лише конкретного бійця з multi-slot запису, залишивши інших', async () => {
      const idA = await db.users.add({
        name: 'A',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });
      const idB = await db.users.add({
        name: 'B',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      // Future multi-slot entry
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 10);
      await db.schedule.put({
        date: dateStr,
        userId: [idA!, idB!],
        type: 'auto',
      });

      await deleteUser(idA!);

      const entry = await db.schedule.get(dateStr);
      expect(entry).toBeDefined();
      expect(entry?.userId).toBe(idB!); // B remains, single value
    });

    it('повинен видалити запис повністю, якщо це єдиний боєць', async () => {
      const id = await db.users.add({
        name: 'Solo',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 10);
      await db.schedule.put({
        date: dateStr,
        userId: id!,
        type: 'auto',
      });

      await deleteUser(id!);

      const entry = await db.schedule.get(dateStr);
      expect(entry).toBeUndefined();
    });
  });
});
