// src/components/users/UserStatsTables.tsx — summary stat cards, owed-days alert, and weekday table
import React from 'react';
import { DAY_NAMES_FULL } from '../../utils/constants';

interface UserStatsTablesProps {
  totalAssignments: number;
  totalLoad: number;
  debt: number;
  owedDays: Record<number, number>;
  daysCount: Record<number, number>;
}

/** Stat cards, owed-days warning, and per-weekday breakdown table for a user. */
const UserStatsTables: React.FC<UserStatsTablesProps> = ({
  totalAssignments,
  totalLoad,
  debt,
  owedDays,
  daysCount,
}) => {
  const hasOwedDays = Object.values(owedDays).some((v) => v > 0);

  return (
    <>
      <div className="row mb-3">
        <div className="col-4">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalAssignments}</h3>
              <small className="text-muted">Всього чергувань</small>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalLoad.toFixed(1)}</h3>
              <small className="text-muted">Навантаження</small>
            </div>
          </div>
        </div>
        <div className="col-4">
          <div className={`card ${debt < 0 ? 'bg-danger bg-opacity-10' : 'bg-light'}`}>
            <div className="card-body text-center">
              <h3
                className={`fw-bold mb-0 ${debt < 0 ? 'text-danger' : debt > 0 ? 'text-success' : ''}`}
              >
                {debt > 0 ? '+' : ''}
                {debt.toFixed(1)}
              </h3>
              <small className="text-muted">Карма</small>
            </div>
          </div>
        </div>
      </div>

      {hasOwedDays && (
        <div className="alert alert-warning py-2 mb-3">
          <i className="fas fa-exclamation-triangle me-2"></i>
          <strong>Повинен відробити:</strong>{' '}
          {Object.entries(owedDays)
            .filter(([, v]) => v > 0)
            .map(([day, count]) => `${DAY_NAMES_FULL[parseInt(day)]} (${count})`)
            .join(', ')}
        </div>
      )}

      <div className="d-flex justify-content-center">
        <table
          className="table table-sm table-bordered text-center"
          style={{ width: 'auto', minWidth: '320px' }}
        >
          <thead className="table-light">
            <tr>
              <th className="text-center">День тижня</th>
              <th className="text-center">Відпрацьовано</th>
              <th className="text-center">Борг</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
              const dayNum = parseInt(dayKey, 10);
              const owed = owedDays[dayNum] || 0;
              return (
                <tr key={dayNum} className={owed > 0 ? 'table-warning' : ''}>
                  <td>{DAY_NAMES_FULL[dayNum]}</td>
                  <td>{daysCount[dayNum] || 0}</td>
                  <td>{owed > 0 ? <span className="text-danger fw-bold">{owed}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default UserStatsTables;
