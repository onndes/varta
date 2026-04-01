// src/services/autoScheduler/decisionLog.ts
// Decision log builder for the auto-scheduler info button («i»).

import type {
  User,
  ScheduleEntry,
  DecisionLog,
  CandidateSnapshot,
  FilterStepResult,
  CandidateRow,
  UserMetricsFull,
  WeekContext,
  AnomalyFlag,
  ComparatorCriterion,
  AutoScheduleOptions,
} from '../../types';
import { getUserAvailabilityStatus } from '../userService';
import { toAssignedUserIds } from '../../utils/assignment';
import { countUserDaysOfWeek } from '../scheduleService';
import {
  computeDowFairnessObjective,
  computeUserLoadRate,
  daysSinceLastAssignment,
  daysSinceLastSameDowAssignment,
  countUserAssignmentsInRange,
  countUnavailableDaysInRange,
  getLastAssignmentDate,
  getWeekWindow,
  getUserMaxDowCount,
  getUserMinDowCount,
} from './helpers';
import { ANOMALY_PHRASES, COMPARATOR_CRITERIA, getExtraDutyReason } from './decisionPhrases';

// ─── Decision Log Builder (Info Button «i») ──────────────────────────────────

export const DOW_NAMES: Record<number, string> = {
  0: 'неділю',
  1: 'понеділок',
  2: 'вівторок',
  3: 'середу',
  4: 'четвер',
  5: "п'ятницю",
  6: 'суботу',
};

export const DOW_NAMES_NOMINATIVE: Record<number, string> = {
  0: 'неділя',
  1: 'понеділок',
  2: 'вівторок',
  3: 'середа',
  4: 'четвер',
  5: "п'ятниця",
  6: 'субота',
};

export const DOW_SHORT: Record<number, string> = {
  0: 'Нд',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};

/** Відмінювання слова «раз»: 1 раз, 2 рази, 5 разів. */
export const timesWord = (n: number): string => {
  if (n === 1) return '1 раз';
  if (n >= 2 && n <= 4) return `${n} рази`;
  return `${n} разів`;
};

/** JS DOW → ISO DOW (1=Mon…7=Sun) for blockedDays check. */
export const toIsoDow = (jsDow: number): number => (jsDow === 0 ? 7 : jsDow);

/** Check if a specific JS DOW is blocked for the user. */
export const isDowBlockedForUser = (user: User, jsDow: number): boolean =>
  user.blockedDays?.includes(toIsoDow(jsDow)) ?? false;

// ─── Human-First reason code translator ──────────────────────────────────────
export const REASON_UA: Record<string, string> = {
  // Hard constraints
  hard_inactive: 'Не в строю (неактивний)',
  hard_excluded: 'Виключений з автоматичного розподілу',
  hard_status_busy: 'Має заплановану відсутність або інше завдання',
  hard_day_blocked: 'Цей день тижня заблоковано у профілі',
  hard_birthday: 'День народження — чергування заблоковано',
  hard_rest_day: 'Відпочинок до/після відрядження чи відпустки',
  hard_incompatible_pair: 'Несумісна пара з сусіднім черговим',
  // Filters
  filter_rest_days: 'Потрібен відпочинок між нарядами (мін. перерва)',
  filter_weekly_cap: 'Досягнуто тижневий ліміт нарядів',
  filter_force_use_all: 'Є колеги, які ще не чергували цього тижня',
  outranked: 'Доступний, але має нижчий пріоритет',
  // Availability statuses
  STATUS_BUSY: 'Має заплановану відсутність або інше завдання (STATUS_BUSY)',
  DAY_BLOCKED: 'День тижня заблоковано у профілі (DAY_BLOCKED)',
  BIRTHDAY: 'День народження (заблоковано)',
  REST_DAY: 'Відпочинок після відрядження (rest_after)',
  PRE_STATUS_DAY: 'Відпочинок перед відрядженням/відпусткою (rest_before)',
  UNAVAILABLE: 'Недоступний (UNAVAILABLE)',
  AVAILABLE: 'Доступний',
};

