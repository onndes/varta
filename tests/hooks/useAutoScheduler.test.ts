import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { DayWeights, ScheduleEntry, User } from '@/types';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '@/utils/constants';
import { useAutoScheduler } from '@/hooks/useAutoScheduler';
import * as autoScheduler from '@/services/autoScheduler';
import * as scheduleService from '@/services/scheduleService';

vi.mock('@/services/autoScheduler', async () => {
  const actual = await vi.importActual<typeof import('@/services/autoScheduler')>(
    '@/services/autoScheduler'
  );
  return {
    ...actual,
    autoFillSchedule: vi.fn(),
    saveAutoSchedule: vi.fn(),
  };
});

vi.mock('@/services/scheduleService', async () => {
  const actual = await vi.importActual<typeof import('@/services/scheduleService')>(
    '@/services/scheduleService'
  );
  return {
    ...actual,
    bulkDeleteSchedule: vi.fn(),
  };
});

describe('useAutoScheduler.generateWeekSchedule', () => {
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
  ];

  const dayWeights: DayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rebuilds a fresh schedule snapshot after clearing auto entries', async () => {
    const schedule: Record<string, ScheduleEntry> = {
      '2026-04-14': { date: '2026-04-14', userId: 5, type: 'auto' },
      '2026-04-20': { date: '2026-04-20', userId: 7, type: 'manual' },
    };

    vi.mocked(scheduleService.bulkDeleteSchedule).mockResolvedValue();
    vi.mocked(autoScheduler.autoFillSchedule).mockResolvedValue([
      { date: '2026-04-14', userId: 1, type: 'auto' },
    ]);
    vi.mocked(autoScheduler.saveAutoSchedule).mockResolvedValue();

    const { result } = renderHook(() =>
      useAutoScheduler(users, schedule, dayWeights, 1, DEFAULT_AUTO_SCHEDULE_OPTIONS, false)
    );

    await act(async () => {
      await result.current.generateWeekSchedule(['2026-04-14']);
    });

    expect(scheduleService.bulkDeleteSchedule).toHaveBeenCalledWith(['2026-04-14']);
    expect(autoScheduler.autoFillSchedule).toHaveBeenCalledWith(
      ['2026-04-14'],
      users,
      { '2026-04-20': { date: '2026-04-20', userId: 7, type: 'manual' } },
      dayWeights,
      1,
      DEFAULT_AUTO_SCHEDULE_OPTIONS,
      false,
      expect.any(Function),
      expect.any(AbortSignal)
    );
    expect(autoScheduler.saveAutoSchedule).toHaveBeenCalledWith(
      [{ date: '2026-04-14', userId: 1, type: 'auto' }],
      dayWeights
    );
  });
});
