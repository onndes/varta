// src/components/users/absenceSectionUtils.ts — constants and helpers for AbsenceSection
export type AbsenceKey = 'vacation' | 'trip' | 'sick' | 'absent' | 'request';
export type PeriodMode = 'all' | 'year' | 'month';

export const ABSENCE_LABELS: Record<AbsenceKey, string> = {
  vacation: 'Відпустка',
  trip: 'Відрядження',
  sick: 'Лікарняний',
  absent: 'Відсутній',
  request: 'За власним бажанням',
};

export const MONTH_NAMES = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];

/** Count calendar days that fall within both [from, to] and [periodStart, periodEnd]. */
export const countOverlapDays = (
  from?: string,
  to?: string,
  periodStart?: Date,
  periodEnd?: Date
): number => {
  if (!periodStart || !periodEnd) return 0;
  const start = from ? new Date(from) : new Date(periodStart);
  const end = to ? new Date(to) : new Date(periodEnd);
  const lo = start < periodStart ? periodStart : start;
  const hi = end > periodEnd ? periodEnd : end;
  if (hi < lo) return 0;
  return Math.floor((hi.getTime() - lo.getTime()) / 86400000) + 1;
};
