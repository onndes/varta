// src/utils/constants.ts
import type { Signatories } from '../types';

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

export const RANK_WEIGHTS: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_WEIGHTS[r] = RANKS.length - i));

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

export const STATUSES: Record<string, string> = {
  ACTIVE: 'В строю',
  VACATION: 'Відпустка',
  TRIP: 'Відрядження',
  SICK: 'Лікування',
  OTHER: 'Інше',
};

export const DAY_NAMES_FULL: Record<number, string> = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота',
  0: 'Неділя',
};

export const DAY_SHORT_NAMES: Record<number, string> = {
  1: 'ПН',
  2: 'ВТ',
  3: 'СР',
  4: 'ЧТ',
  5: 'ПТ',
  6: 'СБ',
  0: 'НД',
};

export const DEFAULT_DAY_WEIGHTS = { 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.5, 6: 2.0, 0: 1.5 };

export const MAX_DEBT = 4.0;

export const DEFAULT_DUTIES_PER_DAY = 1;

export const DEFAULT_SIGNATORIES: Signatories = {
  approverPos: '',
  approverRank: '',
  approverName: '',
  commanderRank: 'Командир роти',
  commanderName: '',
  creatorPos: '',
  creatorRank: 'Старший сержант',
  creatorName: '',
  scheduleTitle: '',
  scheduleSubtitle: '',
  scheduleLine3: '',
};
