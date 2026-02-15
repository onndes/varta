import React from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { formatRank } from '../utils/helpers';

interface StatsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
}

const StatsView: React.FC<StatsViewProps> = ({ users, schedule, dayWeights }) => {
  const stats = users
    .map((u) => {
      const mySched = Object.values(schedule).filter((s) => s.userId === u.id);
      let load = 0;
      mySched.forEach((s) => {
        const dayIdx = new Date(s.date).getDay();
        load += dayWeights[dayIdx] || 1.0;
      });
      const balance = u.debt || 0;
      return {
        ...u,
        realLoad: load,
        balance: balance,
        effective: load + balance,
      };
    })
    .sort((a, b) => a.effective - b.effective);

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-chart-line me-2 text-primary"></i>Статистика навантаження
        </h5>
      </div>
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Боєць</th>
              <th>Фактичне навантаження (бали)</th>
              <th>Карма</th>
              <th>Рейтинг (для черги)</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((u) => (
              <tr key={u.id} className={!u.isActive ? 'user-row-inactive' : ''}>
                <td className="text-start">
                  <div className="fw-bold">{u.name}</div>
                  <div className="small text-muted">{formatRank(u.rank)}</div>
                </td>
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
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 text-muted small bg-light">
        <ul className="mb-0">
          <li>
            <strong>Фактичне навантаження</strong>: Сума балів за всі відпрацьовані наряди.
          </li>
          <li>
            <strong>Карма</strong>: Мінус (-) коли знявся з наряду за рапортом (винен системі). Плюс (+)
            коли виручив (поставили вручну на важчий день).
          </li>
          <li>
            <strong>Рейтинг</strong>: Фактичне + Карма. Чим менше це число, тим швидше система
            призначить наряд.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default StatsView;
