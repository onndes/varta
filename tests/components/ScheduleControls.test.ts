import { describe, it, expect } from 'vitest';
import { canStopSchedulerAtProgress } from '@/components/schedule/ScheduleControls';

describe('canStopSchedulerAtProgress', () => {
  it('returns false before Multi-Restart/LNS phase', () => {
    expect(canStopSchedulerAtProgress({ phase: 'Pass 2: swaps', percent: 40 })).toBe(false);
  });

  it('returns false during early Multi-Restart attempts', () => {
    expect(
      canStopSchedulerAtProgress({
        phase: 'Multi-Restart (спроба 250, покращень: 0)',
        percent: 4,
      })
    ).toBe(false);
  });

  it('returns true once Multi-Restart passes 250 attempts', () => {
    expect(
      canStopSchedulerAtProgress({
        phase: 'Multi-Restart (спроба 251, покращень: 0)',
        percent: 5,
      })
    ).toBe(true);
  });

  it('returns true once LNS passes 250 attempts', () => {
    expect(
      canStopSchedulerAtProgress({
        phase: 'LNS (спроба 400, покращень: 3)',
        percent: 22,
      })
    ).toBe(true);
  });
});
