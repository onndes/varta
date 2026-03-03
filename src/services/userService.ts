// src/services/userService.ts

import { db } from '../db/db';
import type { User, ScheduleEntry } from '../types';
import { DEFAULT_MAX_DEBT } from '../utils/constants';
import { toLocalISO } from '../utils/dateUtils';
import { getStatusPeriodAtDate, getUserStatusPeriods } from '../utils/userStatus';

/** Дані видаленого бійця для збереження в історії графіку */
export interface DeletedUserInfo {
  name: string;
  rank: string;
}

/** Дата-сентінел: «з початку часів» */
const MIN_DATE = '0000-01-01';
/** Дата-сентінел: «до кінця часів» */
const MAX_DATE = '9999-12-31';

/** Конвертація JS dayOfWeek (0=Нд) → ISO dayIdx (1=Пн..7=Нд) */
const toIsoDayIdx = (jsDow: number): number => (jsDow === 0 ? 7 : jsDow);

/** Чи призначений боєць на попередній день (перевірка відпочинку після наряду) */
const wasPrevDayAssigned = (
  user: User,
  dateStr: string,
  schedule?: Record<string, ScheduleEntry>
): boolean => {
  if (!schedule || !user.id) return false;
  const prevDate = new Date(dateStr);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevEntry = schedule[toLocalISO(prevDate)];
  if (!prevEntry?.userId) return false;
  return Array.isArray(prevEntry.userId)
    ? prevEntry.userId.includes(user.id)
    : prevEntry.userId === user.id;
};

/**
 * Service for managing users
 */

/**
 * Get all users
 */
export const getAllUsers = async (): Promise<User[]> => {
  return await db.users.toArray();
};

/**
 * Get user by ID
 */
export const getUserById = async (id: number): Promise<User | undefined> => {
  return await db.users.get(id);
};

/**
 * Create new user
 */
export const createUser = async (user: Omit<User, 'id'>): Promise<number | undefined> => {
  return await db.users.add(user);
};

/**
 * Update user
 */
export const updateUser = async (id: number, updates: Partial<User>): Promise<number> => {
  return await db.users.update(id, updates);
};

const normalizeIncompatibleIds = (ids?: number[], selfId?: number): number[] =>
  Array.from(
    new Set(
      (ids || []).filter(
        (id) => Number.isFinite(id) && Number.isInteger(id) && id > 0 && id !== selfId
      )
    )
  ).sort((a, b) => a - b);

/**
 * Синхронізувати несумісність у дві сторони:
 * якщо A несумісний з B, то B автоматично несумісний з A.
 */
export const syncUserIncompatibility = async (
  userId: number,
  incompatibleIds?: number[]
): Promise<void> => {
  const allUsers = await db.users.toArray();
  const self = allUsers.find((u) => u.id === userId);
  if (!self) return;

  const validIds = new Set(allUsers.map((u) => u.id).filter((id): id is number => !!id));
  validIds.delete(userId);

  const nextSelfIds = normalizeIncompatibleIds(incompatibleIds, userId).filter((id) =>
    validIds.has(id)
  );
  const nextSet = new Set(nextSelfIds);

  const currentSelfIds = normalizeIncompatibleIds(self.incompatibleWith, userId);
  if (JSON.stringify(currentSelfIds) !== JSON.stringify(nextSelfIds)) {
    await db.users.update(userId, {
      incompatibleWith: nextSelfIds.length > 0 ? nextSelfIds : undefined,
    });
  }

  for (const other of allUsers) {
    if (!other.id || other.id === userId) continue;

    const currentOtherIds = normalizeIncompatibleIds(other.incompatibleWith, other.id);
    const hasSelfNow = currentOtherIds.includes(userId);
    const shouldHaveSelf = nextSet.has(other.id);
    if (hasSelfNow === shouldHaveSelf) continue;

    const nextOtherIds = shouldHaveSelf
      ? [...currentOtherIds, userId].sort((a, b) => a - b)
      : currentOtherIds.filter((id) => id !== userId);

    await db.users.update(other.id, {
      incompatibleWith: nextOtherIds.length > 0 ? nextOtherIds : undefined,
    });
  }
};

/**
 * Отримати карту видалених бійців {id → {name, rank}}
 */
export const getDeletedUserNames = async (): Promise<Record<number, DeletedUserInfo>> => {
  const entry = await db.appState.get('deletedUsers');
  return (entry?.value as Record<number, DeletedUserInfo>) || {};
};

/**
 * Зберегти інформацію про видаленого бійця в appState
 */
const saveDeletedUserInfo = async (id: number, info: DeletedUserInfo): Promise<void> => {
  const existing = await getDeletedUserNames();
  existing[id] = info;
  await db.appState.put({ key: 'deletedUsers', value: existing });
};

/**
 * Delete user and clean up their future schedule entries.
 * Preserves user name+rank in appState for historical schedule display.
 */
export const deleteUser = async (id: number): Promise<string[]> => {
  // Save user info for historical display before deletion
  const user = await db.users.get(id);
  if (user) {
    await saveDeletedUserInfo(id, { name: user.name, rank: user.rank });
  }

  // Find and clean up future schedule entries for this user
  const todayStr = toLocalISO(new Date());
  const allSchedule = await db.schedule.toArray();
  const affectedDates: string[] = [];

  for (const entry of allSchedule) {
    if (!entry.userId || entry.date < todayStr) continue;
    const userIds = Array.isArray(entry.userId) ? entry.userId : [entry.userId];
    if (!userIds.includes(id)) continue;

    affectedDates.push(entry.date);
    const remaining = userIds.filter((uid) => uid !== id);
    if (remaining.length === 0) {
      await db.schedule.delete(entry.date);
    } else {
      await db.schedule.update(entry.date, {
        userId: remaining.length === 1 ? remaining[0] : remaining,
      });
    }
  }

  await db.users.delete(id);
  return affectedDates;
};

