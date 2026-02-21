import React, { useState, useEffect, useMemo } from 'react';
import * as auditService from '../services/auditService';
import type { AuditLogEntry } from '../types';
import { useDialog } from './useDialog';

const ACTION_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  ADD: { label: 'Додано', icon: 'fa-user-plus', color: 'success' },
  EDIT: { label: 'Редагування', icon: 'fa-user-edit', color: 'info' },
  DELETE: { label: 'Видалено', icon: 'fa-user-minus', color: 'danger' },
  ASSIGN: { label: 'Призначення', icon: 'fa-calendar-check', color: 'primary' },
  MANUAL: { label: 'Ручне', icon: 'fa-hand-pointer', color: 'primary' },
  REMOVE: { label: 'Зняття', icon: 'fa-calendar-minus', color: 'warning' },
  REPLACE: { label: 'Заміна', icon: 'fa-arrow-right-arrow-left', color: 'info' },
  SWAP: { label: 'Обмін', icon: 'fa-repeat', color: 'info' },
  TRANSFER: { label: 'Перенесення', icon: 'fa-arrows-alt', color: 'info' },
  AUTO_FILL: { label: 'Автозаповнення', icon: 'fa-fill-drip', color: 'info' },
  AUTO_FIX: { label: 'Автовиправлення', icon: 'fa-wrench', color: 'warning' },
  AUTO_SCHEDULE: { label: 'Генерація', icon: 'fa-magic', color: 'primary' },
  AUTO_GEN: { label: 'Генерація', icon: 'fa-magic', color: 'primary' },
  CASCADE: { label: 'Перерахунок', icon: 'fa-sync-alt', color: 'secondary' },
  CLEAR_WEEK: { label: 'Очищення тижня', icon: 'fa-eraser', color: 'danger' },
  BULK_DELETE: { label: 'Масове видалення', icon: 'fa-trash-alt', color: 'danger' },
  BULK_ADD: { label: 'Масове додавання', icon: 'fa-users', color: 'success' },
  SETTINGS: { label: 'Налаштування', icon: 'fa-cog', color: 'secondary' },
  EXPORT: { label: 'Експорт', icon: 'fa-file-export', color: 'secondary' },
  IMPORT: { label: 'Імпорт', icon: 'fa-file-import', color: 'secondary' },
};

const getActionInfo = (action: string) =>
  ACTION_LABELS[action] || { label: action, icon: 'fa-info-circle', color: 'secondary' };

type FilterType = 'all' | 'schedule' | 'users' | 'settings';

const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [limit, setLimit] = useState(100);

  const { showConfirm } = useDialog();

  const loadLogs = async () => {
    try {
      setLoading(true);
      const allLogs = await auditService.getRecentLogs(500);
      setLogs(allLogs);
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const scheduleActions = useMemo(
    () =>
      new Set([
        'ASSIGN',
        'MANUAL',
        'REMOVE',
        'REPLACE',
        'SWAP',
        'TRANSFER',
        'AUTO_FILL',
        'AUTO_FIX',
        'AUTO_SCHEDULE',
        'AUTO_GEN',
        'CASCADE',
        'CLEAR_WEEK',
        'BULK_DELETE',
      ]),
    []
  );
  const userActions = useMemo(() => new Set(['ADD', 'EDIT', 'DELETE', 'BULK_ADD']), []);

  const filteredLogs = useMemo(() => {
    let filtered = logs;
    if (filter === 'schedule') {
      filtered = logs.filter((l) => scheduleActions.has(l.action));
    } else if (filter === 'users') {
      filtered = logs.filter((l) => userActions.has(l.action));
    } else if (filter === 'settings') {
      filtered = logs.filter((l) => l.action === 'SETTINGS');
    }
    return filtered.slice(0, limit);
  }, [logs, filter, limit, scheduleActions, userActions]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      counts[l.action] = (counts[l.action] || 0) + 1;
    });
    return counts;
  }, [logs]);

  const handleClearOldLogs = async () => {
    if (!(await showConfirm('Видалити логи старше 90 днів?'))) return;
    await auditService.clearOldLogs(90);
    await loadLogs();
  };

  const formatTimestamp = (ts: Date) => {
    const d = new Date(ts);
    const date = d.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('uk-UA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    return { date, time };
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  return (
    <div className="row justify-content-center">
      <div className="col-lg-10">
        {/* Stats cards */}
        <div className="row g-2 mb-3">
          <div className="col-auto">
            <div className="card border-0 shadow-sm">
              <div className="card-body py-2 px-3">
                <small className="text-muted">Всього записів</small>
                <div className="fw-bold fs-5">{logs.length}</div>
              </div>
            </div>
          </div>
          {Object.entries(stats)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([action, count]) => {
              const info = getActionInfo(action);
              return (
                <div key={action} className="col-auto">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body py-2 px-3">
                      <small className={`text-${info.color}`}>
                        <i className={`fas ${info.icon} me-1`} />
                        {info.label}
                      </small>
                      <div className="fw-bold fs-5">{count}</div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Filters */}
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div className="btn-group btn-group-sm">
              <button
                className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setFilter('all')}
              >
                Всі
              </button>
              <button
                className={`btn ${filter === 'schedule' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setFilter('schedule')}
              >
                <i className="fas fa-calendar-alt me-1" />
                Графік
              </button>
              <button
                className={`btn ${filter === 'users' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setFilter('users')}
              >
                <i className="fas fa-users me-1" />
                Особовий склад
              </button>
              <button
                className={`btn ${filter === 'settings' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setFilter('settings')}
              >
                <i className="fas fa-cog me-1" />
                Налаштування
              </button>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={loadLogs}>
                <i className="fas fa-sync-alt me-1" />
                Оновити
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={handleClearOldLogs}>
                <i className="fas fa-broom me-1" />
                Очистити старі
              </button>
            </div>
          </div>
        </div>

        {/* Log entries */}
        <div className="card border-0 shadow-sm">
          <div className="card-body p-0">
            {filteredLogs.length === 0 ? (
              <div className="text-center text-muted py-5">
                <i className="fas fa-clipboard-list fa-3x mb-3 d-block opacity-25" />
                Журнал порожній
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-sm mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: '140px' }}>Час</th>
                      <th style={{ width: '160px' }}>Дія</th>
                      <th>Деталі</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log, idx) => {
                      const info = getActionInfo(log.action);
                      const { date, time } = formatTimestamp(log.timestamp);
                      return (
                        <tr key={log.id || idx}>
                          <td className="text-nowrap">
                            <small className="text-muted d-block">{date}</small>
                            <small className="fw-semibold">{time}</small>
                          </td>
                          <td>
                            <span
                              className={`badge bg-${info.color} bg-opacity-10 text-${info.color}`}
                            >
                              <i className={`fas ${info.icon} me-1`} />
                              {info.label}
                            </span>
                          </td>
                          <td>
                            <span className="text-body-secondary">{log.details}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Load more */}
          {filteredLogs.length >= limit && (
            <div className="card-footer text-center bg-transparent border-0">
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={() => setLimit((l) => l + 100)}
              >
                Показати більше
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditLogView;
