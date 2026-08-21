// src/components/schedule/PreGenerationConfirmModal.tsx
// Compact confirmation shown before auto-generation: summarizes status
// periods, exclude-from-auto periods, blocked weekdays and low weekly pool
// warnings for the target window, so the operator can fix statuses first.
import React from 'react';
import Modal from '../Modal';
import type { PreGenerationSummary } from '../../utils/preGenerationSummary';
import { STATUSES, DAY_SHORT_NAMES } from '../../utils/constants';
import { formatDate, formatDateShort } from '../../utils/dateUtils';

interface PreGenerationConfirmModalProps {
  summary: PreGenerationSummary | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const formatPeriod = (from?: string, to?: string): string => {
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  if (from) return `з ${formatDate(from)}`;
  if (to) return `до ${formatDate(to)}`;
  return 'без дат';
};

/** ISO dow (1=Mon…7=Sun) → short Ukrainian weekday name. */
const isoDowShort = (dow: number): string => DAY_SHORT_NAMES[dow % 7];

const PreGenerationConfirmModal: React.FC<PreGenerationConfirmModalProps> = ({
  summary,
  onConfirm,
  onCancel,
}) => {
  if (!summary) return null;

  return (
    <Modal
      show
      onClose={onCancel}
      title="Перевірка перед генерацією"
      size="modal-md"
      footer={
        <>
          <button className="btn btn-outline-secondary" onClick={onCancel}>
            Скасувати
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            <i className="fas fa-magic me-1"></i>Продовжити генерацію
          </button>
        </>
      }
    >
      <div className="small text-muted mb-3">
        Період: <strong>{formatDate(summary.windowFrom)}</strong> —{' '}
        <strong>{formatDate(summary.windowTo)}</strong>
      </div>

      {!summary.hasWarnings && (
        <div className="alert alert-success py-2 small mb-0">
          <i className="fas fa-check-circle me-1"></i>
          Перешкод не виявлено: немає статусів, виключень чи заблокованих днів у цьому періоді.
        </div>
      )}

      {summary.statusOverlaps.length > 0 && (
        <div className="mb-3">
          <h6 className="fw-bold small mb-2">
            <i className="fas fa-user-clock me-2 text-warning"></i>Статуси в цьому періоді
          </h6>
          <ul className="small mb-0 ps-4">
            {summary.statusOverlaps.map((s, i) => (
              <li key={`${s.userName}-${i}`}>
                <strong>{s.userName}</strong> — {STATUSES[s.status]}{' '}
                <span className="text-muted">({formatPeriod(s.from, s.to)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.excludedUsers.length > 0 && (
        <div className="mb-3">
          <h6 className="fw-bold small mb-2">
            <i className="fas fa-user-slash me-2 text-secondary"></i>Виключені з авторозподілу
          </h6>
          <ul className="small mb-0 ps-4">
            {summary.excludedUsers.map((e) => (
              <li key={e.userName}>
                <strong>{e.userName}</strong>{' '}
                <span className="text-muted">
                  {e.coversWholeWindow
                    ? '(весь період)'
                    : `(${e.dates.map((d) => formatDateShort(d)).join(', ')})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.blockedUsers.length > 0 && (
        <div className="mb-3">
          <h6 className="fw-bold small mb-2">
            <i className="fas fa-ban me-2 text-danger"></i>Заблоковані дні тижня
          </h6>
          <ul className="small mb-0 ps-4">
            {summary.blockedUsers.map((b) => (
              <li key={b.userName}>
                <strong>{b.userName}</strong> — {b.dows.map(isoDowShort).join(', ')}{' '}
                <span className="text-muted">
                  ({b.dates.length} {b.dates.length === 1 ? 'день' : 'дн.'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.lowPoolWeeks.length > 0 && (
        <div className="alert alert-warning py-2 small mb-0">
          <i className="fas fa-exclamation-triangle me-1"></i>
          <strong>Мало доступних людей:</strong>
          <ul className="mb-0 mt-1 ps-4">
            {summary.lowPoolWeeks.map((w) => (
              <li key={w.weekFrom}>
                Тиждень {formatDateShort(w.weekFrom)} — {formatDateShort(w.weekTo)}: доступно{' '}
                <strong>{w.eligibleCount}</strong> осіб, що покриває{' '}
                <strong>{w.weeklyCapacity}</strong> із потрібних <strong>{w.requiredCount}</strong>{' '}
                нарядів
                {w.staffCount > 0 && (
                  <> (з них штатних чергових: {w.staffCount}, вони беруть по 2–4 наряди)</>
                )}{' '}
                — хтось отримає понад свою тижневу норму.
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
};

export default PreGenerationConfirmModal;
