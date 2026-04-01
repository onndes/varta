// src/services/autoScheduler/decisionPhrases.ts
// Centralized phrase catalog for the enhanced decision log system.
// All user-facing text is in Ukrainian; admin-facing text is technical.

// ─── Anomaly Phrases ─────────────────────────────────────────────────────────

export const ANOMALY_PHRASES = {
  SECOND_DUTY_WEEK: {
    user: (reason: string) => `Це вже 2-й наряд цього тижня. ${reason}`,
    admin: (poolSize: number, totalPool: number, weeklyCount: number) =>
      `weeklyCount=${weeklyCount}, finalPool=${poolSize}/${totalPool}, weeklyCap bypassed`,
  },
  THIRD_DUTY_WEEK: {
    user: (reason: string) => `Це вже 3-й (або більше) наряд цього тижня. ${reason}`,
    admin: (poolSize: number, totalPool: number, weeklyCount: number) =>
      `weeklyCount=${weeklyCount}, finalPool=${poolSize}/${totalPool}, critical overload`,
  },
  SAME_DOW_7D: {
    user: (dowName: string) =>
      `${dowName} повторюється — боєць чергував у цей день минулого тижня. ` +
      `Система намагалась уникнути, але це був найкращий варіант.`,
    admin: (penalty: number) => `sameDowPenalty=${penalty}, 7-day same-DOW repeat`,
  },
  SAME_DOW_14D: {
    user: (dowName: string, days: number) =>
      `${dowName} повторюється з інтервалом ${days} дн. (менш ніж 2 тижні).`,
    admin: (penalty: number) => `sameDowPenalty=${penalty}, 14-day same-DOW proximity`,
  },
  HIGH_LOAD_RATIO: {
    user: (percentAbove: number) =>
      `Навантаження на ${percentAbove}% вище за середнє, ` +
      `але серед доступних кандидатів він мав найкращий баланс днів тижня.`,
    admin: (loadRate: number, avgRate: number) =>
      `loadRate=${loadRate.toFixed(4)}, avgRate=${avgRate.toFixed(4)}, ratio=${(loadRate / avgRate).toFixed(2)}`,
  },
  ONLY_CANDIDATE: {
    user: (total: number) =>
      `З ${total} бійців після перевірки доступності залишився лише 1 кандидат — вибору не було.`,
    admin: (poolSizes: string) => `Pool collapsed to 1: ${poolSizes}`,
  },
  FALLBACK_TRIGGERED: {
    user: (filterName: string) =>
      `Фільтр «${filterName}» відхилив усіх кандидатів, тому його результат було скасовано (fallback).`,
    admin: (filterName: string, inputCount: number) =>
      `Filter "${filterName}" emptied pool (${inputCount}→0), fallback restored all`,
  },
  SWAP_OPTIMIZED: {
    user: () =>
      `Після первинного розподілу система провела оптимізацію (swap) і переставила бійця ` +
      `для покращення загального балансу.`,
    admin: () => `Entry was modified during swap optimization (Phase 1/2/3)`,
  },
} as const;

// ─── Filter Phrases (for the filter pipeline funnel) ─────────────────────────

export const FILTER_PHRASES: Record<string, string> = {
  hardEligible: 'Жорсткі обмеження',
  restDays: 'Відпочинок між нарядами',
  incompatiblePairs: 'Несумісні пари',
  sameWeekdayLastWeek: 'Повтор того ж дня тижня',
  weeklyCap: 'Тижневий ліміт',
  forceUseAll: 'Пріоритет 0-нарядних',
  evenDistribution: 'Рівномірний розподіл',
  comparator: 'Компаратор пріоритетів',
};

export const FILTER_DESCRIPTIONS: Record<string, string> = {
  hardEligible: 'Перевірка доступності: активний, не у відпустці, день не заблоковано',
  restDays: 'Мінімальна перерва між нарядами (у днях)',
  incompatiblePairs: 'Перевірка несумісних пар із сусідніми днями',
  sameWeekdayLastWeek: 'Уникнення повтору того ж дня тижня 7 днів тому',
  weeklyCap: 'Обмеження нарядів на тиждень (при ≥7 доступних)',
  forceUseAll: 'Пріоритет бійцям з 0 нарядів цього тижня',
  evenDistribution: 'Тільки бійці з мінімальною кількістю нарядів на тиждень',
  comparator: 'Порівняння кандидатів за 10+ критеріями',
};

