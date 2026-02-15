import React from 'react';

/**
 * Print Header Component
 * Displayed only when printing
 */
const PrintHeader: React.FC = () => {
  return (
    <div className="print-only print-header-container">
      <div className="text-end mb-2">
        <div className="fw-bold">ЗАТВЕРДЖУЮ</div>
        <div
          style={{
            borderBottom: '1px solid #000',
            width: '250px',
            marginLeft: 'auto',
            height: '15px',
          }}
        ></div>
        <div
          style={{
            borderBottom: '1px solid #000',
            width: '250px',
            marginLeft: 'auto',
            height: '15px',
            marginTop: '5px',
          }}
        ></div>
        <div className="d-flex justify-content-end gap-2 mt-1">
          <span>"___"</span>
          <span
            style={{ borderBottom: '1px solid #000', width: '150px', display: 'inline-block' }}
          ></span>
          <span>20__ року</span>
        </div>
      </div>
      <h4 className="fw-bold text-center mt-3 mb-1">ГРАФІК</h4>
      <div
        className="text-center mb-3"
        style={{ borderBottom: '2px solid #000', paddingBottom: '8px' }}
      ></div>
    </div>
  );
};

export default PrintHeader;
