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
          <i className="fas fa-calendar-alt me-1"></i>Графік
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'users' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('users')}
        >
          <i className="fas fa-users me-1"></i>Особовий склад
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'stats' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('stats')}
        >
          <i className="fas fa-chart-bar me-1"></i>Статистика
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'settings' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('settings')}
        >
          <i className="fas fa-cog me-1"></i>Налаштування
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${activeTab === 'logs' ? 'active fw-bold' : ''}`}
          onClick={() => onTabChange('logs')}
        >
          <i className="fas fa-history me-1"></i>Журнал
        </button>
      </li>
      <li className="nav-item ms-auto">
        <button
          className={`nav-link ${activeTab === 'dev' ? 'active fw-bold text-danger' : 'text-muted opacity-0'}`}
          onClick={() => onTabChange('dev')}
        >
          DEV
        </button>
      </li>
    </ul>
  );
};

export default Navigation;
