// src/utils/statsReset.ts — «обнулення» статистики бійця з обраної дати.
//
// М'який режим (`user.statsHiddenBefore`) нічого не видаляє: наряди до цієї дати
// лишаються в базі та в сітці графіка, але не потрапляють у жоден підрахунок —
// статистику, навантаження, справедливість, розподіл по днях тижня.
// Знімаємо позначку — і все повертається, ніби приховування не було.
import type { ScheduleEntry, User } from '../types';
import { toAssignedUserIds } from './assignment';

/** Дата, з якої враховуються наряди бійця (undefined = враховуються всі). */
export const getStatsCutoff = (user: User | undefined | null): string | undefined =>
  user?.statsHiddenBefore || undefined;

/** Мапа id → дата обнулення. Порожня мапа = ніхто нічого не ховає. */
export const buildStatsCutoffs = (users: User[]): Map<number, string> => {
  const map = new Map<number, string>();
  for (const u of users) {
    const cutoff = getStatsCutoff(u);
    if (u.id && cutoff) map.set(u.id, cutoff);
  }
  return map;
};

/**
 * Прибрати з розкладу наряди бійців, що передують їхній даті обнулення.
 * Якщо ніхто не ховає історію — повертає той самий об'єкт (нульова ціна).
 */
export const applyStatsCutoffs = (
  schedule: Record<string, ScheduleEntry>,
  users: User[]
): Record<string, ScheduleEntry> => {
  const cutoffs = buildStatsCutoffs(users);
  if (cutoffs.size === 0) return schedule;

  const result: Record<string, ScheduleEntry> = {};
  for (const [date, entry] of Object.entries(schedule)) {
    const ids = toAssignedUserIds(entry.userId);
    if (ids.length === 0) {
      result[date] = entry;
      continue;
    }
    const remaining = ids.filter((id) => {
      const cutoff = cutoffs.get(id);
      return !cutoff || date >= cutoff;
    });
    if (remaining.length === ids.length) {
      result[date] = entry;
      continue;
    }
    if (remaining.length === 0) continue;
    result[date] = { ...entry, userId: remaining.length === 1 ? remaining[0] : remaining };
  }
  return result;
};

/**
 * Початок обліку з урахуванням обнулення: ніколи не раніше за дату,
 * з якої боєць рахується заново.
 */
export const clampToStatsCutoff = (user: User, from: string | undefined): string | undefined => {
  const cutoff = getStatsCutoff(user);
  if (!cutoff) return from;
  if (!from) return cutoff;
  return from > cutoff ? from : cutoff;
};
