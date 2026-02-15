import React from 'react';
import type { Signatories } from '../types';

interface PrintFooterProps {
  signatories: Signatories;
}

const PrintFooter: React.FC<PrintFooterProps> = () => {
  return (
    <div className="print-only print-footer-container">
      <div style={{ borderBottom: '2px solid #000', marginBottom: '15px' }}></div>
      <div style={{ borderBottom: '1px solid #000', width: '350px', height: '15px', marginBottom: '10px' }}></div>
    </div>
  );
};

export default PrintFooter;
