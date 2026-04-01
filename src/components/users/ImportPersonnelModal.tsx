import React, { useMemo, useRef, useState } from 'react';
import type { User } from '../../types';
import Modal from '../Modal';
import * as userService from '../../services/userService';
import {
  PRESETS,
  getSheetNames,
  getSheetPreviewRows,
  isDuplicateName,
  parsePersonnelFromExcel,
  parsedRowToUser,
  type ColumnConfig,
  type ImportPreset,
  type ParsedPersonRow,
} from '../../services/importPersonnelFromExcelService';

interface ImportPersonnelModalProps {
  show: boolean;
  existingUsers: User[];
  onClose: () => void;
  onImported: (count: number) => Promise<void>;
}

const emptyConfig = (): ColumnConfig => ({ ...PRESETS.simple.config });

const colIndexToLetter = (index: number): string => {
  let current = index + 1;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
};

const normalizeColumnInput = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z]/g, '');

const ImportPersonnelModal: React.FC<ImportPersonnelModalProps> = ({
  show,
  existingUsers,
  onClose,
  onImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<'upload' | 'configure' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [preset, setPreset] = useState<ImportPreset>('simple');
  const [config, setConfig] = useState<ColumnConfig>(emptyConfig);
  const [parsedRows, setParsedRows] = useState<ParsedPersonRow[]>([]);
  const [sheetPreviewRows, setSheetPreviewRows] = useState<string[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [showSkippedRows, setShowSkippedRows] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setSheetNames([]);
    setPreset('simple');
    setConfig(emptyConfig());
    setParsedRows([]);
    setSheetPreviewRows([]);
    setIsLoading(false);
    setImportedCount(0);
    setSkipDuplicates(true);
    setShowSkippedRows(false);
    setErrorMessage(null);
    setIsDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRequestClose = async () => {
    if (isLoading) return;

    if (step === 'done' && importedCount > 0) {
      let keepLoadingState = true;
      setIsLoading(true);
      setErrorMessage(null);
      try {
        await onImported(importedCount);
        resetState();
        onClose();
        keepLoadingState = false;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Не вдалося завершити імпорт');
      } finally {
        if (keepLoadingState) {
          setIsLoading(false);
        }
      }
      return;
    }

    resetState();
    onClose();
  };

  const loadSheetPreview = async (selectedFile: File, sheetIndex: number) => {
    const previewRows = await getSheetPreviewRows(selectedFile, sheetIndex);
    setSheetPreviewRows(previewRows);
  };

  const handleFileSelected = async (selectedFile: File) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextSheetNames = await getSheetNames(selectedFile);
      if (nextSheetNames.length === 0) {
        setErrorMessage('Файл порожній або пошкоджений');
        return;
      }

      const nextConfig = { ...PRESETS.simple.config, sheetIndex: 0 };
      setFile(selectedFile);
      setSheetNames(nextSheetNames);
      setPreset('simple');
      setConfig(nextConfig);
      setParsedRows([]);
      setImportedCount(0);
      setShowSkippedRows(false);
      await loadSheetPreview(selectedFile, nextConfig.sheetIndex);
      setStep('configure');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не вдалося відкрити файл');
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleChooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    void handleFileSelected(selectedFile);
  };

  const handlePresetChange = async (nextPreset: ImportPreset) => {
    setPreset(nextPreset);
    setErrorMessage(null);

    const nextConfig = { ...PRESETS[nextPreset].config };
    if (nextPreset === 'oos' && sheetNames.length >= 2) {
      nextConfig.sheetIndex = 1;
    } else if (nextPreset === 'oos' && sheetNames.length < 2) {
      nextConfig.sheetIndex = 0;
    }

    setConfig(nextConfig);

    if (!file) return;

    setIsLoading(true);
    try {
      await loadSheetPreview(file, nextConfig.sheetIndex);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не вдалося зчитати аркуш');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetChange = async (sheetIndex: number) => {
    setConfig((current) => ({ ...current, sheetIndex }));
    setErrorMessage(null);

    if (!file) return;

    setIsLoading(true);
    try {
      await loadSheetPreview(file, sheetIndex);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не вдалося зчитати аркуш');
    } finally {
      setIsLoading(false);
    }
  };

  const duplicateCount = useMemo(
    () => parsedRows.filter((row) => !row.skipped && isDuplicateName(row.name, existingUsers)).length,
    [existingUsers, parsedRows]
  );

  const validCount = useMemo(
    () => parsedRows.filter((row) => !row.skipped).length,
    [parsedRows]
  );

  const skippedCount = useMemo(
    () => parsedRows.filter((row) => row.skipped).length,
    [parsedRows]
  );

  const warningCount = useMemo(
    () => parsedRows.filter((row) => !row.skipped && !!row.warning).length,
    [parsedRows]
  );

  const rowsToImport = useMemo(
    () =>
      parsedRows.filter(
        (row) => !row.skipped && (!isDuplicateName(row.name, existingUsers) || !skipDuplicates)
      ),
    [existingUsers, parsedRows, skipDuplicates]
  );

  const effectiveCount = rowsToImport.length;

  const visiblePreviewRows = useMemo(
    () => (showSkippedRows ? parsedRows : parsedRows.filter((row) => !row.skipped)),
    [parsedRows, showSkippedRows]
  );

  const handleReadData = async () => {
    if (!file) return;
    if (!config.nameCol.trim()) {
      setErrorMessage('Вкажіть колонку ПІБ');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const rows = await parsePersonnelFromExcel(file, config);
      setParsedRows(rows);
      setShowSkippedRows(false);
      setStep('preview');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не вдалося зчитати дані');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (rowsToImport.length === 0) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const usersToCreate = rowsToImport.map(parsedRowToUser);
      await userService.bulkCreateUsers(usersToCreate);
      setImportedCount(usersToCreate.length);
      setStep('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Не вдалося імпортувати дані');
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle =
    step === 'upload'
      ? 'Імпорт особового складу з Excel'
      : step === 'configure'
        ? 'Налаштування імпорту'
        : step === 'preview'
          ? 'Перевірка даних'
          : 'Імпорт завершено';

  return (
    <Modal show={show} onClose={() => void handleRequestClose()} title={modalTitle} size="modal-xl">
      {errorMessage && <div className="alert alert-danger py-2 small">{errorMessage}</div>}

      {step === 'upload' && (
        <div>
          <div
            className={`border rounded-3 text-center p-4 mb-3 ${isDragActive ? 'border-success bg-success bg-opacity-10' : 'border-secondary-subtle'}`}
            style={{ borderStyle: 'dashed', cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragActive(false);
              const selectedFile = event.dataTransfer.files?.[0];
              if (selectedFile) {
                void handleFileSelected(selectedFile);
              }
            }}
          >
            <i className="fas fa-file-excel fa-3x text-success mb-3"></i>
            <div className="fw-semibold mb-2">Перетягніть файл Excel сюди</div>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={(event) => {
                event.stopPropagation();
                fileInputRef.current?.click();
              }}
              disabled={isLoading}
            >
              або оберіть файл
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={handleChooseFile}
            />
          </div>

          <div className="text-muted small">
            <div>Підтримується: .xlsx, .xls</div>
            <div>Список людей може починатися не з першого рядка — налаштуйте на наступному кроці</div>
          </div>
        </div>
      )}

      {step === 'configure' && (
        <div>
          <div className="text-muted small mb-3">
            Файл: <span className="fw-semibold">{file?.name || '—'}</span>
          </div>

          <div className="card border-0 bg-light-subtle mb-3">
            <div className="card-body py-3">
              <div className="fw-semibold mb-2">Аркуш</div>
              <select
                className="form-select form-select-sm"
                value={config.sheetIndex}
                onChange={(event) => void handleSheetChange(Number(event.target.value))}
                disabled={isLoading}
              >
                {sheetNames.map((sheetName, index) => (
                  <option key={`${sheetName}-${index}`} value={index}>
                    {sheetName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card border-0 bg-light-subtle mb-3">
            <div className="card-body py-3">
              <div className="fw-semibold mb-2">Формат даних</div>
              <div className="btn-group w-100 flex-wrap" role="group" aria-label="Формат імпорту">
                {(['simple', 'oos', 'custom'] as ImportPreset[]).map((presetKey) => (
                  <React.Fragment key={presetKey}>
                    <input
                      type="radio"
                      className="btn-check"
                      name="importPreset"
                      id={`importPreset-${presetKey}`}
                      checked={preset === presetKey}
                      onChange={() => void handlePresetChange(presetKey)}
                    />
                    <label
                      className="btn btn-outline-primary text-start"
                      htmlFor={`importPreset-${presetKey}`}
                    >
                      <div className="fw-semibold">
                        {presetKey === 'simple'
                          ? 'Простий список'
                          : presetKey === 'oos'
                            ? 'ООС / штатний документ'
                            : 'Власні налаштування'}
                      </div>
                      <div className="small opacity-75">{PRESETS[presetKey].label}</div>
                    </label>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="card border-0 bg-light-subtle mb-3">
            <div className="card-body py-3">
              <div className="fw-semibold mb-3">Колонки та рядки</div>
              <div style={preset !== 'custom' ? { opacity: 0.6 } : undefined}>
                <div className="d-flex align-items-center gap-2 flex-wrap mb-3">
                  <label className="form-label mb-0">Починати з рядка:</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ width: '80px' }}
                    min={1}
                    value={config.startRow}
                    disabled={preset !== 'custom'}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        startRow: Math.max(1, Number(event.target.value) || 1),
                      }))
                    }
                  />
                </div>

                <div className="d-flex gap-3 flex-wrap mb-2">
                  <div>
                    <label className="form-label small fw-medium">Колонка Звання:</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ width: '60px' }}
                      placeholder="A"
                      value={config.rankCol}
                      disabled={preset !== 'custom'}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          rankCol: normalizeColumnInput(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-medium">Колонка ПІБ:*</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ width: '60px' }}
                      placeholder="B"
                      value={config.nameCol}
                      disabled={preset !== 'custom'}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          nameCol: normalizeColumnInput(event.target.value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="form-label small fw-medium">Колонка Дата народження:</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ width: '60px' }}
                      placeholder="або порожньо"
                      value={config.birthdayCol}
                      disabled={preset !== 'custom'}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          birthdayCol: normalizeColumnInput(event.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="small text-muted">
                  Введіть букву колонки (A, B, C... Z, AA, AB...)
                </div>
                {preset !== 'custom' && (
                  <div className="small text-muted mt-1">
                    Щоб змінити колонки або початковий рядок, оберіть «Власні налаштування».
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card border-0 bg-light-subtle mb-3">
            <div className="card-body py-3">
              <div className="fw-semibold mb-2">Попередній перегляд аркуша</div>
              <div
                className="table-responsive border rounded"
                style={{ maxHeight: '120px', overflow: 'auto', fontSize: '0.72rem' }}
              >
                <table className="table table-sm table-striped align-middle mb-0">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th style={{ width: '48px' }}>#</th>
                      {Array.from({ length: 8 }, (_, index) => (
                        <th key={colIndexToLetter(index)}>{colIndexToLetter(index)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-muted py-3">
                          Дані для попереднього перегляду відсутні
                        </td>
                      </tr>
                    ) : (
                      sheetPreviewRows.map((row, rowIndex) => (
                        <tr key={`preview-row-${rowIndex}`}>
                          <td className="text-muted">{rowIndex + 1}</td>
                          {row.map((cell, cellIndex) => (
                            <td key={`preview-cell-${rowIndex}-${cellIndex}`}>{cell || '—'}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-between gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setErrorMessage(null);
                setStep('upload');
              }}
              disabled={isLoading}
            >
              <i className="fas fa-arrow-left me-1"></i>
              Назад
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleReadData()}
              disabled={isLoading || !file}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Зчитую...
                </>
              ) : (
                <>
                  Зчитати дані <i className="fas fa-arrow-right ms-1"></i>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div className="d-flex gap-2 flex-wrap mb-2">
            <span className="badge bg-success">Знайдено: {validCount} осіб</span>
            {skippedCount > 0 && <span className="badge bg-secondary">Пропущено: {skippedCount} рядків</span>}
            {warningCount > 0 && <span className="badge bg-warning text-dark">Попередження: {warningCount}</span>}
            {duplicateCount > 0 && <span className="badge bg-info text-dark">Можливі дублікати: {duplicateCount}</span>}
          </div>

          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="skipDuplicateRows"
              checked={skipDuplicates}
              onChange={(event) => setSkipDuplicates(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="skipDuplicateRows">
              Пропустити можливі дублікати
            </label>
          </div>

          {skippedCount > 0 && (
            <div className="form-check mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="showSkippedRows"
                checked={showSkippedRows}
                onChange={(event) => setShowSkippedRows(event.target.checked)}
              />
              <label className="form-check-label small" htmlFor="showSkippedRows">
                Показати пропущені
              </label>
            </div>
          )}

          <div className="table-responsive border rounded" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light sticky-top">
                <tr>
                  <th style={{ width: '80px' }}>Рядок</th>
                  <th style={{ width: '140px' }}>Звання</th>
                  <th>ПІБ</th>
                  <th style={{ width: '140px' }}>Дата нар.</th>
                  <th style={{ width: '220px' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {visiblePreviewRows.map((row) => {
                  const isDuplicate = !row.skipped && isDuplicateName(row.name, existingUsers);

                  return (
                    <tr
                      key={`parsed-row-${row.rowNumber}-${row.name}`}
                      className={row.skipped ? 'text-muted' : undefined}
                    >
                      <td>{row.rowNumber}</td>
                      <td>{row.rank || '—'}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.birthday || '—'}</td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          {row.skipped ? (
                            <>
                              <span className="badge bg-secondary">Пропущено</span>
                              {row.skipReason && (
                                <span className="small text-muted">{row.skipReason}</span>
                              )}
                            </>
                          ) : (
                            <>
                              {isDuplicate && (
                                <span className="badge bg-warning text-dark">Дублікат</span>
                              )}
                              {row.warning && (
                                <span className="badge bg-warning text-dark">
                                  ⚠ {row.warning}
                                </span>
                              )}
                              {!isDuplicate && !row.warning && (
                                <span className="badge bg-success">✓</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between gap-2 flex-wrap mt-3">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setErrorMessage(null);
                setStep('configure');
              }}
              disabled={isLoading}
            >
              <i className="fas fa-arrow-left me-1"></i>
              Змінити налаштування
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => void handleImport()}
              disabled={isLoading || effectiveCount === 0}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Імпортую...
                </>
              ) : (
                <>Імпортувати ({effectiveCount})</>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <i className="fas fa-check-circle fa-4x text-success mb-3"></i>
          <div className="fw-semibold fs-5 mb-2">
            Імпортовано {importedCount} осіб до особового складу
          </div>
          <div className="text-muted small mb-4">
            Для включення до черги чергових — увімкніть перемикач «В черзі» навпроти кожної особи
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleRequestClose()}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Завершую...
              </>
            ) : (
              'Закрити'
            )}
          </button>
        </div>
      )}
    </Modal>
  );
};

export default ImportPersonnelModal;
