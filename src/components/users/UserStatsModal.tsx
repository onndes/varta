import React from 'react';
import type { User, ScheduleEntry, DayWeights } from '../../types';
import { DAY_NAMES_FULL } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';
import Modal from '../Modal';

interface UserStatsModalProps {
  user: User;
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  onClose: () => void;
}

const UserStatsModal: React.FC<UserStatsModalProps> = ({ user, schedule, dayWeights, onClose }) => {
  const userSchedule = Object.values(schedule).filter((s) => s.userId === user.id);
  const totalAssignments = userSchedule.length;

  const dates = userSchedule.map((s) => s.date).sort();
  const firstDuty = dates.length > 0 ? new Date(dates[0]).toLocaleDateString('uk-UA') : 'Немає';

  const daysCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let totalLoad = 0;

  userSchedule.forEach((s) => {
    const d = new Date(s.date).getDay();
    daysCount[d]++;
    totalLoad += dayWeights[d] || 1.0;
  });

  const owedDays = user.owedDays || {};
  const hasOwedDays = Object.values(owedDays).some((v) => v > 0);

  return (
    <Modal
      show={true}
      onClose={onClose}
      title={`${formatRank(user.rank)} ${user.name}`}
      size="modal-lg"
    >
      <div className="alert alert-secondary mb-3">
        <strong>Перше чергування:</strong> {firstDuty}
      </div>
      <div className="row mb-3">
        <div className="col-4">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalAssignments}</h3>
              <small className="text-muted">Всього днів</small>
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
          <div className={`card ${user.debt < 0 ? 'bg-danger bg-opacity-10' : 'bg-light'}`}>
            <div className="card-body text-center">
              <h3 className={`fw-bold mb-0 ${user.debt < 0 ? 'text-danger' : user.debt > 0 ? 'text-success' : ''}`}>
                {user.debt > 0 ? '+' : ''}{user.debt.toFixed(1)}
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

      <table className="table table-sm table-bordered">
        <thead className="table-light">
          <tr>
            <th>День тижня</th>
            <th className="text-end">Відпрацьовано</th>
            <th className="text-end">Борг</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
            const dayNum = parseInt(dayKey, 10);
            const owed = owedDays[dayNum] || 0;
            return (
              <tr key={dayNum} className={owed > 0 ? 'table-warning' : ''}>
                <td>{DAY_NAMES_FULL[dayNum]}</td>
                <td className="text-end">{daysCount[dayNum] || 0}</td>
                <td className="text-end">{owed > 0 ? <span className="text-danger fw-bold">{owed}</span> : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

export default UserStatsModal;
