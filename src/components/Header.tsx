import React from 'react';
import type { PrintMode, AppTheme } from '../types';
import WorkspaceSelector from './WorkspaceSelector';

interface HeaderProps {
  needsExport: boolean;
  hasData: boolean;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onExport: () => void;
  onPrint: (mode: PrintMode) => void;
  onWorkspaceSwitch: () => Promise<void>;
  theme: AppTheme;
  onSaveTheme: (theme: AppTheme) => Promise<void>;
}

const THEMES: { id: AppTheme; label: string; icon: string }[] = [
  { id: 'light', label: 'Світла', icon: 'fas fa-sun' },
  { id: 'dark', label: 'Темна', icon: 'fas fa-moon' },
];

const Header: React.FC<HeaderProps> = ({
  needsExport,
  hasData,
  onImport,
  onExport,
  onPrint,
  onWorkspaceSwitch,
  theme,
  onSaveTheme,
}) => {
  const todayFormatted = new Date().toLocaleDateString('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="app-header no-print">
      <div className="app-header__left">
        <span className="text-muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
          <i className="far fa-calendar-alt me-1"></i>
          {todayFormatted}
        </span>
        <div className="ms-2">
          <WorkspaceSelector onSwitch={onWorkspaceSwitch} />
        </div>
      </div>
      <div className="app-header__center" />
      <div className="app-header__right">
        <label className="btn btn-outline-secondary btn-sm">
          <i className="fas fa-upload me-1"></i>Імпорт
          <input type="file" hidden onChange={onImport} accept=".json" />
        </label>
        <button
          className={`btn btn-sm ${needsExport ? 'btn-danger btn-export-dirty' : 'btn-outline-secondary'}`}
          onClick={onExport}
          disabled={!hasData}
          title={!hasData ? 'База порожня — нема що експортувати' : ''}
        >
          <i className="fas fa-download me-1"></i>Експорт
        </button>
        <div className="btn-group">
          <button className="btn btn-dark btn-sm" onClick={() => onPrint('duty-table')}>
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

        {/* Theme switcher */}
        <div className="btn-group">
          <button
            className="btn btn-outline-secondary btn-sm dropdown-toggle"
            data-bs-toggle="dropdown"
            aria-expanded="false"
            title="Тема оформлення"
          >
            <i className={THEMES.find((t) => t.id === theme)?.icon ?? 'fas fa-palette'}></i>
          </button>
          <ul className="dropdown-menu dropdown-menu-end">
            {THEMES.map((t) => (
              <li key={t.id}>
                <button
                  className={`dropdown-item d-flex align-items-center gap-2${
                    theme === t.id ? ' active' : ''
                  }`}
                  onClick={() => onSaveTheme(t.id)}
                >
                  <i className={t.icon} style={{ width: 16 }}></i>
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Header;
