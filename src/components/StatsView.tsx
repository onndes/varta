import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import {
  formatRank,
  compareByRankAndName,
  sortUsersBy,
  type SortKey,
  type SortDir,
} from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
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
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyInnerRef = useRef<HTMLDivElement | null>(null);
  const [stickyScrollbar, setStickyScrollbar] = useState({
    visible: false,
    left: 0,
    width: 0,
    bottom: 0,
  });

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
    const countUnavailableDays = (user: User, from: string, to: string): number => {
      let count = 0;
      const cursor = new Date(from);
      const end = new Date(to);
      while (cursor <= end) {
        const iso = toLocalISO(cursor);
        if (getUserAvailabilityStatus(user, iso) !== 'AVAILABLE') {
          count++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return count;
    };

    return users
      .map((u) => {
        const allUserEntries = Object.values(logicSched).filter((s) => isAssignedInEntry(s, u.id!));

        // Дата, з якої ведеться облік для цього бійця:
        // - dateAddedToAuto (якщо задана) — дата включення в авточергу
        // - інакше — дата першого графіка у базі (або сьогодні)
        const rawFairnessFrom = u.dateAddedToAuto;
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
          const statusBlockedDays = countUnavailableDays(u, trackingFrom, todayStr);
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

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const stickyEl = stickyScrollRef.current;
    const stickyInnerEl = stickyInnerRef.current;
    if (!tableEl || !stickyEl || !stickyInnerEl) return;

    let isSyncing = false;
    const syncFromTable = () => {
      if (isSyncing) return;
      isSyncing = true;
      stickyEl.scrollLeft = tableEl.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };
    const syncFromSticky = () => {
      if (isSyncing) return;
      isSyncing = true;
      tableEl.scrollLeft = stickyEl.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const updateStickyScrollbar = () => {
      const hasHorizontalOverflow = tableEl.scrollWidth - tableEl.clientWidth > 1;
      stickyInnerEl.style.width = `${tableEl.scrollWidth}px`;

      const rect = tableEl.getBoundingClientRect();
      const footerEl = document.querySelector('.app-footer') as HTMLElement | null;
      const footerRect = footerEl?.getBoundingClientRect();
      const footerBottomOffset =
        footerRect && footerRect.top < window.innerHeight
          ? Math.max(0, window.innerHeight - footerRect.top)
          : 0;
      const viewportBottom = window.innerHeight - footerBottomOffset;
      const shouldStick =
        hasHorizontalOverflow && rect.top < viewportBottom && rect.bottom > viewportBottom;

      const next = {
        visible: shouldStick,
        left: Math.max(0, rect.left),
        width: Math.max(0, rect.width),
        bottom: footerBottomOffset,
      };
      setStickyScrollbar((prev) =>
        prev.visible === next.visible &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.bottom === next.bottom
          ? prev
          : next
      );
    };

    const appContentEl = tableEl.closest('.app-content');
    tableEl.addEventListener('scroll', syncFromTable, { passive: true });
    stickyEl.addEventListener('scroll', syncFromSticky, { passive: true });
    appContentEl?.addEventListener('scroll', updateStickyScrollbar, { passive: true });
    window.addEventListener('resize', updateStickyScrollbar);

    const ro = new ResizeObserver(updateStickyScrollbar);
    ro.observe(tableEl);
    const tableTag = tableEl.querySelector('table');
    if (tableTag) ro.observe(tableTag);

    updateStickyScrollbar();
    syncFromTable();

    return () => {
      tableEl.removeEventListener('scroll', syncFromTable);
      stickyEl.removeEventListener('scroll', syncFromSticky);
      appContentEl?.removeEventListener('scroll', updateStickyScrollbar);
      window.removeEventListener('resize', updateStickyScrollbar);
      ro.disconnect();
    };
  }, [stats.length, showActive, showInactive, sortKey, sortDir]);

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white py-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-chart-line me-2 text-primary"></i>Статистика навантаження
          </h5>
          <div className="d-flex gap-2 align-items-center">
            <div className="btn-group btn-group-sm" role="group">
              <button
                type="button"
                className={`btn btn-sm stats-filter-btn ${showActive ? 'is-on' : ''}`}
                onClick={() => setShowActive(!showActive)}
              >
                <i className="fas fa-user-check me-1"></i>
                Активні
              </button>
              <button
                type="button"
                className={`btn btn-sm stats-filter-btn ${showInactive ? 'is-on' : ''}`}
                onClick={() => setShowInactive(!showInactive)}
              >
                <i className="fas fa-user-slash me-1"></i>
                Неактивні
              </button>
            </div>
          </div>
        </div>
      </div>
      {stats.length === 0 ? (
        <div className="text-center text-muted py-5 d-flex flex-column align-items-center">
          <i className="fas fa-users fa-2x mb-3"></i>
          <span>Немає осіб у складі</span>
        </div>
      ) : (
        <>
          <div ref={tableScrollRef} className="table-responsive stats-table-scroll">
            <table className="table table-hover align-middle mb-0 table-align-center stats-table">
              <thead className="table-light small">
                <tr>
                  <th
                    rowSpan={2}
                    style={{ userSelect: 'none', minWidth: '70px', whiteSpace: 'nowrap' }}
                    className="text-start"
                  >
                    <span
                      className={`badge ${sortKey === 'rank' ? 'bg-primary' : 'bg-light text-secondary border'} fw-semibold text-dark`}
                      style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                      onClick={() => toggleSort('rank')}
                      title="Сортувати за званням"
                    >
                      <i className="fas fa-medal me-1" style={{ fontSize: '0.65rem' }}></i>Зв.
                      {sortKey === 'rank' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </span>
                  </th>
                  <th rowSpan={2} style={{ userSelect: 'none' }} className="text-start">
                    <span
                      className={`badge ${sortKey === 'name' ? 'bg-primary' : 'bg-light text-secondary border'} me-1 fw-semibold text-dark`}
                      style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                      onClick={() => toggleSort('name')}
                      title="Сортувати за ПІБ"
                    >
                      ПІБ{sortKey === 'name' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
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
                    Днів в графіку
                    <br />
                    <small className="fw-normal">в обліку</small>
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
                        <small
                          className="text-muted text-uppercase"
                          style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
                        >
                          {formatRank(u.rank)}
                        </small>
                      </td>
                      <td className="text-start">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-decoration-none text-start"
                          onClick={() => setSelectedUser(u)}
                        >
                          <div
                            className="fw-bold text-uppercase"
                            style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
                          >
                            {u.name.trim().split(/\s+/)[0]}
                          </div>
                          {u.name.trim().split(/\s+/).length > 1 && (
                            <div
                              className="text-muted"
                              style={{ fontSize: '0.73rem', opacity: 0.7, lineHeight: 1.2 }}
                            >
                              {u.name.trim().split(/\s+/).slice(1).join(' ')}
                            </div>
                          )}
                        </button>
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
                      <td className="text-center fw-bold">{u.effectiveComparable.toFixed(1)}</td>
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
          <div
            ref={stickyScrollRef}
            className={`stats-sticky-scrollbar${stickyScrollbar.visible ? ' is-visible' : ''}`}
            style={{
              left: `${stickyScrollbar.left}px`,
              width: `${stickyScrollbar.width}px`,
              bottom: `${stickyScrollbar.bottom}px`,
            }}
            aria-hidden={!stickyScrollbar.visible}
          >
            <div ref={stickyInnerRef} className="stats-sticky-scrollbar__inner"></div>
          </div>
        </>
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
                <strong>Днів в графіку</strong>: Кількість календарних днів від дати включення в
                облік до сьогодні (мінус відпустка/відрядження/лікарняний). Це період перебування в
                обліку, а не кількість призначень.
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
                <strong>Частота (нар/день)</strong>: Кількість нарядів поділена на кількість днів у
                черзі. Чим менше значення, тим рідше особа чергує відносно свого часу в обліку.
                Використовується для порівняння чесності розподілу між особами, які чергують різний
                період часу.
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
