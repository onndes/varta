import React from 'react';
import type { TimelineEvent } from '../../types';

interface TimelineSectionProps {
  timeline: TimelineEvent[];
}

const TimelineSection: React.FC<TimelineSectionProps> = ({ timeline }) => {
  return (
    <>
      <h6 className="fw-bold mt-4 mb-2">
        <i className="fas fa-stream me-2 text-secondary"></i>Персональний журнал
      </h6>
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle table-align-center">
          <thead className="table-light">
            <tr>
              <th style={{ width: '110px' }}>Дата</th>
              <th style={{ width: '220px' }}>Подія</th>
              <th>Деталі</th>
            </tr>
          </thead>
          <tbody>
            {timeline.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-muted py-3">
                  Подій не знайдено
                </td>
              </tr>
            ) : (
              timeline.map((e, idx) => (
                <tr key={`${e.date}-${idx}`}>
                  <td className="text-nowrap small">{e.date}</td>
                  <td>
                    <span className={`badge text-bg-${e.tone}`}>{e.title}</span>
                  </td>
                  <td className="small text-muted">{e.details}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default TimelineSection;
