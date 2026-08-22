// src/utils/workload.ts — навантаження бійця = наряди / реально доступні дні
import type { User, ScheduleEntry } from '../types';
import { getUserAvailabilityStatus } from '../services/userService';
import { isExcludedFromAutoOnDate } from '../utils/userExcludeFromAuto';
import { isAssignedInEntry, getFirstDutyDate } from '../utils/assignment';
import { toLocalISO, getDayBeforeWeek } from '../utils/dateUtils';
import { isStaffDuty } from './staffDuty';
import { applyStatsCutoffs, clampToStatsCutoff } from './statsReset';

/** Значення навантаження на конкретний момент часу. */
export interface WorkloadPoint {
  /** Кількість нарядів у вікні обліку [trackingFrom .. напередодні тижня]. */
  duties: number;
  /** Дні, у які боєць реально міг заступити (без відпусток/відряджень/блокувань). */
  availableDays: number;
  /** duties / availableDays — нарядів на один доступний день. */
  rate: number;
  /** Скільки доступних днів припадає на один наряд (1/rate), 0 якщо нарядів немає. */
  daysPerDuty: number;
  /** Відносний індекс: 100 = середнє по підрозділу, <100 — недовантажений. */
  index: number;
}

export interface UserWorkload extends WorkloadPoint {
  /** Дата початку обліку (dateAddedToAuto → перший наряд → початок графіка). */
  trackingFrom: string;
  /** Чому показник не рахується (коли доступних днів 0). */
  noDataReason?: 'not-started' | 'excluded' | 'all-blocked';
  /** Остання дата, включена в облік (день перед початком показаного тижня). */
  countedThrough: string;
}

export interface WorkloadData {
  byUser: Map<number, UserWorkload>;
  /** Середній rate по активних бійцях — база для індексу. */
  teamAvgRate: number;
}

const EMPTY_POINT: WorkloadPoint = {
  duties: 0,
  availableDays: 0,
  rate: 0,
  daysPerDuty: 0,
  index: 0,
};

/**
 * День не рахується доступним, якщо боєць у відпустці/відрядженні/на лікарняному,
 * заблокований вручну, виключений з авто або взагалі не в складі.
 * М'які обмеження (відсипний, дні навколо статусу, ДН) НЕ віднімаються —
 * це преференції планувальника, а не реальна відсутність.
 */
const isUnavailableDay = (user: User, iso: string): boolean => {
  if ((user.inactivePeriods || []).some((p) => iso >= p.from && (!p.to || iso <= p.to))) return true;
  if (isExcludedFromAutoOnDate(user, iso)) return true;
  const status = getUserAvailabilityStatus(user, iso);
  return status === 'STATUS_BUSY' || status === 'DAY_BLOCKED';
};

const makePoint = (duties: number, availableDays: number): WorkloadPoint => {
  const rate = availableDays > 0 ? duties / availableDays : 0;
  return {
    duties,
    availableDays,
    rate,
    daysPerDuty: duties > 0 ? availableDays / duties : 0,
    index: 0,
  };
};

/**
 * Рахує навантаження для кожного бійця станом **на початок** показаного тижня:
 * облік іде з `trackingFrom` до дня перед `weekDates[0]`.
 *
 * Тому наряди самого тижня — і будь-яке планування наперед — не зсувають
 * відсотки, поки тиждень заповнюється: показник відображає лише минулі тижні.
 *
 * Знаменник росте лише в доступні дні, тому відпустка чи відрядження
 * ніколи не псують показник — вона просто «заморожує» його.
 */
export const computeWorkload = (
  users: User[],
  logicSchedule: Record<string, ScheduleEntry>,
  weekDates: string[]
): WorkloadData => {
  const byUser = new Map<number, UserWorkload>();
  if (weekDates.length === 0) return { byUser, teamAvgRate: 0 };

  // Наряди, приховані обнуленням статистики, не рахуються у навантаженні.
  const countedSchedule = applyStatsCutoffs(logicSchedule, users);
  const scheduleDates = Object.keys(countedSchedule).sort();
  const earliest = scheduleDates[0] || weekDates[0];
  // Облік зупиняється напередодні показаного тижня: наряди самого тижня і будь-яке
  // планування наперед не змінюють показник, поки тиждень заповнюється.
  const endDate = getDayBeforeWeek(weekDates[0]);

  for (const user of users) {
    if (!user.id) continue;
    const trackingFrom =
      clampToStatsCutoff(
        user,
        user.dateAddedToAuto || getFirstDutyDate(countedSchedule, user.id) || earliest
      ) || earliest;

    let duties = 0;
    let availableDays = 0;

    const cursor = new Date(trackingFrom);
    const end = new Date(endDate);
    while (cursor <= end) {
      const iso = toLocalISO(cursor);
      if (!isUnavailableDay(user, iso)) availableDays++;
      if (isAssignedInEntry(countedSchedule[iso], user.id)) duties++;
      cursor.setDate(cursor.getDate() + 1);
    }

    let noDataReason: UserWorkload['noDataReason'];
    if (availableDays === 0) {
      if (trackingFrom > endDate) noDataReason = 'not-started';
      else if (isExcludedFromAutoOnDate(user, endDate)) noDataReason = 'excluded';
      else noDataReason = 'all-blocked';
    }

    byUser.set(user.id, {
      ...makePoint(duties, availableDays),
      trackingFrom,
      noDataReason,
      countedThrough: endDate,
    });
  }

  // Середнє по тих, у кого є хоч якесь вікно обліку.
  // Штатні чергові не входять: у них власна тижнева норма, і їхні 3 наряди на
  // тиждень задерли б планку для решти підрозділу.
  const rates = [...byUser.entries()]
    .filter(([id]) => {
      const u = users.find((x) => x.id === id);
      return !!u?.isActive && !isStaffDuty(u);
    })
    .map(([, w]) => w.rate)
    .filter((r) => r > 0);
  const teamAvgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;

  if (teamAvgRate > 0) {
    for (const [id, w] of byUser) {
      byUser.set(id, { ...w, index: Math.round((w.rate / teamAvgRate) * 100) });
    }
  }

  return { byUser, teamAvgRate };
};

/** Кольорова смуга навантаження відносно середнього. */
export type WorkloadBand = 'low' | 'mid' | 'high';

export const getWorkloadBand = (point: WorkloadPoint): WorkloadBand => {
  if (point.availableDays === 0) return 'mid';
  if (point.index < 85) return 'low';
  if (point.index > 115) return 'high';
  return 'mid';
};

export const EMPTY_WORKLOAD_POINT = EMPTY_POINT;
