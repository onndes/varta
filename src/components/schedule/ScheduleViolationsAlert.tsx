// src/components/schedule/ScheduleViolationsAlert.tsx

import React from 'react';
import Modal from '../Modal';
import type { ScheduleViolation } from '../../utils/scheduleValidation';

interface ScheduleViolationsAlertProps {
  show: boolean;
  violations: ScheduleViolation[];
  onConfirmPrint: () => void;
  onCancel: () => void;
}

const TYPE_BADGE: Record<ScheduleViolation['type'], React.ReactNode> = {
  OVERLOAD: <span className="badge bg-danger">Перевантаження</span>,
  CONSECUTIVE: <span className="badge bg-warning text-dark">Підряд</span>,
  UNDERSTAFFED: <span className="badge bg-secondary">Неукомплектовано</span>,
};

const ScheduleViolationsAlert: React.FC<ScheduleViolationsAlertProps> = ({
  show,
  violations,
  onConfirmPrint,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <Modal
      show={show}
      onClose={onCancel}
      title="⚠️ Графік містить порушення"
      size="modal-lg"
      footer={
        <>
          <button className="btn btn-danger" onClick={onConfirmPrint}>
            <i className="fas fa-print me-1" />
            Друкувати попри порушення
          </button>
          <button className="btn btn-outline-secondary ms-2" onClick={onCancel}>
            Скасувати
          </button>
        </>
      }
    >
      <div className="alert alert-danger mb-3" role="alert">
        Графік сформовано з відхиленнями від налаштувань. Перевірте перед друком.
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-bordered mb-0" style={{ fontSize: '0.88rem' }}>
          <thead className="table-light">
            <tr>
              <th style={{ width: '7rem' }}>Дата</th>
              <th style={{ width: '9rem' }}>Тип</th>
              <th>Деталі</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v, i) => (
              <tr key={i}>
                <td className="text-nowrap">{v.date}</td>
                <td>{TYPE_BADGE[v.type]}</td>
                <td>{v.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

export default ScheduleViolationsAlert;
