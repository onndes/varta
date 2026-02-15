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
        <div className="col-6">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalAssignments}</h3>
              <small className="text-muted">Всього днів</small>
            </div>
          </div>
        </div>
        <div className="col-6">
          <div className="card bg-light">
            <div className="card-body text-center">
              <h3 className="fw-bold mb-0">{totalLoad.toFixed(1)}</h3>
              <small className="text-muted">Навантаження (з вагою)</small>
            </div>
          </div>
        </div>
      </div>
      <table className="table table-sm table-bordered">
        <thead className="table-light">
          <tr>
            <th>День тижня</th>
            <th className="text-end">Кількість</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(DAY_NAMES_FULL).map((dayKey) => {
            const dayNum = parseInt(dayKey, 10);
            return (
              <tr key={dayNum}>
                <td>{DAY_NAMES_FULL[dayNum]}</td>
                <td className="text-end">{daysCount[dayNum] || 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

export default UserStatsModal;