/**
 * Reset user debt (karma) to 0
 */
export const resetUserDebt = async (id: number): Promise<void> => {
  await db.users.update(id, { debt: 0 });
};

/**
 * Update user debt/karma (capped at -MAX_DEBT..0 range for negative, uncapped for positive)
 * Negative = soldier owes system (was removed by request)
 * Positive = soldier helped out (manually assigned to harder day)
 */
export const updateUserDebt = async (
  id: number,
  amount: number,
  maxDebt?: number
): Promise<void> => {
  const user = await db.users.get(id);
  if (user) {
    const cap = maxDebt ?? DEFAULT_MAX_DEBT;
    const rawDebt = Number(((user.debt || 0) + amount).toFixed(2));
    const newDebt = Math.max(-cap, rawDebt);
    await db.users.update(id, { debt: newDebt });
  }
};

/**
 * Update owed days for user
 */
export const updateOwedDays = async (
  id: number,
  dayIndex: number,
  increment: number
): Promise<void> => {
  const user = await db.users.get(id);
  if (user) {
    const owedDays = user.owedDays || {};
    owedDays[dayIndex] = (owedDays[dayIndex] || 0) + increment;
    await db.users.update(id, { owedDays });
  }
};

/**
 * Погасити борг за конкретний день тижня (owedDays[dayIdx]--)
 * та відновити карму на вагу цього дня.
 * Викликається і при авто-призначенні, і при ручному.
 * @returns true якщо борг був і погашено, false якщо нічого не було
 */
export const repayOwedDay = async (
  userId: number,
  dayIdx: number,
  weight: number
): Promise<boolean> => {
  const user = await db.users.get(userId);
  if (!user || !user.owedDays || !user.owedDays[dayIdx] || user.owedDays[dayIdx] <= 0) {
    return false;
  }
  // Зменшити борг за цей день тижня
  user.owedDays[dayIdx]--;
  await db.users.update(userId, { owedDays: user.owedDays });

  // Відновити карму (наближаємо до 0, не перевищуючи)
  if (user.debt < 0) {
    const newDebt = Math.min(0, Number((user.debt + weight).toFixed(2)));
    await db.users.update(userId, { debt: newDebt });
  }
  return true;
};

/**
 * Перевірити чи боєць доступний на дату.
 * Враховує: активність, заблоковані дні, статус (дати), відпочинок, попередній наряд.
 */
export const isUserAvailable = (
  user: User,
  dateStr: string,
  schedule?: Record<string, ScheduleEntry>
): boolean => {
  const status = getUserAvailabilityStatus(user, dateStr);
  if (status !== 'AVAILABLE') return false;
  // Додаткова перевірка: чи був наряд вчора (потрібен розклад)
  return !wasPrevDayAssigned(user, dateStr, schedule);
};

/**
 * Отримати статус доступності бійця на дату (без перевірки розкладу).
 * Повертає конкретну причину недоступності для UI.
 */
export const getUserAvailabilityStatus = (
  user: User,
  dateStr: string
): 'AVAILABLE' | 'UNAVAILABLE' | 'STATUS_BUSY' | 'PRE_STATUS_DAY' | 'REST_DAY' | 'DAY_BLOCKED' => {
  if (!user.isActive) return 'UNAVAILABLE';

  // Заблокований день тижня (з урахуванням періоду)
  if (user.blockedDays && user.blockedDays.length > 0) {
    const dayIdx = toIsoDayIdx(new Date(dateStr).getDay());
    if (user.blockedDays.includes(dayIdx)) {
      // Якщо вказано період — перевірити чи дата потрапляє в нього
      const from = user.blockedDaysFrom || MIN_DATE;
      const to = user.blockedDaysTo || MAX_DATE;
      if (dateStr >= from && dateStr <= to) return 'DAY_BLOCKED';
    }
  }

  const activeStatusPeriod = getStatusPeriodAtDate(user, dateStr);
  if (activeStatusPeriod) return 'STATUS_BUSY';

  const statusPeriods = getUserStatusPeriods(user);
  for (const period of statusPeriods) {
    const restBefore = period.restBefore ?? !!user.restBeforeStatus;
    const restAfter = period.restAfter ?? !!user.restAfterStatus;
    if (restBefore && period.from) {
      const dayBefore = new Date(period.from);
      dayBefore.setDate(dayBefore.getDate() - 1);
      if (dateStr === toLocalISO(dayBefore)) return 'PRE_STATUS_DAY';
    }
    if (restAfter && period.to) {
      const nextDay = new Date(period.to);
      nextDay.setDate(nextDay.getDate() + 1);
      if (dateStr === toLocalISO(nextDay)) return 'REST_DAY';
    }
  }

  return 'AVAILABLE';
};

/**
 * Bulk create users
 */
export const bulkCreateUsers = async (users: Omit<User, 'id'>[]): Promise<void> => {
  await db.users.bulkAdd(users);
};

/**
 * Clear all users
 */
export const clearAllUsers = async (): Promise<void> => {
  await db.users.clear();
};
