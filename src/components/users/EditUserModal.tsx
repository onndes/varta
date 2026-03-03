import React, { useState, useMemo } from 'react';
import type { User, UserStatusPeriod } from '../../types';
import { RANKS, STATUSES } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';
import { getUserStatusPeriods, normalizeStatusPeriods } from '../../utils/userStatus';
import Modal from '../Modal';

interface EditUserModalProps {
  user: User;
  onChange: (user: User) => void;
  onClose: () => void;
  /** Computed fallback date (earliest schedule date or today) when dateAddedToAuto is not set */
  computedFairnessDate?: string;
  /** First duty date for this user (from schedule) */
  firstDutyDate?: string;
  /** All users (needed for incompatible pairs picker) */
  allUsers?: User[];
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  onChange,
  onClose,
  computedFairnessDate,
  firstDutyDate,
  allUsers = [],
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [incompatibleSearch, setIncompatibleSearch] = useState('');
  const blockedDays = user.blockedDays || [];
  const statusPeriods = useMemo(() => getUserStatusPeriods(user), [user]);
  const reverseIncompatibleIds = useMemo(() => {
    if (!user.id) return [];
    return allUsers
      .filter((u) => u.id !== undefined && u.id !== user.id && (u.incompatibleWith || []).includes(user.id!))
      .map((u) => u.id!);
  }, [allUsers, user.id]);

  const incompatibleIds = useMemo(
    () =>
      Array.from(
        new Set([...(user.incompatibleWith || []), ...reverseIncompatibleIds].filter((id) => id !== user.id))
      ).sort((a, b) => a - b),
    [user.incompatibleWith, reverseIncompatibleIds, user.id]
  );

  // Users available for the incompatible list (exclude self)
  const otherUsers = useMemo(
    () => allUsers.filter((u) => u.id !== user.id && u.isActive),
    [allUsers, user.id]
  );

