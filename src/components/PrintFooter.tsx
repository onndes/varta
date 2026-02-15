import React from 'react';
import type { Signatories } from '../types';

interface PrintFooterProps {
  signatories: Signatories;
}

const PrintFooter: React.FC<PrintFooterProps> = ({ signatories }) => {
  return (
    <div className="print-only print-footer-container">
      <div className="d-flex align-items-end">
        <div style={{ marginRight: '15px', fontWeight: 'bold', paddingBottom: '20px' }}>
          Графік склав:
        </div>
        <div style={{ width: '350px' }}>
          <div className="fw-bold text-center">{signatories.creatorRank}</div>
          <div style={{ borderBottom: '1px solid black', width: '100%', height: '20px' }}></div>
          <div className="fw-bold text-center">{signatories.creatorName}</div>
        </div>
      </div>
    </div>
  );
};

export default PrintFooter;
