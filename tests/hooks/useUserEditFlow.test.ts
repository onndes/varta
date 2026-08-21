// Регресія: нові поля картки бійця мають доходити до БД.
// saveEditedUser пише явний список полів, тож будь-яке нове поле легко забути.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { User } from '@/types';
import { useUserEditFlow } from '@/hooks/useUserEditFlow';
import * as userService from '@/services/userService';
import { db } from '@/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

const baseUser: User = {
  name: 'Тестовий Боєць',
  rank: 'Солдат',
  status: 'ACTIVE',
  isActive: true,
};

const renderFlow = () =>
  renderHook(() =>
    useUserEditFlow({
      schedule: {},
      updateCascadeTrigger: vi.fn(async () => {}),
      refreshData: vi.fn(async () => {}),
      logAction: vi.fn(async () => {}),
    })
  );

describe('useUserEditFlow.saveEditedUser', () => {
  it('зберігає роль штатного чергового та його тижневу норму', async () => {
    const id = await db.users.add({ ...baseUser });
    const { result } = renderFlow();

    await act(async () => {
      result.current.handleStartEdit({ ...baseUser, id: id as number });
    });
    await act(async () => {
      result.current.setEditingUser({
        ...baseUser,
        id: id as number,
        isStaffDuty: true,
        staffWeeklyTarget: 4,
      });
    });
    await act(async () => {
      await result.current.handleSaveDirectly();
    });

    const saved = await userService.getUserById(id as number);
    expect(saved?.isStaffDuty).toBe(true);
    expect(saved?.staffWeeklyTarget).toBe(4);
  });

  it('вимкнення ролі прибирає й норму', async () => {
    const id = await db.users.add({ ...baseUser, isStaffDuty: true, staffWeeklyTarget: 4 });
    const { result } = renderFlow();

    await act(async () => {
      result.current.handleStartEdit({ ...baseUser, id: id as number, isStaffDuty: true });
    });
    await act(async () => {
      result.current.setEditingUser({ ...baseUser, id: id as number, isStaffDuty: false });
    });
    await act(async () => {
      await result.current.handleSaveDirectly();
    });

    const saved = await userService.getUserById(id as number);
    expect(saved?.isStaffDuty).toBe(false);
    expect(saved?.staffWeeklyTarget).toBeUndefined();
  });
});
