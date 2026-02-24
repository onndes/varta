import React, { useState, useRef } from 'react';
import type { User } from '../../types';
import { RANKS, STATUSES } from '../../utils/constants';
import Modal from '../Modal';

interface EditUserModalProps {
  user: User;
  onChange: (user: User) => void;
  onClose: () => void;
  /** Computed fallback date (earliest schedule date or today) when dateAddedToAuto is not set */
  computedFairnessDate?: string;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  onChange,
  onClose,
  computedFairnessDate,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dateFromRef = useRef<HTMLInputElement | null>(null);
  const dateToRef = useRef<HTMLInputElement | null>(null);
  const blockedDays = user.blockedDays || [];

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
        <div className="col-md-6">
          <label className="small text-muted">Статус</label>
          <select
            className="form-select form-select-sm"
            value={user.status}
            onChange={(e) => onChange({ ...user, status: e.target.value as User['status'] })}
          >
            {Object.keys(STATUSES).map((st) => (
              <option key={st} value={st}>
                {STATUSES[st]}
              </option>
            ))}
          </select>
          {user.status === 'OTHER' && (
            <div className="mt-2">
              <input
                className="form-control form-control-sm"
                value={user.statusComment || ''}
                onChange={(e) => onChange({ ...user, statusComment: e.target.value })}
                placeholder="Причина / коментар"
                maxLength={100}
              />
            </div>
          )}
        </div>
        <div className="col-md-6">
          <label className="small text-muted">Посада / Примітка</label>
          <input
            className="form-control form-control-sm"
            value={user.note || ''}
            onChange={(e) => onChange({ ...user, note: e.target.value })}
            placeholder="Наприклад: водій, комендант"
          />
          <small className="text-muted">Звання відображається окремо</small>
        </div>
      </div>

      {/* Status dates */}
      {user.status !== 'ACTIVE' && (
        <div className="card bg-light mb-3">
          <div className="card-body">
            <h6 className="card-title mb-3">Період статусу</h6>
            <div className="row">
              <div className="col-md-6 mb-3">
                <label className="small text-muted d-flex align-items-center mb-1">
                  Дата початку
                </label>
                <div className="input-group">
                  <input
                    type="date"
                    ref={(el) => {
                      dateFromRef.current = el;
                    }}
                    className="form-control"
                    value={user.statusFrom || ''}
                    onChange={(e) => onChange({ ...user, statusFrom: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => dateFromRef.current?.showPicker()}
                  >
                    <i className="fas fa-calendar-alt"></i>
                  </button>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <label className="small text-muted d-flex align-items-center mb-1">
                  Дата завершення
                </label>
                <div className="input-group">
                  <input
                    type="date"
                    ref={(el) => {
                      dateToRef.current = el;
                    }}
                    className="form-control"
                    value={user.statusTo || ''}
                    onChange={(e) => onChange({ ...user, statusTo: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => dateToRef.current?.showPicker()}
                  >
                    <i className="fas fa-calendar-alt"></i>
                  </button>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-md-6">
                <div className="form-check form-switch">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="restBefore"
                    checked={user.restBeforeStatus || false}
                    onChange={(e) => onChange({ ...user, restBeforeStatus: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="restBefore"
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
                    id="restAfter"
                    checked={user.restAfterStatus || false}
                    onChange={(e) => onChange({ ...user, restAfterStatus: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <label
                    className="form-check-label"
                    htmlFor="restAfter"
                    style={{ cursor: 'pointer' }}
                  >
                    <i className="fas fa-bed me-2 text-info"></i>
                    Відпочинок день після події
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
