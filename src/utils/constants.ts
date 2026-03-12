// src/utils/constants.ts
import type { Signatories } from '../types';

/** Повний список військових звань ЗСУ (від вищого до нижчого) */
export const RANKS = [
  'Полковник',
  'Підполковник',
  'Майор',
  'Капітан',
  'Старший лейтенант',
  'Лейтенант',
  'Молодший лейтенант',
  'Головний майстер-сержант',
  'Старший майстер-сержант',
  'Майстер-сержант',
  'Штаб-сержант',
  'Головний сержант',
  'Старший сержант',
  'Сержант',
  'Молодший сержант',
  'Старший солдат',
  'Солдат',
];

/** Числова вага звання для сортування (вище звання → більша вага) */
export const RANK_WEIGHTS: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_WEIGHTS[r] = RANKS.length - i));

/** Скорочені назви звань для компактного відображення */
export const RANKS_SHORT: Record<string, string> = {
  Солдат: 'солд.',
  'Старший солдат': 'ст. солд.',
  'Молодший сержант': 'мол. серж.',
  Сержант: 'серж.',
  'Старший сержант': 'ст. серж.',
  'Головний сержант': 'гол. серж.',
  'Штаб-сержант': 'шт. серж.',
  'Майстер-сержант': 'м-серж.',
  'Старший майстер-сержант': 'ст. м-серж.',
  'Головний майстер-сержант': 'гол. м-серж.',
  'Молодший лейтенант': 'мол. л-т',
  Лейтенант: 'л-т',
  'Старший лейтенант': 'ст. л-т',
  Капітан: 'к-н',
  Майор: 'м-р',
  Підполковник: 'п/п-к',
  Полковник: 'п-к',
};

/** Людські назви статусів бійця */
export const STATUSES: Record<string, string> = {
  ACTIVE: 'В строю',
  VACATION: 'Відпустка',
  TRIP: 'Відрядження',
  SICK: 'Лікування',
  ABSENT: 'Відсутній',
  OTHER: 'Відсутній',
};

/** Повні назви днів тижня (0=Неділя, 1=Понеділок..) */
export const DAY_NAMES_FULL: Record<number, string> = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота',
  0: 'Неділя',
};

/** Скорочення днів тижня */
export const DAY_SHORT_NAMES: Record<number, string> = {
  1: 'ПН',
  2: 'ВТ',
  3: 'СР',
  4: 'ЧТ',
  5: 'ПТ',
  6: 'СБ',
  0: 'НД',
};

/** Ваги днів тижня за замовчуванням (Пт/Нд = 1.5, Сб = 2.0, будні = 1.0) */
export const DEFAULT_DAY_WEIGHTS = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.5, 6: 2.0, 0: 1.5 };

/** Максимальний борг (карма) — обмежує штраф за зняття з наряду */
export const DEFAULT_MAX_DEBT = 4.0;

/** Кількість чергових на день за замовчуванням */
export const DEFAULT_DUTIES_PER_DAY = 1;

/** Мінімальний відпочинок між нарядами (днів) */
const DEFAULT_MIN_REST_DAYS = 1;

/** Максимум рядків на сторінці таблиці чергувань (друк) */
export const DEFAULT_PRINT_MAX_ROWS = 12;

/** Опції авто-розкладу за замовчуванням */
export const DEFAULT_AUTO_SCHEDULE_OPTIONS = {
  avoidConsecutiveDays: true,
  respectOwedDays: true,
  considerLoad: true,
  minRestDays: DEFAULT_MIN_REST_DAYS,
  aggressiveLoadBalancing: false,
  aggressiveLoadBalancingThreshold: 0.2,
  limitOneDutyPerWeekWhenSevenPlus: true,
  allowDebtUsersExtraWeeklyAssignments: true,
  debtUsersWeeklyLimit: 3,
  prioritizeFasterDebtRepayment: true,
  forceUseAllWhenFew: true,
  useExperimentalStatsView: false,
};

/** Підписанти документа за замовчуванням (пусті рядки) */
export const DEFAULT_SIGNATORIES: Signatories = {
  approverPos: '',
  approverRank: '',
  approverName: '',
  commanderRank: '',
  commanderName: '',
  showCreatorFooter: true,
  creatorPos: '',
  creatorRank: '',
  creatorName: '',
  scheduleTitle: '',
  scheduleSubtitle: '',
  scheduleLine3: '',
  reportCreatorPos: '',
  reportCreatorRank: '',
  reportCreatorName: '',
};
