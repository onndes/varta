import type { User, UserStatusPeriod, UserAbsenceStatus } from '../types';

const MIN_DATE = '0000-01-01';
const MAX_DATE = '9999-12-31';

const STATUS_PRIORITY: Record<UserAbsenceStatus, number> = {
  SICK: 4,
  VACATION: 3,
  TRIP: 2,
  ABSENT: 1,
};

const periodStart = (period: UserStatusPeriod): string => period.from || MIN_DATE;
const periodEnd = (period: UserStatusPeriod): string => period.to || MAX_DATE;

export const normalizeAbsenceStatus = (
  status: User['status'] | undefined
): UserAbsenceStatus | null => {
  if (!status || status === 'ACTIVE') return null;
  if (status === 'OTHER') return 'ABSENT';
  if (status === 'VACATION' || status === 'TRIP' || status === 'SICK' || status === 'ABSENT') {
    return status;
  }
  return null;
};

export const normalizeStatusPeriods = (periods?: UserStatusPeriod[]): UserStatusPeriod[] => {
  if (!periods || periods.length === 0) return [];

  const normalized: UserStatusPeriod[] = [];
  periods.forEach((period) => {
    const status = normalizeAbsenceStatus(period.status as User['status']);
    if (!status) return;
    normalized.push({
      status,
      from: period.from || undefined,
      to: period.to || undefined,
      comment: status === 'ABSENT' ? period.comment || undefined : undefined,
      restBefore: !!period.restBefore,
      restAfter: !!period.restAfter,
    });
  });

  return normalized.sort((a, b) => {
    const fromCmp = periodStart(a).localeCompare(periodStart(b));
    if (fromCmp !== 0) return fromCmp;
    return periodEnd(a).localeCompare(periodEnd(b));
  });
};

export const getUserStatusPeriods = (user: User): UserStatusPeriod[] => {
  if (user.statusPeriods && user.statusPeriods.length > 0) {
    return normalizeStatusPeriods(user.statusPeriods);
  }

  const fallbackStatus = normalizeAbsenceStatus(user.status);
  if (!fallbackStatus) return [];

  return normalizeStatusPeriods([
    {
      status: fallbackStatus,
      from: user.statusFrom,
      to: user.statusTo,
      comment: fallbackStatus === 'ABSENT' ? user.statusComment : undefined,
      restBefore: !!user.restBeforeStatus,
      restAfter: !!user.restAfterStatus,
    },
  ]);
};

export const isDateInStatusPeriod = (dateStr: string, period: UserStatusPeriod): boolean => {
  return dateStr >= periodStart(period) && dateStr <= periodEnd(period);
};

export const getStatusPeriodAtDate = (user: User, dateStr: string): UserStatusPeriod | null => {
  const periods = getUserStatusPeriods(user).filter((period) => isDateInStatusPeriod(dateStr, period));
  if (periods.length === 0) return null;

  periods.sort((a, b) => {
    const priorityDiff = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
    if (priorityDiff !== 0) return priorityDiff;
    const fromCmp = periodStart(a).localeCompare(periodStart(b));
    if (fromCmp !== 0) return fromCmp;
    return periodEnd(a).localeCompare(periodEnd(b));
  });

  return periods[0];
};

export const getFutureStatusPeriods = (user: User, dateStr: string): UserStatusPeriod[] => {
  return getUserStatusPeriods(user).filter((period) => period.from && period.from > dateStr);
};

export const getStatusPeriodsInRange = (
  user: User,
  fromDate: string,
  toDate: string
): UserStatusPeriod[] => {
  return getUserStatusPeriods(user).filter((period) => {
    const pFrom = periodStart(period);
    const pTo = periodEnd(period);
    return !(pTo < fromDate || pFrom > toDate);
  });
};
