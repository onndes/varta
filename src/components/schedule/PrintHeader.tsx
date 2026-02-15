import React from 'react';
import type { Signatories } from '../../types';

interface PrintHeaderProps {
  signatories: Signatories;
  weekDates: string[];
}

/**
 * Print Header - ЗСУ document format
 * Logo left, ЗАТВЕРДЖУЮ right, title center
 */
const PrintHeader: React.FC<PrintHeaderProps> = ({ signatories, weekDates }) => {
  const startDate = new Date(weekDates[0]);
  const endDate = new Date(weekDates[6]);
  const dateRange = `${startDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} — ${endDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const hasApprover = signatories.approverPos || signatories.approverName;

  return (
    <div className="print-only print-header-container">
      <div className="print-top-row">
        {/* Logo and app name - left */}
        <div className="print-logo-block">
          <div className="print-app-name">ВАРТА</div>
          <div className="print-app-sub">Система чергувань</div>
        </div>

        {/* ЗАТВЕРДЖУЮ - right */}
        <div className="print-approval-block">
          <div className="approval-title">ЗАТВЕРДЖУЮ</div>
          {hasApprover ? (
            <>
              <div className="approval-text">{signatories.approverPos || '______________________________'}</div>
              <div className="approval-text">{signatories.approverRank || '____________'}</div>
              <div className="approval-name-row">
                <span className="signature-line"></span>
                <span className="approval-name">{signatories.approverName || '______________________'}</span>
              </div>
            </>
          ) : (
            <>
              <div className="approval-line-empty"></div>
              <div className="approval-line-empty"></div>
              <div className="approval-name-row">
                <span className="signature-line"></span>
                <span className="approval-line-short"></span>
              </div>
            </>
          )}
          <div className="approval-date-row">
            <span>"___" </span>
            <span className="approval-date-line"></span>
            <span> 20__ року</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h4 className="print-title">ГРАФІК</h4>
      <div className="print-subtitle">добового чергування на {dateRange}</div>
    </div>
  );
};

export default PrintHeader;
