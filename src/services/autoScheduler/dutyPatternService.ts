import type { DutyPattern, ScheduleEntry } from '../../types';
import { toLocalISO } from '../../utils/dateUtils';
import { toAssignedUserIds } from '../../utils/assignment';

type BlockRotationPhase =
  | { phase: 'duty'; dayInBlock: number }
  | { phase: 'rest'; dayInRest: number }
  | { phase: 'free' };

const hasAssignment = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): boolean => toAssignedUserIds(schedule[dateStr]?.userId).includes(userId);

const shiftDate = (dateStr: string, deltaDays: number): string => {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + deltaDays);
  return toLocalISO(date);
};

/**
 * Given a userId and a target dateStr, inspect the schedule backward
 * to determine the user's position in their current block-rotation cycle.
 *
 * Returns:
 *   { phase: 'duty', dayInBlock: number }   — user is currently in a duty block
 *                                              dayInBlock = 0-based index (0 = first day)
 *   { phase: 'rest', dayInRest: number }    — user is in a mandatory rest period
 *                                              dayInRest = 0-based index (0 = first rest day)
 *   { phase: 'free' }                       — user is not in any active cycle
 *                                              (cycle ended, or no history found)
 *
 * Looks back at most (dutyDays + restDays - 1) days to find the start of
 * the current cycle. If no duty assignment is found in that window, returns 'free'.
 */
export function getBlockRotationPhase(
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  pattern: DutyPattern
): BlockRotationPhase {
  const cycleLength = pattern.dutyDays + pattern.restDays;
  const maxLookback = Math.max(0, cycleLength - 1);

  for (let startOffset = maxLookback; startOffset >= 0; startOffset--) {
    const startDateStr = shiftDate(dateStr, -startOffset);
    if (!hasAssignment(userId, startDateStr, schedule)) continue;

    const targetOffset = startOffset;
    let isValidCycle = true;

    for (let dutyOffset = 0; dutyOffset < Math.min(pattern.dutyDays, targetOffset); dutyOffset++) {
      if (!hasAssignment(userId, shiftDate(startDateStr, dutyOffset), schedule)) {
        isValidCycle = false;
        break;
      }
    }

    if (!isValidCycle) continue;

    if (targetOffset < pattern.dutyDays) {
      return { phase: 'duty', dayInBlock: targetOffset };
    }

    if (targetOffset >= cycleLength) continue;

    for (let dutyOffset = 0; dutyOffset < pattern.dutyDays; dutyOffset++) {
      if (!hasAssignment(userId, shiftDate(startDateStr, dutyOffset), schedule)) {
        isValidCycle = false;
        break;
      }
    }
    if (!isValidCycle) continue;

    for (let restOffset = pattern.dutyDays; restOffset <= targetOffset; restOffset++) {
      if (hasAssignment(userId, shiftDate(startDateStr, restOffset), schedule)) {
        isValidCycle = false;
        break;
      }
    }
    if (!isValidCycle) continue;

    return { phase: 'rest', dayInRest: targetOffset - pattern.dutyDays };
  }

  return { phase: 'free' };
}

/**
 * Returns true if assigning userId to dateStr is permitted under block-rotation rules:
 * - If user is in phase 'duty' and dayInBlock < dutyDays - 1  → MUST assign (true)
 * - If user is in phase 'rest'                                → MUST NOT assign (false)
 * - If user is in phase 'duty' and dayInBlock === dutyDays-1  → completing block; next call is rest → true
 * - If user is in phase 'free'                                → eligible for new block (true)
 *
 * This replaces the classic minRestDays window check for block-rotation mode.
 */
export function isEligibleBlockRotation(
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  pattern: DutyPattern
): boolean {
  return getBlockRotationPhase(userId, dateStr, schedule, pattern).phase !== 'rest';
}

/**
 * Returns true if assigning userId to dateStr is REQUIRED to keep the duty block
 * intact — i.e., the user is currently in phase 'duty' and still has remaining
 * days in the block (dayInBlock < dutyDays - 1).
 *
 * Scheduler uses this to boost the user to top priority before comparator sorting.
 */
export function isBlockContinuation(
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>,
  pattern: DutyPattern
): boolean {
  const phase = getBlockRotationPhase(userId, dateStr, schedule, pattern);
  return phase.phase === 'duty' && phase.dayInBlock < pattern.dutyDays - 1;
}

/**
 * For a given totalUsers count and dutiesPerDay count, compute a suggested DutyPattern
 * that balances workload. Returns the pattern with smallest integer cycle where
 * (dutyDays / (dutyDays + restDays)) === dutiesPerDay / totalUsers, capped at dutyDays ≤ 7.
 * If no exact ratio is found, returns the nearest approximation.
 */
export function computeSuggestedPattern(totalUsers: number, dutiesPerDay: number): DutyPattern {
  const targetRatio =
    totalUsers > 0 ? Math.max(0, Math.min(1, dutiesPerDay / totalUsers)) : 0.5;

  let bestDutyDays = 1;
  let bestRestDays = 1;
  let bestCycle = Number.POSITIVE_INFINITY;
  let bestError = Number.POSITIVE_INFINITY;
  let foundExact = false;

  for (let dutyDays = 1; dutyDays <= 7; dutyDays++) {
    for (let restDays = 1; restDays <= 30; restDays++) {
      const cycle = dutyDays + restDays;
      const ratio = dutyDays / cycle;
      const error = Math.abs(ratio - targetRatio);
      const isExact = error < 1e-9;

      if (isExact) {
        if (
          !foundExact ||
          cycle < bestCycle ||
          (cycle === bestCycle && dutyDays < bestDutyDays)
        ) {
          foundExact = true;
          bestDutyDays = dutyDays;
          bestRestDays = restDays;
          bestCycle = cycle;
          bestError = error;
        }
        continue;
      }

      if (foundExact) continue;

      if (
        error < bestError - 1e-9 ||
        (Math.abs(error - bestError) < 1e-9 &&
          (cycle < bestCycle || (cycle === bestCycle && dutyDays < bestDutyDays)))
      ) {
        bestDutyDays = dutyDays;
        bestRestDays = restDays;
        bestCycle = cycle;
        bestError = error;
      }
    }
  }

  return {
    mode: 'block-rotation',
    dutyDays: bestDutyDays,
    restDays: bestRestDays,
  };
}
