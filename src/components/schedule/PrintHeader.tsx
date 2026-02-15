import React from 'react';
import type { Signatories } from '../../types';
import shieldIcon from '../../assets/shield.png';

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
  const defaultSubtitle = `добового чергування на ${startDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} — ${endDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const rankLower = (r: string) => (r ? r.charAt(0).toLowerCase() + r.slice(1) : '');
  const hasFilled = signatories.approverPos || signatories.approverRank || signatories.approverName;

  return (
    <div className="print-only print-header-container">
      <div className="print-top-row">
        {/* Logo - left */}
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <div
              className="bg-white text-white rounded p-2 me-2 d-flex align-items-center justify-content-center"
              style={{ width: 60, height: 60 }}
            >
              <img src={shieldIcon} alt="Shield" style={{ width: '100%', height: '100%' }} />
            </div>
            <div>
              <h4 className="m-0 fw-bold text-dark">ВАРТА</h4>
              <small className="text-muted">Система розподілу чергувань</small>
            </div>
          </div>
        </div>

        {/* ЗАТВЕРДЖУЮ - right */}
        <div className="print-approval-block">
          <div className="approval-title">ЗАТВЕРДЖУЮ</div>
          {hasFilled ? (
            <>
              {signatories.approverPos && (
                <div className="approval-text">{signatories.approverPos}</div>
              )}
              <div className="approval-filled-row">
                {signatories.approverRank ? (
                  <span>{rankLower(signatories.approverRank)}.&nbsp;&nbsp;</span>
                ) : null}
                <span style={{ width: '80px', display: 'inline-block' }}></span>
                {signatories.approverName ? (
                  <span>&nbsp;&nbsp;{signatories.approverName}</span>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="approval-line-empty"></div>
              <div className="approval-line-empty"></div>
            </>
          )}
          <div className="approval-date-row">
            "<span className="approval-date-line" style={{ maxWidth: '20px' }}></span>"
            <span className="approval-date-line"></span>
            <span style={{ marginBottom: '-6px', marginLeft: '4px' }}>
              20
              <span
                className="approval-date-line"
                style={{ maxWidth: '20px', marginLeft: '4px' }}
              ></span>{' '}
              року
            </span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="print-title-spacer"></div>
      <h4 className="print-title">{signatories.scheduleTitle || 'ГРАФІК'}</h4>
      <div className="print-subtitle">{signatories.scheduleSubtitle || defaultSubtitle}</div>
      {signatories.scheduleLine3 && (
        <div className="print-subtitle">{signatories.scheduleLine3}</div>
      )}
    </div>
  );
};

export default PrintHeader;