/** Translate a technical reason code to a Ukrainian human-readable phrase. */
export const translateReason = (reason: string): string => {
  // Try exact match first
  if (REASON_UA[reason]) return REASON_UA[reason];
  // Try compound format "hard_status_busy (STATUS_BUSY)"
  const match = reason.match(/^(\w+)\s*\((\w+)\)$/);
  if (match) {
    return REASON_UA[match[1]] || REASON_UA[match[2]] || reason;
  }
  return reason;
};

/**
 * Build a DecisionLog explaining why a specific user was assigned to a date.
 *
 * Human-First: structured sections (✅ / ❌ / 📅 / ⚠️) + flat userText.
 */
export const buildDecisionLog = (
  assignedId: number,
  dateStr: string,
  dayIdx: number,
  schedule: Record<string, ScheduleEntry>,
  allUsers: User[],
  population: number[],
  poolSizes: DecisionLog['debug']['poolSizes'],
  alternatives: CandidateSnapshot[],
  week: { from: string; to: string },
  allDates: string[],
  filterPipelineInput?: FilterStepResult[],
  allCandidates?: User[],
  options?: AutoScheduleOptions,
  dayWeight?: number
): DecisionLog => {
  const dowCount = countUserDaysOfWeek(assignedId, schedule)[dayIdx] || 0;
  const dowSSE = computeDowFairnessObjective(dayIdx, population, schedule, assignedId);
  const sameDow = daysSinceLastSameDowAssignment(assignedId, schedule, dateStr);
  const sameDowPenalty = sameDow <= 7 ? 100 : sameDow <= 14 ? 25 : sameDow <= 21 ? 6.25 : 0;
  const loadRate = computeUserLoadRate(assignedId, schedule, dateStr, allUsers);
  const waitDays = daysSinceLastAssignment(assignedId, schedule, dateStr);
  const weeklyCount = countUserAssignmentsInRange(assignedId, schedule, week.from, week.to);

  // Group averages
  const rates = allUsers.map((u) => computeUserLoadRate(u.id!, schedule, dateStr, allUsers));
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const dowCounts = allUsers.map((u) => countUserDaysOfWeek(u.id!, schedule)[dayIdx] || 0);
  const avgDow = dowCounts.length > 0 ? dowCounts.reduce((a, b) => a + b, 0) / dowCounts.length : 0;

  // Winning criterion
  let winningCriterion = 'dowCount';
  if (alternatives.length > 0) {
    const top = alternatives.find((a) => a.rejectPhase === 'comparator');
    if (top?.metrics) {
      if (dowCount < top.metrics.dowCount) winningCriterion = 'dowCount';
      else if (sameDowPenalty < top.metrics.sameDowPenalty) winningCriterion = 'sameDowPenalty';
      else if (loadRate < top.metrics.loadRate) winningCriterion = 'loadRate';
      else if (waitDays > top.metrics.waitDays) winningCriterion = 'waitDays';
    }
  }

  const dowName = DOW_NAMES[dayIdx] || `день ${dayIdx}`;
  const dowNom = DOW_NAMES_NOMINATIVE[dayIdx] || `день ${dayIdx}`;
  const sections: import('../../types').DecisionLogSection[] = [];
  const user = allUsers.find((u) => u.id === assignedId);

  // Full per-DOW counts for this user
  const userAllDowCounts = countUserDaysOfWeek(assignedId, schedule);

  // ─── 📋 Section: Why you? ──────────────────────────────────────────
  const whyYou: string[] = [];

  if (dowCount === 0) {
    whyYou.push(
      `У вас ще жодного чергування у ${dowName}, тоді як в середньому по групі — ` +
        `${avgDow.toFixed(1)}. Тому ваша черга прийшла.`
    );
  } else if (dowCount <= avgDow) {
    whyYou.push(
      `У вас лише ${timesWord(dowCount)} у ${dowName} — це менше або на рівні ` +
        `середнього по групі (${avgDow.toFixed(1)}).`
    );
  } else {
    whyYou.push(
      `У вас ${timesWord(dowCount)} у ${dowName} (середнє по групі — ` +
        `${avgDow.toFixed(1)}). Серед доступних колег саме ви мали найкращий загальний баланс.`
    );
  }

  const ratio = avgRate > 0 ? loadRate / avgRate : 1;
  if (ratio < 0.7) {
    whyYou.push(
      `Ви чергуєте значно рідше за середнє по групі — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 0.9) {
    whyYou.push(
      `Ви чергуєте трохи рідше за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 1.1) {
    whyYou.push(
      `Навантаження приблизно як у всіх — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}).`
    );
  } else if (ratio < 1.3) {
    whyYou.push(
      `Навантаження трохи вище за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}), ` +
        `але серед доступних кандидатів саме ви мали найкращий баланс днів тижня.`
    );
  } else {
    whyYou.push(
      `Навантаження помітно вище за середнє — частота нарядів: ` +
        `${loadRate.toFixed(3)} (середнє по групі: ${avgRate.toFixed(3)}), ` +
        `але серед доступних колег тільки ви мали найкращий баланс.`
    );
  }

  const lastAssignDate = getLastAssignmentDate(assignedId, schedule, dateStr);
  const unavailInWait =
    lastAssignDate && user ? countUnavailableDaysInRange(user, lastAssignDate, dateStr) : 0;

  if (waitDays !== Infinity && waitDays > 0 && waitDays <= 3) {
    whyYou.push(
      `Останнє чергування було лише ${waitDays} дн. тому, але інші колеги ` +
        `або недоступні, або мають гірший баланс.`
    );
  } else if (waitDays !== Infinity && waitDays > 0) {
    if (unavailInWait > 0) {
      whyYou.push(
        `З моменту останнього наряду минуло ${waitDays} дн., з яких ${unavailInWait} — ` +
          `у відрядженні, відпустці або на лікарняному.`
      );
      if (unavailInWait > 3) {
        whyYou.push(
          `Щойно повернувся(-лась) з відрядження/відпустки (${unavailInWait} дн.) — ` +
            `навантаження враховане пропорційно до доступних днів.`
        );
      }
    } else {
      whyYou.push(
        `Ви відпочивали ${waitDays} дн. з моменту останнього чергування — достатня перерва.`
      );
    }
  } else if (waitDays === Infinity || waitDays < 0) {
    whyYou.push(`Ви ще не чергували в цьому періоді — тому маєте пріоритет.`);
  }

  if (weeklyCount <= 1) {
    whyYou.push(
      weeklyCount === 0
        ? `Цього тижня у вас ще жодного наряду — є запас.`
        : `Цього тижня у вас поки лише 1 наряд.`
    );
  }

  // Debt info
  if (user && (user.debt || 0) < 0) {
    const debtAbs = Math.abs(user.debt || 0);
    whyYou.push(
      `Також враховано борг з попередніх місяців — ${debtAbs} пропущених ` +
        `нарядів, які система поступово відпрацьовує.`
    );
  }

  // Day weight info
  if (dayWeight != null && dayWeight !== 1) {
    const dowNomForWeight = DOW_NAMES_NOMINATIVE[dayIdx] || `день ${dayIdx}`;
    whyYou.push(
      `Вага цього дня (${dowNomForWeight}) — ${dayWeight.toFixed(2)}. ` +
        `${dayWeight > 1 ? 'Це важчий день — нараховується більше балів.' : 'Це легший день — нараховується менше балів.'}`
    );
  }

  sections.push({ icon: '📋', title: 'Чому саме ви?', items: whyYou });

  // ─── 👥 Section: Why not others? ──────────────────────────────────
  const whyNotOthers: string[] = [];
  const hardBlocked = alternatives.filter((a) => a.rejectPhase === 'hardConstraint');
  const softOutranked = alternatives.filter((a) => a.rejectPhase === 'comparator');
  const filterBlocked = alternatives.filter((a) => a.rejectPhase === 'filter');

  if (hardBlocked.length > 0) {
    whyNotOthers.push(`Недоступні на цю дату (${hardBlocked.length}):`);
    for (const alt of hardBlocked.slice(0, 5)) {
      whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
    }
    if (hardBlocked.length > 5) {
      whyNotOthers.push(`  …та ще ${hardBlocked.length - 5}`);
    }
  }

  if (filterBlocked.length > 0) {
    whyNotOthers.push(`Відфільтровані за правилами (${filterBlocked.length}):`);
    for (const alt of filterBlocked.slice(0, 3)) {
      whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
    }
  }

  if (softOutranked.length > 0) {
    whyNotOthers.push(`Доступні, але ви мали вищий пріоритет (${softOutranked.length}):`);
    for (const alt of softOutranked.slice(0, 4)) {
      const m = alt.metrics;
      if (m) {
        const cmpParts: string[] = [];
        if (m.dowCount > dowCount) {
          cmpParts.push(
            `уже чергував(-ла) у ${dowName} ${timesWord(m.dowCount)} (ви — ${dowCount})`
          );
        }
        if (m.loadRate > loadRate + 0.005 && cmpParts.length === 0) {
          cmpParts.push(`має вище загальне навантаження`);
        }
        if (m.waitDays < waitDays && cmpParts.length === 0) {
          cmpParts.push(`менший перепочинок між нарядами (${m.waitDays} дн.)`);
        }
        if (cmpParts.length === 0) {
          cmpParts.push(`має гірший сукупний баланс навантаження та днів тижня`);
        }
        whyNotOthers.push(`  ${alt.userName} — ${cmpParts.join('; ')}`);
      } else {
        whyNotOthers.push(`  ${alt.userName} — ${translateReason(alt.rejectReason as string)}`);
      }
    }
  }

  if (poolSizes.final === 1 && poolSizes.initial > 1) {
    whyNotOthers.push(
      `Увага: з ${poolSizes.initial} осіб після перевірки доступності ` +
        `залишився лише 1 кандидат — вибору фактично не було.`
    );
  }

  if (whyNotOthers.length > 0) {
    sections.push({ icon: '👥', title: 'Чому не хтось інший?', items: whyNotOthers });
  }

  // ─── 📅 Section: Why this day of week? ─────────────────────────────
  const whyThisDay: string[] = [];

  // Show DOW distribution (Mon-Sun)
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const distParts = dowOrder.map((d) => `${DOW_SHORT[d]}—${userAllDowCounts[d] || 0}`);
  whyThisDay.push(`Ваші чергування по днях: ${distParts.join(', ')}`);

  // Find zero-count DOWs (excluding the current DOW)
  const zeroDows = dowOrder.filter((d) => (userAllDowCounts[d] || 0) === 0 && d !== dayIdx);
  const zeroDowsBlocked = zeroDows.filter((d) => user && isDowBlockedForUser(user, d));
  const zeroDowsAvailable = zeroDows.filter((d) => !(user && isDowBlockedForUser(user, d)));

  if (dowCount === 0) {
    whyThisDay.push(
      `${dowNom} — оптимальний вибір: у вас тут ще жодного чергування. ` +
        `Система розподіляє навантаження рівномірно по всіх днях тижня.`
    );
  } else if (zeroDows.length === 0) {
    whyThisDay.push(
      `У вас є чергування в кожному дні тижня. ${dowNom} обрано, бо тут ` +
        `найменший дисбаланс серед усіх кандидатів.`
    );
  } else {
    if (zeroDowsBlocked.length > 0) {
      const blockedNames = zeroDowsBlocked.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
      whyThisDay.push(
        `${blockedNames} — заблоковано у вашому профілі, тому чергування ` +
          `в ці дні неможливе (0 чергувань у ці дні — не помилка).`
      );
    }
    if (zeroDowsAvailable.length > 0) {
      const avNames = zeroDowsAvailable.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
      whyThisDay.push(
        `Хоча у ${avNames} у вас ще 0 чергувань, на ці дати не було ` +
          `вільних слотів або вони будуть розподілені у наступних ітераціях розкладу.`
      );
    }
  }

  // Check unavailable DOWs in upcoming dates for context
  if (user) {
    const unavailableDows = new Map<number, string>();
    const futureDates = allDates.filter(
      (d) =>
        d >= dateStr &&
        d !== dateStr &&
        !toAssignedUserIds(schedule[d]?.userId).includes(assignedId)
    );
    for (const d of futureDates.slice(0, 28)) {
      const status = getUserAvailabilityStatus(user, d);
      if (status !== 'AVAILABLE' && !unavailableDows.has(new Date(d).getDay())) {
        unavailableDows.set(new Date(d).getDay(), translateReason(status));
      }
    }
    if (unavailableDows.size >= 3) {
      const dowList = [...unavailableDows.entries()]
        .map(([d, reason]) => `${DOW_NAMES_NOMINATIVE[d]} (${reason})`)
        .slice(0, 4)
        .join(', ');
      whyThisDay.push(
        `На інші дні тижня (${dowList}) ви часто недоступні, тому ` +
          `${dowNom.toLowerCase()} залишається одним з небагатьох варіантів.`
      );
    }
  }

  if (whyThisDay.length > 1) {
    sections.push({
      icon: '📅',
      title: `Чому саме ${dowNom.toLowerCase()}?`,
      items: whyThisDay,
    });
  }

  // ─── ⚠️ Section: Warnings ──────────────────────────────────────────
  const warnings: string[] = [];
  const isWeekend = dayIdx === 0 || dayIdx === 6;
  const hasDebt = user && (user.debt || 0) < 0;
  const debtAmount = hasDebt ? Math.abs(user!.debt || 0) : 0;

  if (weeklyCount >= 2) {
    const weekLabel = weeklyCount === 2 ? 'другий' : `${weeklyCount}-й`;
    if (poolSizes.final <= 2) {
      warnings.push(
        `Це вже ${weekLabel} наряд цього тижня. Причина: мало доступних — ` +
          `лише ${poolSizes.final} кандидат(-ів) з ${poolSizes.initial}.`
      );
    } else if (hasDebt) {
      warnings.push(
        `Це ${weekLabel} наряд цього тижня. Причина: є борг з попередніх ` +
          `місяців — система відпрацьовує ${debtAmount} пропущених нарядів.`
      );
    } else {
      warnings.push(
        `Це ${weekLabel} наряд цього тижня. Причина: серед доступних ` +
          `колег саме ви мали найкраще навантаження і баланс.`
      );
    }
    if (isWeekend) {
      warnings.push(
        `Призначено на вихідний (${dowNom.toLowerCase()}), і це не перший наряд цього тижня.`
      );
    }
  }

  if (sameDowPenalty >= 100) {
    warnings.push(
      `Ви вже чергували у ${dowName} минулого тижня (${sameDow} дн. тому). ` +
        `Система намагалась уникнути цього, але серед доступних кандидатів ` +
        `це був єдиний або найкращий варіант.`
    );
  } else if (sameDowPenalty >= 25) {
    warnings.push(
      `${dowNom} повторюється з невеликим інтервалом — останній раз ${sameDow} дн. тому ` +
        `(менш ніж ${sameDow <= 14 ? '2 тижні' : '3 тижні'}). ` +
        `Система намагалась уникнути, але це був найкращий варіант.`
    );
  }

  if (dowCount > 0 && zeroDowsAvailable.length > 0) {
    const avNames = zeroDowsAvailable.map((d) => DOW_NAMES_NOMINATIVE[d]).join(', ');
    warnings.push(
      `У вас 0 чергувань у «${avNames}», але призначено на ${dowName} ` +
        `(де вже ${dowCount}). Баланс буде вирівняно поступово.`
    );
  }

  if (warnings.length > 0) {
    sections.push({ icon: '⚠️', title: 'Зверніть увагу', items: warnings });
  }

  // ─── Build flat userText from sections ─────────────────────────────
  const textLines: string[] = [];
  for (const s of sections) {
    textLines.push(`${s.icon} ${s.title}`);
    for (const item of s.items) textLines.push(`  ${item}`);
    textLines.push('');
  }

  // ─── Build enhanced decision log data ──────────────────────────────
  const filterPipeline = filterPipelineInput || [];

  // Build candidate table from all candidates who went through the pipeline
  const candidateTable: CandidateRow[] = [];
  const candidatePool = allCandidates || allUsers;
  const weekWindow = getWeekWindow(dateStr);

  // Collect hard-eliminated from alternatives
  const hardEliminated = new Set(
    alternatives.filter((a) => a.rejectPhase === 'hardConstraint').map((a) => a.userId)
  );
  // Collect filter-eliminated from pipeline
  const filterEliminated = new Map<number, string>();
  for (const step of filterPipeline) {
    for (const e of step.eliminated) {
      if (!filterEliminated.has(e.userId)) {
        filterEliminated.set(e.userId, step.filterName);
      }
    }
  }

  for (const u of candidatePool) {
    if (!u.id) continue;
    const isWinner = u.id === assignedId;
    const isHardElim = hardEliminated.has(u.id);
    const filterName = filterEliminated.get(u.id);
    let status: CandidateRow['status'] = 'soft-eliminated';
    if (isWinner) status = 'winner';
    else if (isHardElim) status = 'hard-eliminated';
    else if (filterName) status = 'filter-eliminated';

    const uDowCount = countUserDaysOfWeek(u.id, schedule)[dayIdx] || 0;
    const uWeeklyCount = countUserAssignmentsInRange(
      u.id,
      schedule,
      weekWindow.from,
      weekWindow.to
    );
    const uWaitDays = daysSinceLastAssignment(u.id, schedule, dateStr);
    const uLoadRate = computeUserLoadRate(u.id, schedule, dateStr, allUsers);
    const uSameDow = daysSinceLastSameDowAssignment(u.id, schedule, dateStr);
    const uSameDowPenalty = uSameDow <= 7 ? 100 : uSameDow <= 14 ? 25 : uSameDow <= 21 ? 6.25 : 0;

    const maxDow = getUserMaxDowCount(u.id, schedule, u.blockedDays);
    const minDow = getUserMinDowCount(u.id, schedule, u.blockedDays);
    let crossDowGuard = 0;
    if (maxDow > minDow && uDowCount > minDow) {
      crossDowGuard = 5000 + 2500 * (uDowCount - minDow + 1);
    }

    candidateTable.push({
      userId: u.id,
      userName: u.name,
      rank: u.rank || '',
      dowCount: uDowCount,
      weeklyCount: uWeeklyCount,
      waitDays: uWaitDays === Infinity ? -1 : uWaitDays,
      loadRate: uLoadRate,
      sameDowPenalty: uSameDowPenalty,
      crossDowGuard,
      debt: u.debt || 0,
      status,
      eliminatedByFilter: filterName,
      eliminatedReason: isHardElim
        ? (alternatives.find((a) => a.userId === u.id)?.rejectReason as string)
        : filterName,
    });
  }

  // Sort: winner first, then soft-eliminated, filter-eliminated, hard-eliminated
  const statusOrder = {
    winner: 0,
    'soft-eliminated': 1,
    'filter-eliminated': 2,
    'hard-eliminated': 3,
  };
  candidateTable.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // Build assigned metrics
  const maxDowW = getUserMaxDowCount(assignedId, schedule, user?.blockedDays);
  const minDowW = getUserMinDowCount(assignedId, schedule, user?.blockedDays);
  let assignedCrossDowGuard = 0;
  if (maxDowW > minDowW && dowCount > minDowW) {
    assignedCrossDowGuard = 5000 + 2500 * (dowCount - minDowW + 1);
  }

  const assignedMetrics: UserMetricsFull = {
    dowCount,
    dowSSE,
    sameDowPenalty,
    crossDowGuard: assignedCrossDowGuard,
    weeklyCount,
    dowRecency: sameDow === Infinity ? -1 : sameDow,
    loadRate,
    waitDays: waitDays === Infinity ? -1 : waitDays,
    debt: user?.debt || 0,
    avgLoadRate: avgRate,
    avgDowCount: avgDow,
    winningCriterion,
    winningCriterionDelta: 0, // calculated below
  };

  // Calculate winning criterion delta (difference to next-best candidate)
  if (alternatives.length > 0) {
    const top = alternatives.find((a) => a.rejectPhase === 'comparator');
    if (top?.metrics) {
      if (winningCriterion === 'dowCount') {
        assignedMetrics.winningCriterionDelta = top.metrics.dowCount - dowCount;
      } else if (winningCriterion === 'sameDowPenalty') {
        assignedMetrics.winningCriterionDelta = top.metrics.sameDowPenalty - sameDowPenalty;
      } else if (winningCriterion === 'loadRate') {
        assignedMetrics.winningCriterionDelta = top.metrics.loadRate - loadRate;
      } else if (winningCriterion === 'waitDays') {
        assignedMetrics.winningCriterionDelta = waitDays - top.metrics.waitDays;
      }
    }
  }

  // Build week context
  const groupDutiesThisWeek: Record<number, number> = {};
  for (const u of allUsers) {
    if (!u.id) continue;
    groupDutiesThisWeek[u.id] = countUserAssignmentsInRange(u.id, schedule, week.from, week.to);
  }
  const whyExtraDutyAllowed =
    weeklyCount >= 2
      ? getExtraDutyReason(
          poolSizes.final,
          poolSizes.initial,
          (user?.debt || 0) < 0,
          Math.abs(user?.debt || 0)
        )
      : null;

  const weekContext: WeekContext = {
    weekFrom: week.from,
    weekTo: week.to,
    userDutiesThisWeek: weeklyCount,
    groupDutiesThisWeek,
    isSecondDutyThisWeek: weeklyCount === 2,
    isThirdOrMoreDutyThisWeek: weeklyCount >= 3,
    whyExtraDutyAllowed,
  };

  // Build anomaly flags
  const anomalyFlags: AnomalyFlag[] = [];

  if (weeklyCount === 2) {
    anomalyFlags.push({
      code: 'SECOND_DUTY_WEEK',
      severity: 'warning',
      humanText: ANOMALY_PHRASES.SECOND_DUTY_WEEK.user(whyExtraDutyAllowed || ''),
      adminText: ANOMALY_PHRASES.SECOND_DUTY_WEEK.admin(
        poolSizes.final,
        poolSizes.initial,
        weeklyCount
      ),
      relatedValue: weeklyCount,
    });
  }
  if (weeklyCount >= 3) {
    anomalyFlags.push({
      code: 'THIRD_DUTY_WEEK',
      severity: 'critical',
      humanText: ANOMALY_PHRASES.THIRD_DUTY_WEEK.user(whyExtraDutyAllowed || ''),
      adminText: ANOMALY_PHRASES.THIRD_DUTY_WEEK.admin(
        poolSizes.final,
        poolSizes.initial,
        weeklyCount
      ),
      relatedValue: weeklyCount,
    });
  }
  if (sameDowPenalty >= 100) {
    const dowName = DOW_NAMES_NOMINATIVE[dayIdx] || `день ${dayIdx}`;
    anomalyFlags.push({
      code: 'SAME_DOW_7D',
      severity: 'warning',
      humanText: ANOMALY_PHRASES.SAME_DOW_7D.user(dowName),
      adminText: ANOMALY_PHRASES.SAME_DOW_7D.admin(sameDowPenalty),
      relatedValue: sameDowPenalty,
    });
  } else if (sameDowPenalty >= 25) {
    const dowName = DOW_NAMES_NOMINATIVE[dayIdx] || `день ${dayIdx}`;
    anomalyFlags.push({
      code: 'SAME_DOW_14D',
      severity: 'info',
      humanText: ANOMALY_PHRASES.SAME_DOW_14D.user(dowName, sameDow),
      adminText: ANOMALY_PHRASES.SAME_DOW_14D.admin(sameDowPenalty),
      relatedValue: sameDowPenalty,
    });
  }
  if (avgRate > 0 && loadRate / avgRate > 1.3) {
    anomalyFlags.push({
      code: 'HIGH_LOAD_RATIO',
      severity: 'warning',
      humanText: ANOMALY_PHRASES.HIGH_LOAD_RATIO.user(Math.round((loadRate / avgRate - 1) * 100)),
      adminText: ANOMALY_PHRASES.HIGH_LOAD_RATIO.admin(loadRate, avgRate),
      relatedValue: loadRate / avgRate,
    });
  }
  if (poolSizes.final === 1 && poolSizes.initial > 1) {
    anomalyFlags.push({
      code: 'ONLY_CANDIDATE',
      severity: 'info',
      humanText: ANOMALY_PHRASES.ONLY_CANDIDATE.user(poolSizes.initial),
      adminText: ANOMALY_PHRASES.ONLY_CANDIDATE.admin(JSON.stringify(poolSizes)),
    });
  }
  for (const step of filterPipeline) {
    if (step.wasFallback) {
      anomalyFlags.push({
        code: 'FALLBACK_TRIGGERED',
        severity: 'warning',
        humanText: ANOMALY_PHRASES.FALLBACK_TRIGGERED.user(step.reason),
        adminText: ANOMALY_PHRASES.FALLBACK_TRIGGERED.admin(step.filterName, step.inputCount),
      });
    }
  }

  // Build comparator criteria for the assigned user
  const comparatorCriteria: ComparatorCriterion[] = COMPARATOR_CRITERIA.map((c) => {
    let value: number | string = '—';
    let isActive = true;
    let isAnomalous = false;

    switch (c.key) {
      case 'crossDowGuard':
        value = assignedCrossDowGuard;
        isAnomalous = assignedCrossDowGuard > 0;
        break;
      case 'forceUseAll':
        value = weeklyCount === 0 ? 1 : 0;
        isActive = options?.forceUseAllWhenFew ?? false;
        break;
      case 'dowCount':
        value = dowCount;
        break;
      case 'dowSSE':
        value = Math.round(dowSSE * 100) / 100;
        break;
      case 'sameDowPenalty':
        value = sameDowPenalty;
        isAnomalous = sameDowPenalty >= 25;
        break;
      case 'loadRate':
        value = Math.round(loadRate * 10000) / 10000;
        break;
      case 'weeklyCap':
        value = weeklyCount;
        isActive = options?.limitOneDutyPerWeekWhenSevenPlus ?? false;
        break;
      case 'dowRecency':
        value = sameDow === Infinity ? 999 : sameDow;
        break;
      case 'remainingAvailability':
        value = '—';
        isActive = options?.forceUseAllWhenFew ?? false;
        break;
      case 'loadBalance':
        value = '—';
        isActive = options?.considerLoad ?? false;
        break;
      case 'waitDays':
        value = waitDays === Infinity ? 999 : waitDays;
        break;
      case 'stableTieBreak':
        value = assignedId;
        break;
    }

    return {
      priority: c.priority,
      name: c.name,
      description: c.description,
      value,
      isActive,
      isDecisive: c.key === winningCriterion,
      isAnomalous,
    };
  });

  return {
    userText: textLines.join('\n').trim(),
    sections,
    debug: {
      winningCriterion,
      assignedUserId: assignedId,
      dowCount,
      dowSSE,
      sameDowPenalty,
      loadRate,
      waitDays: waitDays === Infinity ? -1 : waitDays,
      weeklyCount,
      poolSizes,
      alternatives,
    },
    filterPipeline: filterPipeline.length > 0 ? filterPipeline : undefined,
    candidateTable: candidateTable.length > 0 ? candidateTable : undefined,
    assignedMetrics,
    weekContext,
    anomalyFlags: anomalyFlags.length > 0 ? anomalyFlags : undefined,
    comparatorCriteria,
    dayWeight,
    wasSwapOptimized: false,
  };
};
