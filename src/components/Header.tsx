import React, { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  needsExport: boolean;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onPrint: (mode: 'calendar' | 'table') => void;
}

const Header: React.FC<HeaderProps> = ({ needsExport, onImport, onExport, onPrint }) => {
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPrintMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="header-simple d-flex justify-content-between align-items-center no-print">
      <div className="d-flex align-items-center">
        <div
          className="bg-dark text-white rounded p-2 me-3 d-flex align-items-center justify-content-center"
          style={{ width: 45, height: 45 }}
        >
          <i className="fas fa-shield-alt fa-lg"></i>
        </div>
        <div>
          <h4 className="m-0 fw-bold text-dark">ВАРТА-2026</h4>
          <small className="text-muted">Система розподілу</small>
        </div>
      </div>
      <div className="d-flex gap-2">
        <label className="btn btn-outline-secondary btn-sm">
          <i className="fas fa-upload me-1"></i>Імпорт
          <input type="file" hidden onChange={onImport} accept=".json" />
        </label>
        <button
          className={`btn btn-sm ${needsExport ? 'btn-danger btn-export-dirty' : 'btn-outline-secondary'}`}
          onClick={onExport}
        >
          <i className="fas fa-download me-1"></i>Експорт
        </button>
        <div className="btn-group" ref={menuRef} style={{ position: 'relative' }}>
          <button className="btn btn-dark btn-sm" onClick={() => onPrint('calendar')}>
            <i className="fas fa-print me-1"></i>Друк
          </button>
          <button
            className="btn btn-dark btn-sm"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', padding: '0 8px' }}
            onClick={() => setShowPrintMenu(!showPrintMenu)}
          >
            <i className="fas fa-caret-down"></i>
          </button>
          {showPrintMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: 'white',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                zIndex: 1000,
                minWidth: '180px',
              }}
            >
              <button
                className="d-block w-100 text-start border-0 bg-transparent px-3 py-2"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { onPrint('calendar'); setShowPrintMenu(false); }}
              >
                <i className="fas fa-calendar-alt me-2"></i>Друк — Календар
              </button>
              <button
                className="d-block w-100 text-start border-0 bg-transparent px-3 py-2"
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => { onPrint('table'); setShowPrintMenu(false); }}
              >
                <i className="fas fa-table me-2"></i>Друк — Таблиця
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;
