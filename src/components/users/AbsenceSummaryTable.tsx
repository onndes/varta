// src/components/users/AbsenceSummaryTable.tsx — absence counts table and per-category display
import React from 'react';
import { ABSENCE_LABELS, type AbsenceKey } from './absenceSectionUtils';

interface AbsenceSummaryTableProps {
  visibleAbsenceKeys: AbsenceKey[];
  absenceCounts: Record<AbsenceKey, number>;
  availableDaysTotal: number;
}

/** Summary table showing absence counts per category and available duty days. */
const AbsenceSummaryTable: React.FC<AbsenceSummaryTableProps> = ({
  visibleAbsenceKeys,
  absenceCounts,
  availableDaysTotal,
}) => (
  <>
    <div className="small text-muted mb-2">
      Показано тільки вибрані категорії. Для відсутностей враховуються дні, для рапортів - кількість
      випадків.
    </div>
    <div className="small mb-2">
      <strong>Доступних днів для чергування:</strong> {availableDaysTotal}
    </div>
    <div className="d-flex justify-content-center">
      <table
        className="table table-sm mb-0 text-center"
        style={{ width: 'auto', minWidth: '280px' }}
      >
        <thead>
          <tr>
            <th className="text-center">Категорія</th>
            <th className="text-center">Кількість</th>
          </tr>
        </thead>
        <tbody>
          {visibleAbsenceKeys.length === 0 ? (
            <tr>
              <td colSpan={2} className="text-center text-muted">
                Оберіть хоча б одну категорію
              </td>
            </tr>
          ) : (
            visibleAbsenceKeys.map((key) => (
              <tr key={key}>
                <td>{ABSENCE_LABELS[key]}</td>
                <td className="fw-bold">{absenceCounts[key]}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </>
);

export default AbsenceSummaryTable;
