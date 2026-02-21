import React from 'react';
import type { PrintMode } from '../types';
import InfoButton from './InfoButton';
import WorkspaceSelector from './WorkspaceSelector';

interface HeaderProps {
  needsExport: boolean;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onPrint: (mode: PrintMode) => void;
  onWorkspaceSwitch: () => Promise<void>;
}

const Header: React.FC<HeaderProps> = ({
  needsExport,
  onImport,
  onExport,
  onPrint,
  onWorkspaceSwitch,
}) => {
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
          <div className="d-flex align-items-center">
            <h4 className="m-0 fw-bold text-dark">ВАРТА</h4>
            <InfoButton />
          </div>
          <small className="text-muted">Система розподілу чергувань</small>
        </div>
      </div>
      <div className="d-flex align-items-center">
        <div className="ms-3">
          <WorkspaceSelector onSwitch={onWorkspaceSwitch} />
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
            <span className="visually-hidden">Обрати формат</span>
          </button>
          <ul className="dropdown-menu dropdown-menu-end">
            <li>
              <button className="dropdown-item" onClick={() => onPrint('calendar')}>
                <i className="fas fa-calendar-days me-2"></i>Графік (календар)
              </button>
            </li>
            <li>
              <button className="dropdown-item" onClick={() => onPrint('duty-table')}>
                <i className="fas fa-table me-2"></i>Графік (таблиця)
              </button>
            </li>
            <li>
              <hr className="dropdown-divider" />
            </li>
            <li>
              <button className="dropdown-item" onClick={() => onPrint('status-list')}>
                <i className="fas fa-clipboard-list me-2"></i>Довідка по складу
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Header;
