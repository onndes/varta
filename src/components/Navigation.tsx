import React from 'react';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <ul className="nav nav-tabs mb-4 no-print">
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'schedule' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('schedule')}
        >
          Графік
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'users' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('users')}
        >
          Особовий склад
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'stats' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('stats')}
        >
          Статистика
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'settings' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          Налаштування
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'logs' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('logs')}
        >
          Журнал
        </button>
      </li>
      <li className="nav-item ms-auto">
        <button
          className={`nav-link ${activeTab === 'dev' ? 'active fw-bold text-danger' : 'text-muted'}`}
          onClick={() => onTabChange('dev')}
        >
          DEV
        </button>
      </li>
    </ul>
  );
};

export default Navigation;
