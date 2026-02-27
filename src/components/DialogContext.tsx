import React, { useCallback, useRef, useState } from 'react';
import { DialogContext } from './dialogTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

type AlertState = {
  kind: 'alert';
  message: string;
  resolve: () => void;
};

type ConfirmState = {
  kind: 'confirm';
  message: string;
  resolve: (ok: boolean) => void;
};

type DialogState = AlertState | ConfirmState | null;

// ─── Provider ─────────────────────────────────────────────────────────────────

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState>(null);
  // Keep queue so overlapping dialogs are handled sequentially
  const queue = useRef<DialogState[]>([]);

  const showNext = useCallback(() => {
    const next = queue.current.shift();
    setDialog(next ?? null);
  }, []);

  const enqueue = useCallback(
    (d: DialogState) => {
      if (!d) return;
      if (dialog === null && queue.current.length === 0) {
        setDialog(d);
      } else {
        queue.current.push(d);
      }
    },
    [dialog]
  );

  const showAlert = useCallback(
    (message: string): Promise<void> =>
      new Promise((resolve) => {
        enqueue({ kind: 'alert', message, resolve });
      }),
    [enqueue]
  );

  const showConfirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        enqueue({ kind: 'confirm', message, resolve });
      }),
    [enqueue]
  );

  const handleAlertOk = () => {
    if (dialog?.kind === 'alert') {
      dialog.resolve();
      showNext();
    }
  };

  const handleConfirmOk = () => {
    if (dialog?.kind === 'confirm') {
      dialog.resolve(true);
      showNext();
    }
  };

  const handleConfirmCancel = () => {
    if (dialog?.kind === 'confirm') {
      dialog.resolve(false);
      showNext();
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}

      {/* ── Alert Modal ─────────────────────────────────────── */}
      {dialog?.kind === 'alert' && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}
          tabIndex={-1}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: 'min(560px, calc(100vw - 2rem))' }}
          >
            <div className="modal-content shadow border-0">
              <div className="modal-body d-flex gap-3 align-items-start p-4">
                <i className="fas fa-info-circle text-primary mt-1 fs-5 flex-shrink-0"></i>
                <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {dialog.message}
                </div>
              </div>
              <div className="modal-footer border-0 pt-0">
                <button className="btn btn-primary" onClick={handleAlertOk} autoFocus>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ───────────────────────────────────── */}
      {dialog?.kind === 'confirm' && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}
          tabIndex={-1}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: 'min(560px, calc(100vw - 2rem))' }}
          >
            <div className="modal-content shadow border-0">
              <div className="modal-body d-flex gap-3 align-items-start p-4">
                <i className="fas fa-question-circle text-warning mt-1 fs-5 flex-shrink-0"></i>
                <div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {dialog.message}
                </div>
              </div>
              <div className="modal-footer border-0 pt-0 gap-2">
                <button className="btn btn-outline-secondary" onClick={handleConfirmCancel}>
                  Скасувати
                </button>
                <button className="btn btn-primary" onClick={handleConfirmOk} autoFocus>
                  Підтвердити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
