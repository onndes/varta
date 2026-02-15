import React from 'react';
import type { Signatories } from '../types';

interface PrintFooterProps {
  signatories: Signatories;
}

const PrintFooter: React.FC<PrintFooterProps> = ({ signatories }) => {
  return (
    <div className="print-only print-footer-container">
      <div className="d-flex justify-content-between align-items-end mt-3">
        <div className="creator-block">
          <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', paddingBottom: '20px' }}>
            Графік склав:
          </div>
          <div style={{ width: '300px', textAlign: 'center' }}>
            <div className="fw-bold">{signatories.creatorRank}</div>
            <div style={{ borderBottom: '1px solid black', height: '20px' }}></div>
            <div className="fw-bold">{signatories.creatorName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintFooter;
