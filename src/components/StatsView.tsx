import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { formatRank } from '../utils/helpers';
import { toLocalISO } from '../utils/dateUtils';
import { getUserFairnessFrom } from '../utils/fairness';
import { getUserAvailabilityStatus } from '../services/userService';
import UserStatsModal from './users/UserStatsModal';
import { isAssignedInEntry } from '../utils/assignment';

interface StatsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
}

const StatsView: React.FC<StatsViewProps> = ({ users, schedule, dayWeights }) => {
  const [showInactive, setShowInactive] = useState(true);
  const [showActive, setShowActive] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const todayStr = toLocalISO(new Date());

  const allStats = useMemo(() => {
    const scheduleDates = Object.keys(schedule).sort();
    const earliestScheduleDate = scheduleDates[0] || todayStr;
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
        const allUserEntries = Object.values(schedule).filter((s) => isAssignedInEntry(s, u.id!));
        const fairnessFrom = getUserFairnessFrom(u, todayStr);
        const comparableEntries = allUserEntries.filter((s) => !fairnessFrom || s.date >= fairnessFrom);
        const addedFrom = u.dateAddedToAuto && u.dateAddedToAuto > earliestScheduleDate
          ? u.dateAddedToAuto
          : earliestScheduleDate;

        let comparableLoad = 0;
        const dayCountComparable: Record<number, number> = {};

        comparableEntries.forEach((s) => {
          const dayIdx = new Date(s.date).getDay();
          comparableLoad += dayWeights[dayIdx] || 1.0;
          dayCountComparable[dayIdx] = (dayCountComparable[dayIdx] || 0) + 1;
        });

        let availableDaysForDuty = 0;
        if (addedFrom <= todayStr) {
          const totalWindowDays =
            Math.floor((new Date(todayStr).getTime() - new Date(addedFrom).getTime()) / 86400000) + 1;
          const statusBlockedDays =
            u.status === 'VACATION' || u.status === 'TRIP' || u.status === 'SICK'
              ? overlapDays(addedFrom, todayStr, u.statusFrom, u.statusTo)
              : 0;
          availableDaysForDuty = Math.max(0, totalWindowDays - statusBlockedDays);
        }

        const balance = u.debt || 0;
        const availability = getUserAvailabilityStatus(u, todayStr);
        return {
          ...u,
          balance,
          fairnessFrom,
          addedFrom,
          totalAllDuties: allUserEntries.length,
          totalComparableDuties: comparableEntries.length,
          comparableLoad,
          effectiveComparable: comparableLoad + balance,
          dayCountComparable,
          availableDaysForDuty,
          availability,
        };
      })
      .sort((a, b) => a.effectiveComparable - b.effectiveComparable);
  }, [users, schedule, dayWeights, todayStr]);

  // Filter based on active status
  const stats = allStats.filter((u) => {
    if (u.isActive && !showActive) return false;
    if (!u.isActive && !showInactive) return false;
    return true;
  });

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
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0 table-align-center">
          <thead className="table-light small">
            <tr>
              <th rowSpan={2}>Боєць</th>
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
                      className="btn btn-link p-0 fw-bold text-decoration-none"
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
                  <td className="text-center fw-bold bg-light">{u.effectiveComparable.toFixed(1)}</td>
                  <td className="text-center border-start small">
                    {u.fairnessFrom ? (
                      <>
                        <div className="text-muted">
                          {new Date(u.fairnessFrom).toLocaleDateString('uk-UA', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                          })}
                        </div>
                        <div className="fw-bold">{u.totalComparableDuties}</div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
                <strong>Доступних днів</strong>: Кількість днів, коли бійця можна було поставити на
                чергування від дати включення в список (та початку графіка) до сьогодні, за
                мінусом відпустки/відрядження/лікарняного.
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
                <strong>З дати</strong>: Дата, з якої система веде порівняння для авточерги.
                Це не перезапуск "з нуля" після повернення, а базова дата участі в авточерзі.
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
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default StatsView;
