// Quality harness on a real exported backup.
// Generates a 4-week window after the last schedule date and reports:
// hard-constraint violations (must be 0) + fairness metrics (informational).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutoScheduleOptions, DayWeights, ScheduleEntry, User } from '@/types';
import { autoFillSchedule } from '@/services/autoScheduler';
import { getUserAvailabilityStatus } from '@/services/userService';
import { isExcludedFromAutoOnDate } from '@/utils/userExcludeFromAuto';
import { toAssignedUserIds } from '@/utils/assignment';
import { getDatesInRange, getWeekWindow } from '@/services/autoScheduler/helpers';
import { db } from '@/db/db';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

interface BackupShape {
  users: User[];
  schedule: ScheduleEntry[];
  dayWeights: { key: string; value: DayWeights };
  autoScheduleOptions: { key: string; value: AutoScheduleOptions };
}

const loadBackup = (): BackupShape => {
  const raw = readFileSync(join(__dirname, '../fixtures/realBackup-2026-06-10.json'), 'utf-8');
  return JSON.parse(raw) as BackupShape;
};

describe('real backup: 4-week generation quality', () => {
  it('produces a schedule without hard violations and reports fairness metrics', async () => {
    const backup = loadBackup();
    const users = backup.users;
    const schedule: Record<string, ScheduleEntry> = {};
    for (const e of backup.schedule) schedule[e.date] = e;

    const dayWeights = backup.dayWeights.value;
    const options: AutoScheduleOptions = {
      ...backup.autoScheduleOptions.value,
      // Keep the run fast in CI: shrink the multi-restart budget.
      multiRestartTimeoutMs: 4000,
      enableSchedulerVisualization: false,
    };

    const sortedDates = Object.keys(schedule).sort();
    const lastDate = sortedDates[sortedDates.length - 1];
    const start = new Date(lastDate);
    start.setDate(start.getDate() + 1);
    const from = start.toISOString().slice(0, 10);
    const end = new Date(start);
    end.setDate(end.getDate() + 27);
    const to = end.toISOString().slice(0, 10);
    const targetDates = getDatesInRange(from, to);

    const updates = await autoFillSchedule(
      targetDates,
      users,
      schedule,
      dayWeights,
      1,
      options,
      false
    );

    const finalSchedule = { ...schedule };
    for (const u of updates) finalSchedule[u.date] = u;

    const userById = new Map(users.map((u) => [u.id!, u]));
    const newEntries = targetDates
      .map((d) => finalSchedule[d])
      .filter((e): e is ScheduleEntry => !!e);

    // ── Hard violations ──────────────────────────────────────────────
    const violations: string[] = [];
    for (const e of newEntries) {
      for (const uid of toAssignedUserIds(e.userId)) {
        const u = userById.get(uid);
        if (!u) {
          violations.push(`${e.date}: unknown user ${uid}`);
          continue;
        }
        const st = getUserAvailabilityStatus(u, e.date);
        if (st !== 'AVAILABLE') violations.push(`${e.date}: ${u.name} is ${st}`);
        if (isExcludedFromAutoOnDate(u, e.date))
          violations.push(`${e.date}: ${u.name} excluded from auto on this date`);
      }
    }

    // Rest-day violations (minRest from options)
    const minRest = options.avoidConsecutiveDays ? options.minRestDays || 1 : 0;
    if (minRest > 0) {
      for (const e of newEntries) {
        for (const uid of toAssignedUserIds(e.userId)) {
          for (let i = 1; i <= minRest; i++) {
            const prev = new Date(e.date);
            prev.setDate(prev.getDate() - i);
            const prevStr = prev.toISOString().slice(0, 10);
            if (toAssignedUserIds(finalSchedule[prevStr]?.userId).includes(uid)) {
              violations.push(`${e.date}: ${userById.get(uid)?.name} rest-day violation (also on ${prevStr})`);
            }
          }
        }
      }
    }

    // ── Fairness metrics (informational) ─────────────────────────────
    const totals = new Map<number, number>();
    const dowCounts = new Map<number, number[]>();
    let sameDowRepeats = 0;
    for (const e of newEntries) {
      const dow = new Date(e.date).getDay();
      for (const uid of toAssignedUserIds(e.userId)) {
        totals.set(uid, (totals.get(uid) || 0) + 1);
        if (!dowCounts.has(uid)) dowCounts.set(uid, [0, 0, 0, 0, 0, 0, 0]);
        dowCounts.get(uid)![dow]++;
        const prevWeek = new Date(e.date);
        prevWeek.setDate(prevWeek.getDate() - 7);
        const pStr = prevWeek.toISOString().slice(0, 10);
        if (toAssignedUserIds(finalSchedule[pStr]?.userId).includes(uid)) sameDowRepeats++;
      }
    }

    // Weekly balance: per week max-min across assigned users
    const weeks = new Map<string, Map<number, number>>();
    for (const e of newEntries) {
      const wk = getWeekWindow(e.date).from;
      if (!weeks.has(wk)) weeks.set(wk, new Map());
      const wm = weeks.get(wk)!;
      for (const uid of toAssignedUserIds(e.userId)) wm.set(uid, (wm.get(uid) || 0) + 1);
    }

    console.log(`\n══ Real backup quality (${from} … ${to}) ══`);
    console.log('Per-user totals in new window:');
    for (const [uid, t] of [...totals.entries()].sort((a, b) => a[0] - b[0])) {
      const u = userById.get(uid);
      console.log(
        `  ${(u?.name || String(uid)).slice(0, 26).padEnd(28)} total=${t} dow=[${dowCounts.get(uid)!.join(',')}]`
      );
    }
    console.log(`Same-DOW 7-day repeats: ${sameDowRepeats}`);
    for (const [wk, wm] of weeks) {
      const counts = [...wm.values()];
      console.log(`  week ${wk}: max-min = ${Math.max(...counts) - Math.min(...counts)} (entries: ${counts.reduce((a, b) => a + b, 0)})`);
    }
    if (violations.length > 0) {
      console.log('VIOLATIONS:');
      for (const v of violations) console.log('  ' + v);
    }

    expect(violations).toEqual([]);
  }, 120_000);
});
