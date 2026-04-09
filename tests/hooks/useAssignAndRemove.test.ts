import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { db } from '@/db/db';
import { useAssignAndRemove } from '@/hooks/useAssignAndRemove';
import type { DayWeights, User } from '@/types';
import * as settingsService from '@/services/settingsService';
import * as auditService from '@/services/auditService';

describe('useAssignAndRemove', () => {
  const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };
  const users: User[] = [
    {
      id: 1,
      name: 'Blocked User',
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
      debt: 0,
      owedDays: {},
      blockedDays: [1],
    },
  ];

  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.spyOn(settingsService, 'getKarmaOnManualChanges').mockResolvedValue(false);
    vi.spyOn(auditService, 'logAction').mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
  });

  it('does not auto-acknowledge a blocked history assignment just because force mode is enabled', async () => {
    const { result } = renderHook(() =>
      useAssignAndRemove({
        users,
        dayWeights,
        schedule: {},
      })
    );

    await act(async () => {
      await result.current.assignUser('2026-04-13', 1, true, {
        historyMode: true,
        isForced: true,
      });
    });

    const saved = await db.schedule.get('2026-04-13');
    expect(saved?.type).toBe('history');
    expect(saved?.isAvailabilityOverride).toBeUndefined();
    expect(saved?.availabilityOverrideUserIds).toBeUndefined();
  });

  it('preserves existing acknowledged override ids that still remain assigned', async () => {
    await db.schedule.put({
      date: '2026-04-13',
      userId: [1, 2],
      type: 'history',
      availabilityOverrideUserIds: [1],
    });

    const usersWithThird: User[] = [
      ...users,
      {
        id: 2,
        name: 'Second User',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      },
      {
        id: 3,
        name: 'Third User',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      },
    ];

    const { result } = renderHook(() =>
      useAssignAndRemove({
        users: usersWithThird,
        dayWeights,
        schedule: {
          '2026-04-13': {
            date: '2026-04-13',
            userId: [1, 2],
            type: 'history',
            availabilityOverrideUserIds: [1],
          },
        },
      })
    );

    await act(async () => {
      await result.current.assignUser('2026-04-13', 3, true, {
        historyMode: true,
      });
    });

    const saved = await db.schedule.get('2026-04-13');
    expect(saved?.userId).toEqual([1, 2, 3]);
    expect(saved?.isAvailabilityOverride).toBeUndefined();
    expect(saved?.availabilityOverrideUserIds).toEqual([1]);
  });
});
