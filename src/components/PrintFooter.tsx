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
  const rankLower = (r: string) => (r ? r.charAt(0).toLowerCase() + r.slice(1) : '');
  const hasFilled = signatories.creatorPos || signatories.creatorRank || signatories.creatorName;

  return (
    <div className="print-only print-footer-container">
      <div className="print-creator-block">
        <div className="creator-label">Графік склав:</div>
        {hasFilled ? (
          <>
            {signatories.creatorPos && <div className="creator-pos">{signatories.creatorPos}</div>}
            <div className="creator-filled-row">
              {signatories.creatorRank ? (
                <span>{rankLower(signatories.creatorRank)}&nbsp;&nbsp;</span>
              ) : null}
              <span style={{ width: '80px', display: 'inline-block' }}></span>
              {signatories.creatorName ? <span>&nbsp;&nbsp;{signatories.creatorName}</span> : null}
            </div>
          </>
        ) : (
          <>
            <div className="creator-line-empty"></div>
            <div className="creator-row">
              <div className="creator-line-empty"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PrintFooter;
