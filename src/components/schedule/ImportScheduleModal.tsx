import React, { useState, useCallback } from 'react';
import type { User } from '../../types';
import Modal from '../Modal';
import {
  parseScheduleText,
  importParsedSchedule,
  type ParsedRow,
  type ImportResult,
} from '../../services/importScheduleService';

interface ImportScheduleModalProps {
  show: boolean;
  users: User[];
  onClose: () => void;
  onImported: (result: ImportResult) => Promise<void>;
}

const ImportScheduleModal: React.FC<ImportScheduleModalProps> = ({
  show,
  users,
  onClose,
  onImported,
}) => {
  const [text, setText] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const handleParse = useCallback(() => {
    if (!text.trim()) return;
    const rows = parseScheduleText(text, users);
    setParsed(rows);
    setResultMsg(null);
  }, [text, users]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setText(content);
        const rows = parseScheduleText(content, users);
        setParsed(rows);
        setResultMsg(null);
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [users]
  );

  const handleImport = useCallback(async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const result = await importParsedSchedule(parsed, overwrite);
      setResultMsg(
        `Імпортовано: ${result.imported} днів. ` +
          `Пропущено (вже є): ${result.skippedExisting}. ` +
          `Помилки: ${result.skippedErrors}.`
      );
      await onImported(result);
    } catch (err) {
      setResultMsg(`Помилка: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [parsed, overwrite, onImported]);

  const handleClose = () => {
    setText('');
    setParsed(null);
    setResultMsg(null);
    setOverwrite(false);
    onClose();
  };

  const validCount = parsed?.filter((r) => !r.error).length ?? 0;
  const errorCount = parsed?.filter((r) => r.error).length ?? 0;

  return (
    <Modal show={show} onClose={handleClose} title="Імпорт старого графіка" size="modal-lg">
      <div className="mb-3">
        <p className="text-muted small mb-2">
          Вставте дані у форматі <strong>дата;прізвище</strong> (кожен запис з нового рядка).
          <br />
          Підтримувані формати дати: <code>2025-03-15</code>, <code>15.03.2025</code>,{' '}
          <code>15/03/2025</code>.
          <br />
          Роздільник: табуляція, крапка з комою або кома.
        </p>

        <div className="d-flex gap-2 mb-2">
          <label className="btn btn-outline-secondary btn-sm">
            <i className="fas fa-file-upload me-1"></i>
            Завантажити CSV/TXT
            <input type="file" hidden accept=".csv,.txt,.tsv" onChange={handleFileUpload} />
          </label>
        </div>

        <textarea
          className="form-control font-monospace"
          rows={10}
          placeholder={`# Приклад:\n15.01.2025;Петренко\n16.01.2025;Іваненко\n17.01.2025;Сидоренко\n2025-01-18;Коваленко`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setParsed(null);
            setResultMsg(null);
          }}
        />
      </div>

      {!parsed && (
        <button className="btn btn-primary btn-sm" onClick={handleParse} disabled={!text.trim()}>
          <i className="fas fa-search me-1"></i>
          Перевірити дані
        </button>
      )}

      {parsed && (
        <>
          {/* Summary */}
          <div className="d-flex gap-3 mb-2 align-items-center">
            <span className="badge bg-success">
              <i className="fas fa-check me-1"></i>
              Знайдено: {validCount}
            </span>
            {errorCount > 0 && (
              <span className="badge bg-danger">
                <i className="fas fa-times me-1"></i>
                Помилки: {errorCount}
              </span>
            )}
          </div>

          {/* Preview table */}
          <div className="table-responsive" style={{ maxHeight: '280px', overflowY: 'auto' }}>
            <table className="table table-sm table-hover small mb-2">
              <thead className="table-light sticky-top">
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  <th style={{ width: '110px' }}>Дата</th>
                  <th>Введене ім&apos;я</th>
                  <th>Зіставлено</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((row, idx) => (
                  <tr key={idx} className={row.error ? 'table-warning' : ''}>
                    <td className="text-muted">{row.line}</td>
                    <td>
                      <code>{row.date ?? '—'}</code>
                    </td>
                    <td>{row.name || '—'}</td>
                    <td>
                      {row.matchedUser ? (
                        <span className="text-success fw-semibold">{row.matchedUser.name}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {row.error ? (
                        <span className="text-danger small">
                          <i className="fas fa-exclamation-triangle me-1"></i>
                          {row.error}
                        </span>
                      ) : (
                        <span className="text-success">
                          <i className="fas fa-check"></i>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Options */}
          <div className="form-check mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="importOverwrite"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            <label className="form-check-label small" htmlFor="importOverwrite">
              Перезаписати існуючи дні (інакше будуть пропущені)
            </label>
          </div>

          {/* Result message */}
          {resultMsg && (
            <div
              className={`alert ${resultMsg.startsWith('Помилка') ? 'alert-danger' : 'alert-success'} py-2 small`}
            >
              {resultMsg}
            </div>
          )}

          {/* Actions */}
          <div className="d-flex gap-2">
            <button
              className="btn btn-success btn-sm"
              onClick={handleImport}
              disabled={importing || validCount === 0}
            >
              {importing ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1"></span>
                  Імпортую...
                </>
              ) : (
                <>
                  <i className="fas fa-file-import me-1"></i>
                  Імпортувати ({validCount})
                </>
              )}
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setParsed(null);
                setResultMsg(null);
              }}
            >
              Назад до редагування
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

export default ImportScheduleModal;
