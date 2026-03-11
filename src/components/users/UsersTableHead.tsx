// src/components/users/UsersTableHead.tsx — sortable table header for users list
import React from 'react';
import type { SortKey, SortDir } from '../../utils/helpers';

interface UsersTableHeadProps {
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

interface SortBtnProps {
  k: SortKey;
  label: string;
  icon?: string;
  sortKey: SortKey | null;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}

const SortBtn: React.FC<SortBtnProps> = ({ k, label, icon, sortKey, sortDir, onSort }) => (
  <span
    className={`users-sort-btn ${sortKey === k ? 'users-sort-btn--active' : ''}`}
    onClick={() => onSort(k)}
    title={`Сортувати за ${label.toLowerCase()}`}
  >
    {icon && <i className={`fas ${icon} me-1`} style={{ fontSize: '0.6rem' }}></i>}
    {label}
    {sortKey === k && <span className="ms-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
  </span>
);

/** Reusable sortable <thead> for the active and inactive users tables. */
export const UsersTableHead: React.FC<UsersTableHeadProps> = ({ sortKey, sortDir, onSort }) => {
  return (
    <thead>
      <tr className="users-table__head">
        <th
          className="text-center"
          style={{ width: '44px', minWidth: '44px', maxWidth: '44px', userSelect: 'none' }}
        >
          №
        </th>
        <th
          className="text-start ps-3"
          style={{
            userSelect: 'none',
            width: '96px',
            minWidth: '96px',
            maxWidth: '96px',
            whiteSpace: 'nowrap',
          }}
        >
          <div className="d-flex align-items-center gap-1">
            <SortBtn k="rank" label="Звання" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        </th>
        <th className="text-start" style={{ userSelect: 'none' }}>
          <div className="d-flex align-items-center gap-1">
            <SortBtn k="name" label="ПІБ" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
          </div>
        </th>
        <th className="text-start" style={{ width: '40%', minWidth: '300px' }}>
          Статус
        </th>
        <th className="text-end pe-3" style={{ width: '14%' }}>
          Дії
        </th>
      </tr>
    </thead>
  );
};
