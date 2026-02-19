import React, { useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { formatRank } from '../utils/helpers';

interface StatsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
}

const StatsView: React.FC<StatsViewProps> = ({ users, schedule, dayWeights }) => {
  const [showInactive, setShowInactive] = useState(true);
  const [showActive, setShowActive] = useState(true);

  const allStats = users
    .map((u) => {
      const mySched = Object.values(schedule).filter((s) => s.userId === u.id);
      let load = 0;
      const dayCount: Record<number, number> = {}; // Count duties by day of week (0=Sun...6=Sat)

      mySched.forEach((s) => {
        const dayIdx = new Date(s.date).getDay();
        load += dayWeights[dayIdx] || 1.0;
        dayCount[dayIdx] = (dayCount[dayIdx] || 0) + 1;
      });

      const balance = u.debt || 0;
      return {
        ...u,
        realLoad: load,
        balance: balance,
        effective: load + balance,
        totalDuties: mySched.length,
        dayCount: dayCount,
      };
    })
    .sort((a, b) => a.effective - b.effective);

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
              Звільнені
            </button>
          </div>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light small">
            <tr>
              <th rowSpan={2}>Боєць</th>
              <th rowSpan={2}>Всього</th>
              <th colSpan={7} className="text-center">
                Дежурства по днях тижня
              </th>
              <th rowSpan={2}>
                Навантаження
                <br />
                (бали)
              </th>
              <th rowSpan={2}>Карма</th>
              <th rowSpan={2}>Рейтинг</th>
            </tr>
            <tr>
              <th className="text-center" style={{ width: '40px' }}>
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
                    <div className="fw-bold">{u.name}</div>
                    <div className="small text-muted">{formatRank(u.rank)}</div>
                  </td>
                  <td className="text-center fw-bold text-primary">{u.totalDuties}</td>
                  {daysOrder.map((dayIdx) => (
                    <td key={dayIdx} className="text-center small">
                      {u.dayCount[dayIdx] || 0}
                    </td>
                  ))}
                  <td>{u.realLoad.toFixed(1)}</td>
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
                  <td className="fw-bold bg-light">{u.effective.toFixed(1)}</td>
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
                <strong>Всього</strong>: Загальна кількість відпрацьованих нарядів.
              </li>
              <li>
                <strong>Пн-Нд</strong>: Розподіл нарядів по дням тижня.
              </li>
              <li>
                <strong>Навантаження</strong>: Сума балів за всі наряди (Пн-Чт=1.0, Пт/Нд=1.5,
                Сб=2.0).
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
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsView;
