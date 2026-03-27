// src/utils/scheduleValidation.ts

import type { ScheduleEntry, User, AutoScheduleOptions } from '../types';
import { toAssignedUserIds } from './assignment';
import { toLocalISO } from './dateUtils';

export interface ScheduleViolation {
  date: string; // YYYY-MM-DD
  type: 'OVERLOAD' | 'CONSECUTIVE' | 'UNDERSTAFFED';
  message: string;
  userIds?: number[];
}

export function validateScheduleAgainstSettings(
  schedule: Record<string, ScheduleEntry>,
  users: User[],
  autoScheduleOptions: AutoScheduleOptions,
  dutiesPerDay: number,
  weekDates: string[]
): ScheduleViolation[] {
  const violations: ScheduleViolation[] = [];

  const userName = (id: number): string => users.find((u) => u.id === id)?.name ?? `#${id}`;

  // ── 1. OVERLOAD ────────────────────────────────────────────────────────────
  for (const date of weekDates) {
    const entry = schedule[date];
    if (!entry) continue;
    const ids = toAssignedUserIds(entry.userId);
    if (ids.length > dutiesPerDay) {
      violations.push({
        date,
        type: 'OVERLOAD',
        message: `${date}: ${ids.length} чергових, ліміт — ${dutiesPerDay}`,
        userIds: ids,
      });
    }
  }

  // ── 2. CONSECUTIVE ────────────────────────────────────────────────────────
  if (autoScheduleOptions.avoidConsecutiveDays) {
    const minRest = autoScheduleOptions.minRestDays ?? 1;
    // Collect all duty dates per user within weekDates
    const dutyDatesByUser = new Map<number, string[]>();
    for (const date of weekDates) {
      const entry = schedule[date];
      if (!entry) continue;
      for (const uid of toAssignedUserIds(entry.userId)) {
        if (!dutyDatesByUser.has(uid)) dutyDatesByUser.set(uid, []);
        dutyDatesByUser.get(uid)!.push(date);
      }
    }

    // Track already-reported pairs to avoid duplicates
    const reported = new Set<string>();

    for (const [uid, dates] of dutyDatesByUser) {
      for (const d of dates) {
        const base = new Date(d);
        for (let offset = 1; offset <= minRest; offset++) {
          const next = new Date(base);
          next.setDate(next.getDate() + offset);
          const nextStr = toLocalISO(next);
          if (weekDates.includes(nextStr) && dutyDatesByUser.get(uid)?.includes(nextStr)) {
            const pairKey = `${uid}:${d}:${nextStr}`;
            if (!reported.has(pairKey)) {
              reported.add(pairKey);
              violations.push({
                date: d,
                type: 'CONSECUTIVE',
                message: `${userName(uid)}: наряд підряд (менше ${minRest} дн. відпочинку)`,
                userIds: [uid],
              });
            }
          }
        }
      }
    }
  }

  // ── 3. UNDERSTAFFED ──────────────────────────────────────────────────────
  if (dutiesPerDay > 1) {
    for (const date of weekDates) {
      const entry = schedule[date];
      if (!entry) continue;
      const count = toAssignedUserIds(entry.userId).length;
      if (count > 0 && count < dutiesPerDay) {
        violations.push({
          date,
          type: 'UNDERSTAFFED',
          message: `${date}: потрібно ${dutiesPerDay}, є ${count}`,
        });
      }
    }
  }

  return violations;
}
