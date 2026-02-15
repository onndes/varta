import React from 'react';

interface HeaderProps {
  needsExport: boolean;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onPrint: (mode: 'calendar' | 'table') => void;
}

const Header: React.FC<HeaderProps> = ({ needsExport, onImport, onExport, onPrint }) => {
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
        <div className="btn-group">
          <button className="btn btn-dark btn-sm" onClick={() => onPrint('calendar')}>
            <i className="fas fa-print me-1"></i>Друк
          </button>
          <button
            className="btn btn-dark btn-sm dropdown-toggle dropdown-toggle-split"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <span className="visually-hidden">Варіанти друку</span>
          </button>
          <ul className="dropdown-menu dropdown-menu-end">
            <li>
              <button className="dropdown-item" onClick={() => onPrint('calendar')}>
                <i className="fas fa-calendar-alt me-2"></i>Календар
              </button>
            </li>
            <li>
              <button className="dropdown-item" onClick={() => onPrint('table')}>
                <i className="fas fa-table me-2"></i>Таблиця
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Header;
