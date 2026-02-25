import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import {
  formatRank,
  compareByRankAndName,
  sortUsersBy,
  type SortKey,
  type SortDir,
} from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getUserFairnessFrom } from '../utils/fairness';
import { getUserAvailabilityStatus } from '../services/userService';
import UserStatsModal from './users/UserStatsModal';
import { isAssignedInEntry, getLogicSchedule, isHistoryType } from '../utils/assignment';

interface StatsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  ignoreHistoryInLogic: boolean;
}

const StatsView: React.FC<StatsViewProps> = ({
  users,
  schedule,
  dayWeights,
  ignoreHistoryInLogic,
}) => {
  const [showInactive, setShowInactive] = useState(true);
  const [showActive, setShowActive] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };
  const todayStr = toLocalISO(new Date());

  const allStats = useMemo(() => {
    const logicSched = getLogicSchedule(schedule, ignoreHistoryInLogic);
    // Earliest non-history schedule date for fallback tracking
    const nonHistoryDates = Object.entries(logicSched)
      .filter(([, e]) => !isHistoryType(e))
      .map(([d]) => d)
      .sort();
    const earliestScheduleDate = nonHistoryDates[0] || todayStr;
    const overlapDays = (
      from: string,
      to: string,
      statusFrom?: string,
      statusTo?: string
    ): number => {
      if (!statusFrom || !statusTo) return 0;
      const lo = statusFrom > from ? statusFrom : from;
      const hi = statusTo < to ? statusTo : to;
      if (hi < lo) return 0;
      const d1 = new Date(lo);
      const d2 = new Date(hi);
      return Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
    };

    return users
      .map((u) => {
        const allUserEntries = Object.values(logicSched).filter((s) => isAssignedInEntry(s, u.id!));

        // Дата, з якої ведеться облік для цього бійця:
        // - dateAddedToAuto (якщо задана) — дата включення в авточергу
        // - інакше — дата першого графіка у базі (або сьогодні)
        const rawFairnessFrom = getUserFairnessFrom(u, todayStr);
        const fallbackFrom = earliestScheduleDate <= todayStr ? earliestScheduleDate : todayStr;
        const trackingFrom = rawFairnessFrom || fallbackFrom;

        // Наряди, які враховуються в обліковому періоді:
        // Якщо є явна дата обліку (dateAddedToAuto) — фільтруємо строго за нею.
        // Якщо ні — додатково включаємо історичні/імпортовані записи (навіть якщо до fallback).
        const hasExplicitTracking = !!rawFairnessFrom;
        const comparableEntries = allUserEntries.filter((s) => {
          if (s.date >= trackingFrom) return true;
          if (!ignoreHistoryInLogic && isHistoryType(s)) return true;
          if (!hasExplicitTracking && isHistoryType(s)) return true;
          return false;
        });

        // Скільки днів боєць був доступний для чергування (від trackingFrom до сьогодні)
        // Якщо боєць неактивний або виключений з авторозподілу — 0
        let availableDaysForDuty = 0;
        if (trackingFrom <= todayStr && u.isActive && !u.excludeFromAuto) {
          const totalWindowDays =
            Math.floor(
              (new Date(todayStr).getTime() - new Date(trackingFrom).getTime()) / 86400000
            ) + 1;
          const statusBlockedDays =
            u.status === 'VACATION' || u.status === 'TRIP' || u.status === 'SICK'
              ? overlapDays(trackingFrom, todayStr, u.statusFrom, u.statusTo)
              : 0;
          availableDaysForDuty = Math.max(0, totalWindowDays - statusBlockedDays);
        }

        // Навантаження (зважена сума) та розподіл по днях тижня
        let comparableLoad = 0;
        const dayCountComparable: Record<number, number> = {};
        comparableEntries.forEach((s) => {
          const dayIdx = new Date(s.date).getDay();
          comparableLoad += dayWeights[dayIdx] || 1.0;
          dayCountComparable[dayIdx] = (dayCountComparable[dayIdx] || 0) + 1;
        });

        const balance = u.debt || 0;
        const availability = getUserAvailabilityStatus(u, todayStr);

        // Частота: середнє число нарядів на один доступний день
        const dutyRate =
          availableDaysForDuty > 0 ? comparableEntries.length / availableDaysForDuty : 0;

        return {
          ...u,
          balance,
          trackingFrom,
          totalAllDuties: allUserEntries.length,
          totalComparableDuties: comparableEntries.length,
          comparableLoad,
          effectiveComparable: comparableLoad + balance,
          dayCountComparable,
          availableDaysForDuty,
          dutyRate,
          availability,
        };
      })
      .sort((a, b) => {
        const loadDiff = a.effectiveComparable - b.effectiveComparable;
        if (loadDiff !== 0) return loadDiff;
        return compareByRankAndName(a, b);
      });
  }, [users, schedule, dayWeights, todayStr, ignoreHistoryInLogic]);

  // Filter based on active status
  const filteredStats = allStats.filter((u) => {
    if (u.isActive && !showActive) return false;
    if (!u.isActive && !showInactive) return false;
    return true;
  });

  // Apply user-selected sort
  const stats = useMemo(() => {
    if (!sortKey) return filteredStats;
    return sortUsersBy(filteredStats, sortKey, sortDir);
  }, [filteredStats, sortKey, sortDir]);

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white py-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-chart-line me-2 text-primary"></i>Статистика навантаження
          </h5>
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${showActive ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setShowActive(!showActive)}
            >
              <i className="fas fa-user-check me-1"></i>
              Активні
            </button>
            <button
              type="button"
              className={`btn ${showInactive ? 'btn-warning' : 'btn-outline-secondary'}`}
              onClick={() => setShowInactive(!showInactive)}
            >
              <i className="fas fa-user-slash me-1"></i>
              Неактивні
            </button>
          </div>
        </div>
      </div>
      {stats.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-users fa-2x mb-3 d-block"></i>
          Немає осіб у складі
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 table-align-center">
            <thead className="table-light small">
              <tr>
                <th rowSpan={2} style={{ userSelect: 'none' }} className="text-start">
                  <span
                    className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
                    style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    onClick={() => toggleSort('name')}
                    title="Сортувати за ПІБ"
                  >
                    ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                  <span
                    className={`badge ${sortKey === 'rank' ? 'bg-primary' : 'bg-light text-secondary border'} fw-semibold text-dark`}
                    style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    onClick={() => toggleSort('rank')}
                    title="Сортувати за званням"
                  >
                    <i className="fas fa-medal me-1" style={{ fontSize: '0.65rem' }}></i>Звання
                    {sortKey === 'rank' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </th>
                <th rowSpan={2} style={{ minWidth: '72px' }}>
                  Чергувань
                  <br />
                  <small className="fw-normal">всього</small>
                </th>
                <th rowSpan={2} style={{ minWidth: '80px' }} className="text-center">
                  В черзі
                </th>
                <th rowSpan={2} style={{ minWidth: '90px' }} className="text-center">
                  Доступних
                  <br />
                  <small className="fw-normal">для чергування</small>
                </th>
                <th colSpan={7} className="text-center border-start">
                  По днях (у черзі)
                </th>
                <th rowSpan={2} className="text-center border-start" style={{ minWidth: '90px' }}>
                  Навантаження
                  <br />
                  (бали)
                </th>
                <th rowSpan={2} className="text-center" style={{ minWidth: '70px' }}>
                  Карма
                </th>
                <th rowSpan={2} className="text-center" style={{ minWidth: '70px' }}>
                  Рейтинг
                </th>
                <th rowSpan={2} className="text-center border-start" style={{ minWidth: '80px' }}>
                  Частота
                  <br />
                  <small className="fw-normal">(нар/день)</small>
                </th>
                <th rowSpan={2} className="text-center border-start" style={{ minWidth: '85px' }}>
                  З дати
                  <i
                    className="fas fa-circle-info ms-1 text-muted"
                    title="Базова дата участі в авточерзі. Після повернення з відпустки/відрядження/лікарняного облік не скидається: порівняння враховує доступність у періоді."
                  />
                  <br />
                  <small className="fw-normal">(учет)</small>
                </th>
              </tr>
              <tr>
                <th className="text-center border-start" style={{ width: '40px' }}>
                  Пн
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Вт
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Ср
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Чт
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Пт
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Сб
                </th>
                <th className="text-center" style={{ width: '40px' }}>
                  Нд
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((u) => {
                // Day counts: Mon=1, Tue=2...Sun=0 -> display as separate columns
                const daysOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

                return (
                  <tr key={u.id} className={!u.isActive ? 'user-row-inactive' : ''}>
                    <td className="text-start">
                      <button
                        type="button"
                        className="btn btn-link p-0 fw-bold text-decoration-none text-start"
                        onClick={() => setSelectedUser(u)}
                      >
                        {u.name}
                      </button>
                      <div className="small text-muted">{formatRank(u.rank)}</div>
                      {u.availability !== 'AVAILABLE' && (
                        <div className="small text-warning">
                          <i className="fas fa-lock me-1"></i>Тимчасово недоступний
                        </div>
                      )}
                    </td>
                    <td className="text-center fw-bold text-primary">{u.totalAllDuties}</td>
                    <td className="text-center fw-bold">{u.totalComparableDuties}</td>
                    <td className="text-center">{u.availableDaysForDuty}</td>
                    {daysOrder.map((dayIdx, i) => (
                      <td
                        key={dayIdx}
                        className={`text-center small${i === 0 ? ' border-start' : ''}`}
                      >
                        {u.dayCountComparable[dayIdx] || 0}
                      </td>
                    ))}
                    <td className="text-center border-start">{u.comparableLoad.toFixed(1)}</td>
                    <td
                      className={
                        u.balance < 0
                          ? 'text-danger fw-bold'
                          : u.balance > 0
                            ? 'text-success fw-bold'
                            : ''
                      }
                    >
                      {u.balance > 0 ? `+${u.balance}` : u.balance}
                    </td>
                    <td className="text-center fw-bold bg-light">
                      {u.effectiveComparable.toFixed(1)}
                    </td>
                    <td
                      className="text-center border-start fw-bold"
                      title={`${u.totalComparableDuties} нарядів / ${u.availableDaysForDuty} днів`}
                    >
                      {u.availableDaysForDuty > 0 ? (
                        <span
                          className={
                            u.dutyRate > 0.15
                              ? 'text-danger'
                              : u.dutyRate > 0.08
                                ? 'text-warning'
                                : 'text-success'
                          }
                        >
                          {u.dutyRate.toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-center border-start small">
                      <div className="text-muted">
                        {new Date(u.trackingFrom).toLocaleDateString('uk-UA', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </div>
                      <div className="fw-bold">{u.totalComparableDuties}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="p-3 text-muted small bg-light">
        <div className="row">
          <div className="col-md-6">
            <ul className="mb-0">
              <li>
                <strong>Чергувань всього</strong>: Загальна кількість нарядів за всю історію в базі.
              </li>
              <li>
                <strong>В черзі</strong>: Скільки нарядів враховується саме для поточної авточерги.
              </li>
              <li>
                <strong>Доступних днів</strong>: Кількість днів, коли особу можна було поставити на
                чергування від дати включення в список (та початку графіка) до сьогодні, за мінусом
                відпустки/відрядження/лікарняного.
              </li>
              <li>
                <strong>Пн-Нд</strong>: Розподіл нарядів по дням тижня тільки в межах поточного
                облікового періоду.
              </li>
            </ul>
          </div>
          <div className="col-md-6">
            <ul className="mb-0">
              <li>
                <strong>Карма</strong>: Мінус (-) коли знявся з наряду за рапортом (винен системі).
                Плюс (+) коли виручив (поставлений вручну на важчий день).
              </li>
              <li>
                <strong>Рейтинг</strong>: Навантаження + Карма. Чим менше, тим вища черга на наряд.
              </li>
              <li>
                <strong>Частота (нар/день)</strong>: Кількість нарядів поділена на кількість
                доступних днів. Чим менше значення, тим рідше особа чергує відносно свого часу в
                підрозділі. Використовується для порівняння чесності розподілу між особами, які
                чергують різний період часу.
              </li>
              <li>
                <strong>З дати</strong>: Дата, з якої система веде порівняння для авточерги. Це не
                перезапуск "з нуля" після повернення, а базова дата участі в авточерзі.
              </li>
            </ul>
          </div>
        </div>
      </div>
      {selectedUser && (
        <UserStatsModal
          user={selectedUser}
          users={users}
          schedule={schedule}
          dayWeights={dayWeights}
          ignoreHistoryInLogic={ignoreHistoryInLogic}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default StatsView;
