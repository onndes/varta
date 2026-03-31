// src/components/InfoLegendTables.tsx — sub-tables used by the help modal

import React from 'react';

/** Shared base style for legend cell badge samples. */
const LEGEND_CELL_BADGE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '170px',
  height: '42px',
  textAlign: 'center',
  padding: '0 10px',
  borderRadius: '10px',
  fontWeight: 700,
  lineHeight: 1.1,
  boxSizing: 'border-box',
};

/** Section: legend rows for schedule cell types. */
export const CellLegendTable: React.FC = () => (
  <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
    <tbody>
      <tr>
        <td style={{ width: '200px' }}>
          <span
            style={{
              ...LEGEND_CELL_BADGE,
              backgroundColor: 'var(--app-cell-assigned-bg, #e8f5e9)',
              color: 'var(--app-cell-assigned-color, #1b5e20)',
              border: '2px solid var(--app-cell-assigned-border, #a5d6a7)',
            }}
          >
            НАРЯД
          </span>
        </td>
        <td>Призначення на день (тип призначення визначається значком).</td>
      </tr>
      <tr>
        <td>
          <span
            style={{
              ...LEGEND_CELL_BADGE,
              background:
                'repeating-linear-gradient(-45deg, var(--app-cell-history-bg1, #e0e7ff), var(--app-cell-history-bg1, #e0e7ff) 4px, var(--app-cell-history-bg2, #eef1ff) 4px, var(--app-cell-history-bg2, #eef1ff) 8px)',
              color: 'var(--app-cell-history-color, #3730a3)',
              border: '2px dashed var(--app-cell-history-border, #818cf8)',
            }}
          >
            ІСТОРІЯ
          </span>
        </td>
        <td>Історичний або імпортований запис (штриховка).</td>
      </tr>
      <tr>
        <td>
          <span
            style={{
              ...LEGEND_CELL_BADGE,
              backgroundColor: 'var(--app-cell-unavailable-bg, #f5f5f5)',
              color: 'var(--app-cell-unavailable-color, #888)',
              border: '1px solid var(--app-table-border, #e0e0e0)',
            }}
          >
            ЗАБЛОКОВАНО
          </span>
        </td>
        <td>Особа недоступна: статус, відсипний або блок днів.</td>
      </tr>
      <tr>
        <td>
          <span
            style={{
              ...LEGEND_CELL_BADGE,
              backgroundColor: 'var(--app-cell-past-locked-bg, #f0f0f0)',
              color: 'var(--app-cell-past-locked-color, #999)',
              border: '1px solid var(--app-table-border, #e0e0e0)',
            }}
          >
            МИНУЛЕ
          </span>
        </td>
        <td>Клітинка минулої дати (без редагування, якщо не увімкнено режим історії).</td>
      </tr>
      <tr>
        <td>
          <span
            style={{
              ...LEGEND_CELL_BADGE,
              backgroundColor: 'var(--app-cell-conflict-bg, #f8d7da)',
              color: 'var(--app-cell-conflict-color, #842029)',
              border: '2px solid var(--app-cell-conflict-border, #f5c2c7)',
            }}
          >
            КОНФЛІКТ
          </span>
        </td>
        <td>Конфліктне призначення: система позначає проблему для виправлення.</td>
      </tr>
    </tbody>
  </table>
);

/** Section: icon legend table for assignment types. */
export const IconLegendTable: React.FC = () => (
  <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
    <tbody>
      <tr>
        <td style={{ width: '210px' }}>
          НАРЯД <i className="bi bi-hand-index-thumb schedule-cell-icon ms-1"></i>
        </td>
        <td>Ручне призначення.</td>
      </tr>
      <tr>
        <td>
          НАРЯД <i className="bi bi-gear-fill schedule-cell-icon ms-1"></i>
        </td>
        <td>Автоматичне призначення.</td>
      </tr>
      <tr>
        <td>
          НАРЯД <i className="bi bi-arrow-repeat schedule-cell-icon ms-1"></i>
        </td>
        <td>Заміна (перепризначення).</td>
      </tr>
      <tr>
        <td>
          НАРЯД <i className="bi bi-arrow-left-right schedule-cell-icon ms-1"></i>
        </td>
        <td>Обмін чергуванням.</td>
      </tr>
      <tr>
        <td>
          НАРЯД <i className="bi bi-clock-history schedule-cell-icon ms-1"></i>
        </td>
        <td>Історичний запис (режим історії).</td>
      </tr>
      <tr>
        <td>
          НАРЯД <i className="bi bi-box-arrow-in-down schedule-cell-icon ms-1"></i>
        </td>
        <td>Імпортований запис.</td>
      </tr>
    </tbody>
  </table>
);

/** Section: tabs reference table. */
export const TabsTable: React.FC = () => (
  <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
    <tbody>
      <tr>
        <td className="fw-bold" style={{ width: '160px' }}>
          <i className="fas fa-calendar-days me-1 text-primary"></i>Графік
        </td>
        <td>
          Тижневий розклад: автогенерація, ручне редагування, drag & drop, каскадна перебудова,
          превʼю, undo/redo.
        </td>
      </tr>
      <tr>
        <td className="fw-bold">
          <i className="fas fa-users me-1 text-primary"></i>Особовий склад
        </td>
        <td>
          Управління: додавання, редагування, статуси, блокування днів тижня, несумісні пари, дні
          народження.
        </td>
      </tr>
      <tr>
        <td className="fw-bold">
          <i className="fas fa-chart-bar me-1 text-primary"></i>Статистика
        </td>
        <td>
          Кількість чергувань, розподіл по днях, борг, вага, карма, індекс справедливості, детальна
          картка кожної особи.
        </td>
      </tr>
      <tr>
        <td className="fw-bold">
          <i className="fas fa-cogs me-1 text-primary"></i>Налаштування
        </td>
        <td>Логіка алгоритму, друк та підписанти, масштаб інтерфейсу, експериментальні опції.</td>
      </tr>
      <tr>
        <td className="fw-bold">
          <i className="fas fa-book me-1 text-primary"></i>Журнал
        </td>
        <td>
          Повна історія всіх дій у системі (призначення, заміни, обміни, генерація, імпорт,
          налаштування) з фільтрацією.
        </td>
      </tr>
    </tbody>
  </table>
);