// ─── Comparator Criterion Names ──────────────────────────────────────────────

export const COMPARATOR_CRITERIA: {
  priority: number;
  key: string;
  name: string;
  description: string;
}[] = [
  {
    priority: -2,
    key: 'crossDowGuard',
    name: 'Cross-DOW guard',
    description: 'Абсолютний закон: заборона дисбалансу між днями тижня',
  },
  {
    priority: -1,
    key: 'forceUseAll',
    name: 'forceUseAll',
    description: 'Пріоритет бійцям з 0 нарядів цього тижня (≤7 осіб)',
  },
  {
    priority: 0,
    key: 'dowCount',
    name: 'Кількість у цей день',
    description: 'Менше нарядів у цей день тижня = вищий пріоритет',
  },
  {
    priority: 1,
    key: 'dowSSE',
    name: 'DOW SSE',
    description: 'Мінімізація дисбалансу по дню тижня в групі',
  },
  {
    priority: 2,
    key: 'sameDowPenalty',
    name: 'Повтор дня тижня',
    description: 'Штраф за недавнє чергування в той самий день (7д=100, 14д=25)',
  },
  {
    priority: 2.5,
    key: 'loadRate',
    name: 'Частота нарядів',
    description: 'Нормалізоване навантаження (наряди / доступні дні)',
  },
  {
    priority: 3,
    key: 'weeklyCap',
    name: 'Тижневий ліміт',
    description: 'Менше нарядів цього тижня = вищий пріоритет',
  },
  {
    priority: 4,
    key: 'dowRecency',
    name: 'Давність дня тижня',
    description: 'Більше днів з останнього чергування в цей день = краще',
  },
  {
    priority: 5,
    key: 'remainingAvailability',
    name: 'Залишок доступності',
    description: 'Менше вільних днів = призначити раніше (forceUse)',
  },
  {
    priority: 6,
    key: 'loadBalance',
    name: 'Навантаження (бали)',
    description: 'Загальне навантаження + борг (якщо увімкнено)',
  },
  {
    priority: 7,
    key: 'waitDays',
    name: 'Перерва між нарядами',
    description: 'Більше днів з останнього наряду = вищий пріоритет',
  },
  {
    priority: 8,
    key: 'stableTieBreak',
    name: 'Стабільний порядок',
    description: 'За званням, прізвищем та ID — детермінований результат',
  },
];

// ─── Status reason phrases (for filter-eliminated display) ───────────────────

export const ELIMINATION_REASON: Record<string, string> = {
  hard_inactive: 'Не в строю (неактивний)',
  hard_excluded: 'Виключений з авто-розподілу',
  hard_status_busy: 'Відсутній (відпустка/відрядження/лікарняний)',
  hard_day_blocked: 'День тижня заблоковано',
  hard_birthday: 'День народження',
  hard_rest_day: 'Відпочинок до/після відрядження',
  hard_incompatible_pair: 'Несумісна пара',
  filter_rest_days: 'Потрібен відпочинок між нарядами',
  filter_incompatible: 'Несумісна пара з сусіднім днем',
  filter_same_weekday: 'Повтор того ж дня тижня',
  filter_weekly_cap: 'Досягнуто тижневий ліміт',
  filter_force_use_all: 'Є колеги з 0 нарядів цього тижня',
  filter_even_distribution: 'Є колеги з меншою кількістю нарядів',
  outranked: 'Нижчий пріоритет за компаратором',
};

// ─── Extra duty reason ───────────────────────────────────────────────────────

export const getExtraDutyReason = (
  poolSize: number,
  totalPool: number,
  hasDebt: boolean,
  debtAmount: number
): string => {
  if (poolSize <= 2) {
    return `Мало доступних кандидатів — лише ${poolSize} з ${totalPool}.`;
  }
  if (hasDebt) {
    return `Є борг з попередніх місяців (${debtAmount} нарядів) — система відпрацьовує.`;
  }
  return `Серед доступних колег він мав найкращий загальний баланс.`;
};
