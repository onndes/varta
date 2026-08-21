// src/components/users/UserStatsTables.tsx — summary stat cards and weekday table
import React from 'react';
import { DAY_NAMES_FULL } from '../../utils/constants';

interface UserStatsTablesProps {
  totalAssignments: number;
  totalLoad: number;
  daysCount: Record<number, number>;
}

/** Stat cards and per-weekday breakdown table for a user. */
const UserStatsTables: React.FC<UserStatsTablesProps> = ({
  totalAssignments,
  totalLoad,
  daysCount,
}) => (
  <>
    <div className="row mb-3">
      <div className="col-6">
        <div className="card bg-light">
          <div className="card-body text-center">
            <h3 className="fw-bold mb-0">{totalAssignments}</h3>
            <small className="text-muted">Всього чергувань</small>
          </div>
        </div>
      </div>
      <div className="col-6">
        <div className="card bg-light">
          <div className="card-body text-center">
            <h3 className="fw-bold mb-0">{totalLoad.toFixed(1)}</h3>
            <small className="text-muted">Навантаження</small>
          </div>
        </div>
      </div>
    </div>

    <div className="d-flex justify-content-center">
      <table
        className="table table-sm table-bordered text-center"
        style={{ width: 'auto', minWidth: '320px' }}
      >
        <thead className="table-light">
          <tr>
            <th className="text-center">День тижня</th>
            <th className="text-center">Відпрацьовано</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
            const dayNum = parseInt(dayKey, 10);
            return (
              <tr key={dayNum}>
                <td>{DAY_NAMES_FULL[dayNum]}</td>
                <td>{daysCount[dayNum] || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </>
);

export default UserStatsTables;
