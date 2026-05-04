import type { User, UserStatusPeriod } from '../types';
import { DAY_NAMES_FULL, STATUSES } from './constants';
import { formatRank } from './helpers';
import { getUserStatusPeriods } from './userStatus';
import { getBlockedDaysPeriods } from './userBlockedDays';
import { getExcludeFromAutoPeriods } from './userExcludeFromAuto';

export interface UserChangeItem {
  label: string;
  before: string;
  after: string;
}

const EMPTY_VALUE = '—';

const cloneStatusPeriod = (period: UserStatusPeriod): UserStatusPeriod => ({ ...period });

export const cloneUserDraft = (user: User): User => ({
  ...user,
  blockedDays: user.blockedDays ? [...user.blockedDays] : undefined,
  incompatibleWith: user.incompatibleWith ? [...user.incompatibleWith] : undefined,
  owedDays: user.owedDays ? { ...user.owedDays } : undefined,
  statusPeriods: user.statusPeriods ? user.statusPeriods.map(cloneStatusPeriod) : undefined,
  blockedDaysPeriods: user.blockedDaysPeriods ? user.blockedDaysPeriods.map((p) => ({ ...p, days: [...p.days] })) : undefined,
  excludeFromAutoPeriods2: user.excludeFromAutoPeriods2 ? user.excludeFromAutoPeriods2.map((p) => ({ ...p })) : undefined,
});

const formatDate = (iso?: string): string => {
  if (!iso) return EMPTY_VALUE;
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
};

const formatText = (value?: string): string => {
  const next = value?.trim();
  return next ? next : EMPTY_VALUE;
};

const formatFlag = (value?: boolean): string => (value ? 'Так' : 'Ні');

const formatStatusPeriod = (period: UserStatusPeriod): string => {
  const range =
    period.from || period.to ? ` ${formatDate(period.from)}-${formatDate(period.to)}` : '';
  const extras: string[] = [];
  if (period.restBefore) extras.push('відпочинок до');
  if (period.restAfter) extras.push('відпочинок після');
  if (period.comment?.trim()) extras.push(period.comment.trim());
  return [STATUSES[period.status] || period.status, `${range}`.trim(), extras.join(', ')]
    .filter(Boolean)
    .join(' • ');
};

const formatStatusPeriods = (user: User): string => {
  const periods = getUserStatusPeriods(user);
  if (periods.length === 0) return 'Немає';
  return periods.map(formatStatusPeriod).join('; ');
};

const formatBlockedDays = (user: User): string => {
  const periods = getBlockedDaysPeriods(user);
  if (periods.length === 0) return 'Немає';
  return periods
    .map((period) => {
      const days = period.days
        .slice()
        .sort((a, b) => a - b)
        .map((day) => DAY_NAMES_FULL[day === 7 ? 0 : day] || String(day))
        .join(', ');
      const parts: string[] = [days];
      if (period.from || period.to) {
        parts.push(`${formatDate(period.from)}-${formatDate(period.to)}`);
      }
      if (period.comment?.trim()) parts.push(period.comment.trim());
      return parts.join(' • ');
    })
    .join('; ');
};

const formatExcludeFromAutoPeriods = (user: User): string => {
  const periods = getExcludeFromAutoPeriods(user);
  if (periods.length === 0) return 'Немає';
  return periods
    .map((p) => {
      const range = `${formatDate(p.from)}-${formatDate(p.to)}`;
      return p.comment?.trim() ? `${range} • ${p.comment.trim()}` : range;
    })
    .join('; ');
};

const formatBirthday = (birthday?: string): string => {
  if (!birthday) return 'Не вказано';
  return formatDate(birthday);
};

const formatIncompatibleUsers = (ids: number[] | undefined, allUsers: User[]): string => {
  const uniqueIds = Array.from(
    new Set((ids || []).filter((id): id is number => Number.isFinite(id)))
  ).sort((a, b) => a - b);
  if (uniqueIds.length === 0) return 'Немає';

  return uniqueIds
    .map((id) => {
      const match = allUsers.find((user) => user.id === id);
      return match ? `${formatRank(match.rank)} ${match.name}` : `ID ${id}`;
    })
    .join(', ');
};

const pushChange = (
  changes: UserChangeItem[],
  label: string,
  before: string,
  after: string
): void => {
  if (before === after) return;
  changes.push({ label, before, after });
};

export const getUserChangeSummary = (
  original: User,
  draft: User,
  allUsers: User[]
): UserChangeItem[] => {
  const changes: UserChangeItem[] = [];

  pushChange(
    changes,
    'День народження',
    formatBirthday(original.birthday),
    formatBirthday(draft.birthday)
  );
  pushChange(changes, 'ПІБ', formatText(original.name), formatText(draft.name));
  pushChange(changes, 'Звання', formatText(original.rank), formatText(draft.rank));
  pushChange(changes, 'Примітка', formatText(original.note), formatText(draft.note));
  pushChange(
    changes,
    'Присутній в підрозділі',
    formatFlag(original.isActive),
    formatFlag(draft.isActive)
  );
  pushChange(
    changes,
    'Виключення з авторозподілу',
    formatExcludeFromAutoPeriods(original),
    formatExcludeFromAutoPeriods(draft)
  );
  pushChange(
    changes,
    'Дата включення в чергу',
    formatDate(original.dateAddedToAuto),
    formatDate(draft.dateAddedToAuto)
  );
  pushChange(
    changes,
    'Заплановані статуси',
    formatStatusPeriods(original),
    formatStatusPeriods(draft)
  );
  pushChange(
    changes,
    'Блокування днів тижня',
    formatBlockedDays(original),
    formatBlockedDays(draft)
  );
  pushChange(
    changes,
    'Несумісність чергувань поспіль',
    formatIncompatibleUsers(original.incompatibleWith, allUsers),
    formatIncompatibleUsers(draft.incompatibleWith, allUsers)
  );

  return changes;
};