  const filteredOtherUsers = useMemo(() => {
    if (!incompatibleSearch.trim()) return [];
    const q = incompatibleSearch.toLowerCase();
    return otherUsers
      .filter(
        (u) =>
          !incompatibleIds.includes(u.id!) &&
          (u.name.toLowerCase().includes(q) || formatRank(u.rank).toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [otherUsers, incompatibleSearch, incompatibleIds]);

  const STATUS_PERIOD_OPTIONS: Array<{ value: UserStatusPeriod['status']; label: string }> = [
    { value: 'VACATION', label: STATUSES.VACATION },
    { value: 'TRIP', label: STATUSES.TRIP },
    { value: 'SICK', label: STATUSES.SICK },
    { value: 'ABSENT', label: STATUSES.ABSENT },
  ];

  const applyStatusPeriods = (nextPeriods: UserStatusPeriod[]) => {
    const normalized = normalizeStatusPeriods(nextPeriods);
    const first = normalized[0];
    onChange({
      ...user,
      statusPeriods: normalized,
      // Legacy fields remain for backward compatibility in older views/backups.
      status: first ? first.status : 'ACTIVE',
      statusFrom: first?.from,
      statusTo: first?.to,
      statusComment: first?.status === 'ABSENT' ? first.comment : undefined,
      restBeforeStatus: first?.restBefore || false,
      restAfterStatus: first?.restAfter || false,
    });
  };

  const addStatusPeriod = () => {
    applyStatusPeriods([...statusPeriods, { status: 'TRIP' }]);
  };

  const updateStatusPeriod = (index: number, patch: Partial<UserStatusPeriod>) => {
    const next = statusPeriods.map((period, i) =>
      i === index
        ? {
            ...period,
            ...patch,
          }
        : period
    );
    applyStatusPeriods(next);
  };

  const removeStatusPeriod = (index: number) => {
    const next = statusPeriods.filter((_, i) => i !== index);
    applyStatusPeriods(next);
  };

  const toggleDay = (dayIdx: number) => {
    const newBlocked = blockedDays.includes(dayIdx)
      ? blockedDays.filter((d) => d !== dayIdx)
      : [...blockedDays, dayIdx].sort();

    // Якщо всі дні знято — скинути період і коментар
    if (newBlocked.length === 0) {
      onChange({
        ...user,
        blockedDays: [],
        blockedDaysFrom: undefined,
        blockedDaysTo: undefined,
        blockedDaysComment: undefined,
      });
    } else {
      onChange({ ...user, blockedDays: newBlocked });
    }
  };

  return (
    <Modal show={true} onClose={onClose} title={`Редагування: ${user.name}`} size="modal-lg">
      {/* Main fields */}
      <div className="row mb-3">
        <div className="col-12">
          <label className="small text-muted">Заплановані статуси (можна кілька)</label>
          <div className="d-flex flex-column gap-2">
            {statusPeriods.length === 0 && (
              <div className="small text-muted">Немає запланованих періодів. Зараз: В строю.</div>
            )}
            {statusPeriods.map((period, idx) => (
              <div key={idx} className="border rounded p-2 bg-light">
                <div className="row g-2 align-items-end">
                  <div className="col-md-4">
                    <label className="small text-muted">Статус</label>
                    <select
                      className="form-select form-select-sm"
                      value={period.status}
                      onChange={(e) =>
                        updateStatusPeriod(idx, { status: e.target.value as UserStatusPeriod['status'] })
                      }
                    >
                      {STATUS_PERIOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="small text-muted">Дата початку</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={period.from || ''}
                      onChange={(e) => updateStatusPeriod(idx, { from: e.target.value || undefined })}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="small text-muted">Дата завершення</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={period.to || ''}
                      onChange={(e) => updateStatusPeriod(idx, { to: e.target.value || undefined })}
                    />
                  </div>
                  <div className="col-md-2">
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm w-100"
                      onClick={() => removeStatusPeriod(idx)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div className="row mt-2">
                  <div className="col-md-6">
                    <div className="form-check form-switch">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`restBefore-${idx}`}
                        checked={period.restBefore || false}
                        onChange={(e) =>
                          updateStatusPeriod(idx, { restBefore: e.target.checked || undefined })
                        }
                        style={{ cursor: 'pointer' }}
                      />
                      <label
                        className="form-check-label"
                        htmlFor={`restBefore-${idx}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className="fas fa-bed me-2 text-warning"></i>
                        Відпочинок день до події
                      </label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-check form-switch">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`restAfter-${idx}`}
                        checked={period.restAfter || false}
                        onChange={(e) =>
                          updateStatusPeriod(idx, { restAfter: e.target.checked || undefined })
                        }
                        style={{ cursor: 'pointer' }}
                      />
                      <label
                        className="form-check-label"
                        htmlFor={`restAfter-${idx}`}
                        style={{ cursor: 'pointer' }}
                      >
                        <i className="fas fa-bed me-2 text-info"></i>
                        Відпочинок день після події
                      </label>
                    </div>
                  </div>
                </div>
                {period.status === 'ABSENT' && (
                  <div className="mt-2">
                    <input
                      className="form-control form-control-sm"
                      value={period.comment || ''}
                      onChange={(e) =>
                        updateStatusPeriod(idx, { comment: e.target.value || undefined })
                      }
                      placeholder="Коментар (наприклад: Відпросилась)"
                      maxLength={120}
                    />
                    <small className="text-info d-block mt-1">
                      <i className="fas fa-info-circle me-1"></i>
                      Статус "Відсутній" не впливає на карму / лічильник доступних днів.
                    </small>
                  </div>
                )}
              </div>
            ))}
            <div>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={addStatusPeriod}>
                <i className="fas fa-plus me-1"></i>Додати період
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Active checkbox */}
      <div className="card border-primary mb-3">
        <div className="card-body">
          <div className="form-check form-switch mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="isActive"
              checked={user.isActive}
              onChange={(e) => onChange({ ...user, isActive: e.target.checked })}
              style={{ cursor: 'pointer' }}
            />
            <label
              className="form-check-label fw-bold"
              htmlFor="isActive"
              style={{ cursor: 'pointer' }}
            >
              <i className="fas fa-user-check me-2 text-primary"></i>
              Присутній в підрозділі
            </label>
            <div className="small text-muted mt-1">
              Якщо вимкнено — особа відсутня (показується сірим, тільки в окремій вкладці).
            </div>
          </div>

          <div className="form-check form-switch">
            <input
              type="checkbox"
              className="form-check-input"
              id="excludeFromAuto"
              checked={user.excludeFromAuto || false}
              onChange={(e) => onChange({ ...user, excludeFromAuto: e.target.checked })}
              style={{ cursor: 'pointer' }}
              disabled={!user.isActive}
            />
            <label
              className="form-check-label"
              htmlFor="excludeFromAuto"
              style={{ cursor: 'pointer' }}
            >
              <i className="fas fa-user-times me-2 text-warning"></i>
              Виключити з автоматичного розподілення
            </label>
            <div className="small text-muted mt-1">
              Якщо відмічено — НЕ бере участь в <strong>автоматичному</strong> розподіленні. Ручне
              призначення можливе завжди.
            </div>
          </div>
        </div>
      </div>

      {/* Blocked days */}
      <div className="card mb-3">
        <div className="card-body">
          <h6 className="card-title">
            <i className="fas fa-ban me-2 text-danger"></i>
            Блокування днів тижня
          </h6>
          <div className="small text-muted mb-2">
            Виберіть дні, коли користувач НЕ може чергувати (виключено з автоматичного розподілення)
          </div>
          <div className="btn-group w-100" role="group">
            {WEEKDAYS.map((day, idx) => {
              const mondayIdx = idx + 1; // 1=Monday...7=Sunday
              const isBlocked = blockedDays.includes(mondayIdx);
              return (
                <button
                  key={idx}
                  type="button"
                  className={`btn btn-sm ${isBlocked ? 'btn-danger' : 'btn-outline-secondary'}`}
                  onClick={() => toggleDay(mondayIdx)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {blockedDays.length > 0 && (
            <>
              {/* Період блокування */}
              <div className="row mt-2 g-2">
                <div className="col-6">
                  <label className="small text-muted">Діє з</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={user.blockedDaysFrom || ''}
                    onChange={(e) =>
                      onChange({ ...user, blockedDaysFrom: e.target.value || undefined })
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="small text-muted">Діє до</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={user.blockedDaysTo || ''}
                    onChange={(e) =>
                      onChange({ ...user, blockedDaysTo: e.target.value || undefined })
                    }
                  />
                </div>
              </div>
              <div className="small text-muted mt-1">Якщо не вказано — блокування діє постійно</div>

              {/* Коментар */}
              <div className="mt-2">
                <input
                  className="form-control form-control-sm"
                  value={user.blockedDaysComment || ''}
                  onChange={(e) => onChange({ ...user, blockedDaysComment: e.target.value })}
                  placeholder="Причина блокування (необов'язково)"
                  maxLength={100}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Incompatible pairs (can't be on duty on consecutive days) */}
      <div className="card mb-3">
        <div className="card-body">
          <h6 className="card-title">
            <i className="fas fa-people-arrows me-2 text-warning"></i>
            Несумісність чергувань поспіль
          </h6>
          <div className="small text-muted mb-2">
            Особи, які не можуть чергувати поспіль (один день за іншим). Наприклад, люди з одного
            відділення.
          </div>

          {/* Already selected incompatible users */}
          {incompatibleIds.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mb-2">
              {incompatibleIds.map((id) => {
                const u = allUsers.find((x) => x.id === id);
                if (!u) return null;
                return (
                  <span key={id} className="badge bg-warning text-dark d-flex align-items-center">
                    {formatRank(u.rank)} {u.name}
                    <button
                      type="button"
                      className="btn-close btn-close-sm ms-1"
                      style={{ fontSize: '0.6rem' }}
                      onClick={() =>
                        onChange({
                          ...user,
                          incompatibleWith: incompatibleIds.filter((x) => x !== id),
                        })
                      }
                    ></button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Search to add */}
          <input
            className="form-control form-control-sm"
            placeholder="Пошук особи для додавання..."
            value={incompatibleSearch}
            onChange={(e) => setIncompatibleSearch(e.target.value)}
          />
          {filteredOtherUsers.length > 0 && (
            <div
              className="list-group list-group-flush mt-1"
              style={{ maxHeight: '160px', overflowY: 'auto' }}
            >
              {filteredOtherUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="list-group-item list-group-item-action py-1 px-2 small"
                  onClick={() => {
                    onChange({
                      ...user,
                      incompatibleWith: [...incompatibleIds, u.id!],
                    });
                    setIncompatibleSearch('');
                  }}
                >
                  <span className="text-muted me-1">{formatRank(u.rank)}</span>
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Advanced settings (collapsible) */}
      <div className="mb-3">
        <button
          className="btn btn-sm btn-link text-decoration-none p-0"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <i className={`fas fa-chevron-${showAdvanced ? 'down' : 'right'} me-2`}></i>
          Додаткові налаштування
        </button>
      </div>

      {showAdvanced && (
        <div className="card bg-light mb-3">
          <div className="card-body">
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="small text-muted">Військове звання</label>
                <select
                  className="form-select form-select-sm"
                  value={user.rank}
                  onChange={(e) => onChange({ ...user, rank: e.target.value })}
                >
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6 mb-3">
                <label className="small text-muted">ПІБ</label>
                <input
                  className="form-control form-control-sm"
                  value={user.name}
                  onChange={(e) => onChange({ ...user, name: e.target.value })}
                  placeholder="Прізвище І.Б."
                />
              </div>
              <div className="col-md-4">
                <label className="small text-muted">Посада / Примітка</label>
                <input
                  className="form-control form-control-sm"
                  value={user.note || ''}
                  onChange={(e) => onChange({ ...user, note: e.target.value })}
                  placeholder="Наприклад: водій, комендант"
                />
                <small className="text-muted">Звання відображається окремо</small>
              </div>
              <div className="col-md-4 mt-2">
                <label className="small text-muted">
                  <i className="fas fa-calendar-plus me-1"></i>Дата включення в чергу
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={user.dateAddedToAuto || ''}
                  onChange={(e) =>
                    onChange({ ...user, dateAddedToAuto: e.target.value || undefined })
                  }
                />
                {firstDutyDate && user.dateAddedToAuto !== firstDutyDate && (
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm mt-2"
                    onClick={() => onChange({ ...user, dateAddedToAuto: firstDutyDate })}
                  >
                    <i className="fas fa-calendar-check me-1"></i>
                    З дати першого чергування
                  </button>
                )}
                <small className="text-muted">
                  З цієї дати ведеться облік навантаження для авточерги.
                  {!user.dateAddedToAuto && computedFairnessDate && (
                    <>
                      {' '}
                      Зараз:{' '}
                      <strong>
                        {new Date(computedFairnessDate).toLocaleDateString('uk-UA')}
                      </strong>{' '}
                      (авто)
                    </>
                  )}
                </small>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default EditUserModal;
