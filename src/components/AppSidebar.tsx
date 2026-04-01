// src/components/AppSidebar.tsx — navigation sidebar with brand, nav tabs, and collapse toggle
import React from 'react';
import InfoButton from './InfoButton';

/** Navigation tab definition used by the sidebar. */
interface NavTab {
  id: string;
  icon: string;
  label: string;
}

/** Tabs shown in the sidebar navigation. */
const NAV_TABS: NavTab[] = [
  { id: 'schedule', icon: 'fa-calendar-alt', label: 'Графік' },
  { id: 'users', icon: 'fa-users', label: 'Чергові' },
  { id: 'personnel', icon: 'fa-id-card', label: 'Особовий склад' },
  { id: 'stats', icon: 'fa-chart-bar', label: 'Статистика' },
  { id: 'settings', icon: 'fa-cog', label: 'Налаштування' },
  { id: 'logs', icon: 'fa-history', label: 'Журнал' },
];

interface AppSidebarProps {
  sidebarCollapsed: boolean;
  onCollapseToggle: () => void;
  activeTab: string;
  onTabChange: (id: string) => void;
  displayVersionLabel: string;
  showDevToolsMenu?: boolean;
}

/** Application sidebar with brand header, tab navigation, and collapse control. */
const AppSidebar: React.FC<AppSidebarProps> = ({
  sidebarCollapsed,
  onCollapseToggle,
  activeTab,
  onTabChange,
  displayVersionLabel,
  showDevToolsMenu = false,
}) => (
  <aside className="app-sidebar no-print">
    <div className="app-sidebar__brand">
      <div className="app-sidebar__brand-icon">
        <i className="fas fa-shield-alt"></i>
      </div>
      <div className="app-sidebar__brand-text">
        <span className="app-sidebar__brand-name">ВАРТА</span>
        <span className="app-sidebar__brand-sub">{displayVersionLabel}</span>
      </div>
    </div>

    <nav className="app-sidebar__nav">
      {NAV_TABS.map((tab) => (
        <button
          key={tab.id}
          className={`app-sidebar__item ${activeTab === tab.id ? 'app-sidebar__item--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          title={tab.label}
        >
          <i className={`fas ${tab.icon} app-sidebar__icon`}></i>
          <span className="app-sidebar__label">{tab.label}</span>
        </button>
      ))}
      {showDevToolsMenu && (
        <button
          className={`app-sidebar__item app-sidebar__item--dev ${activeTab === 'dev' ? 'app-sidebar__item--active' : ''}`}
          onClick={() => onTabChange('dev')}
          title="Dev tools"
        >
          <i className="fas fa-flask app-sidebar__icon"></i>
          <span className="app-sidebar__label">Dev</span>
        </button>
      )}
    </nav>

    <div className="app-sidebar__bottom">
      <InfoButton />
      <button
        className="app-sidebar__collapse-btn"
        onClick={onCollapseToggle}
        title={sidebarCollapsed ? 'Розгорнути' : 'Згорнути'}
      >
        <i className={`fas fa-chevron-${sidebarCollapsed ? 'right' : 'left'}`}></i>
        <span className="app-sidebar__collapse-label">
          {sidebarCollapsed ? 'Розгорнути' : 'Згорнути'}
        </span>
      </button>
    </div>
  </aside>
);

export default AppSidebar;
