import React from 'react';
import type { Signatories } from '../types';

interface PrintFooterProps {
  signatories: Signatories;
}

/**
 * Print Footer - ЗСУ document format
 * Shows who created the schedule
 */
const PrintFooter: React.FC<PrintFooterProps> = ({ signatories }) => {
  const hasCreator = signatories.creatorRank || signatories.creatorName;

  return (
    <div className="print-only print-footer-container">
      <div className="print-creator-block">
        <div className="creator-label">Графік склав:</div>
        {hasCreator ? (
          <div className="creator-row">
            <span className="creator-rank">{signatories.creatorRank || '____________'}</span>
            <span className="signature-line"></span>
            <span className="creator-name">{signatories.creatorName || '______________________'}</span>
          </div>
        ) : (
          <div className="creator-row">
            <span className="creator-line-short"></span>
            <span className="signature-line"></span>
            <span className="creator-line-short"></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintFooter;
