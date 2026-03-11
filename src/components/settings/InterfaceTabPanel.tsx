// src/components/settings/InterfaceTabPanel.tsx
import React from 'react';

/** Available UI scale values in percent. */
const UI_SCALE_OPTIONS = [
  70, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160,
] as const;

/** Labels shown in the dropdown for select scale values. */
const UI_SCALE_LABELS: Partial<Record<number, string>> = {
  70: '70% (дуже малий)',
  80: '80% (малий)',
  100: '100% (стандарт)',
  130: '130% (великий)',
  160: '160% (дуже великий)',
};

interface InterfaceTabPanelProps {
  scale: number;
  onScaleChange: (n: number) => void;
}

/**
 * Interface tab — lets the user pick a global UI zoom level applied
 * to the entire app shell (browser, Tauri, Electron).
 */
const InterfaceTabPanel: React.FC<InterfaceTabPanelProps> = ({ scale, onScaleChange }) => (
  <>
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white py-3">
        <h5 className="mb-0 fw-bold">
          <i className="fas fa-search-plus me-2"></i>Масштаб інтерфейсу
        </h5>
      </div>
      <div className="card-body">
        <div className="row g-3 align-items-end">
          <div className="col-md-4">
            <label className="form-label fw-bold">Розмір UI</label>
            <select
              className="form-select"
              value={scale}
              onChange={(e) => onScaleChange(parseInt(e.target.value, 10))}
            >
              {UI_SCALE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {UI_SCALE_LABELS[v] ?? `${v}%`}
                </option>
              ))}
            </select>
            <div className="form-text">
              Застосовується до всього інтерфейсу (браузер, Tauri, Electron).
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
);

export default InterfaceTabPanel;
