// src/components/users/EditUserModalSections.tsx — BlockedDaysSection, IncompatiblePairsSection, AdvancedSettingsSection
import React from 'react';
import type { User } from '../../types';
import { RANKS } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// ─── BlockedDaysSection ───────────────────────────────────────────────────────

interface BlockedDaysSectionProps {
  user: User;
  onChange: (user: User) => void;
}

/** Day-of-week blocking card with optional date range and comment. */
export const BlockedDaysSection: React.FC<BlockedDaysSectionProps> = ({ user, onChange }) => {
  const blockedDays = user.blockedDays || [];

  const toggleDay = (dayIdx: number) => {
    const next = blockedDays.includes(dayIdx)
      ? blockedDays.filter((d) => d !== dayIdx)
      : [...blockedDays, dayIdx].sort();
    if (next.length === 0) {
      onChange({
        ...user,
        blockedDays: [],
        blockedDaysFrom: undefined,
        blockedDaysTo: undefined,
        blockedDaysComment: undefined,
      });
    } else {
      onChange({ ...user, blockedDays: next });
    }
  };

  return (
    <div className="card mb-3">
      <div className="card-body">
        <h6 className="card-title">
          <i className="fas fa-ban me-2 text-danger"></i>Блокування днів тижня
        </h6>
        <div className="small text-muted mb-2">
          Виберіть дні, коли користувач НЕ може чергувати (виключено з автоматичного розподілення)
        </div>
        <div className="btn-group w-100" role="group">
          {WEEKDAYS.map((day, idx) => {
            const mondayIdx = idx + 1;
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
  );
};

// ─── IncompatiblePairsSection ─────────────────────────────────────────────────

interface IncompatiblePairsSectionProps {
  user: User;
  incompatibleIds: number[];
  otherUsers: User[];
  incompatibleSearch: string;
  filteredOtherUsers: User[];
  onSearchChange: (q: string) => void;
  onChange: (user: User) => void;
}

/** Incompatible-consecutive-duty pairs picker with search. */
export const IncompatiblePairsSection: React.FC<IncompatiblePairsSectionProps> = ({
  user,
  incompatibleIds,
  otherUsers: _otherUsers,
  incompatibleSearch,
  filteredOtherUsers,
  onSearchChange,
  onChange,
}) => (
  <div className="card mb-3">
    <div className="card-body">
      <h6 className="card-title">
        <i className="fas fa-people-arrows me-2 text-warning"></i>Несумісність чергувань поспіль
      </h6>
      <div className="small text-muted mb-2">
        Особи, які не можуть чергувати поспіль (один день за іншим). Наприклад, люди з одного
        відділення.
      </div>
      {incompatibleIds.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {incompatibleIds.map((id) => {
            const u =
              _otherUsers.find((x) => x.id === id) || ({ id, name: `#${id}`, rank: '' } as User);
            return (
              <span key={id} className="badge bg-warning text-dark d-flex align-items-center">
                {formatRank(u.rank)} {u.name}
                <button
                  type="button"
                  className="btn-close btn-close-sm ms-1"
                  style={{ fontSize: '0.6rem' }}
                  onClick={() =>
                    onChange({ ...user, incompatibleWith: incompatibleIds.filter((x) => x !== id) })
                  }
                ></button>
              </span>
            );
          })}
        </div>
      )}
      <input
        className="form-control form-control-sm"
        placeholder="Пошук особи для додавання..."
        value={incompatibleSearch}
        onChange={(e) => onSearchChange(e.target.value)}
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
                onChange({ ...user, incompatibleWith: [...incompatibleIds, u.id!] });
                onSearchChange('');
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
);

// ─── AdvancedSettingsSection ──────────────────────────────────────────────────

interface AdvancedSettingsSectionProps {
  user: User;
  computedFairnessDate?: string;
  firstDutyDate?: string;
  onChange: (user: User) => void;
}

/** Collapsible advanced settings: rank, name, note, dateAddedToAuto. */
export const AdvancedSettingsSection: React.FC<AdvancedSettingsSectionProps> = ({
  user,
  computedFairnessDate,
  firstDutyDate,
  onChange,
}) => (
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
            onChange={(e) => onChange({ ...user, dateAddedToAuto: e.target.value || undefined })}
          />
          {firstDutyDate && user.dateAddedToAuto !== firstDutyDate && (
            <button
              type="button"
              className="btn btn-outline-primary btn-sm mt-2"
              onClick={() => onChange({ ...user, dateAddedToAuto: firstDutyDate })}
            >
              <i className="fas fa-calendar-check me-1"></i>З дати першого чергування
            </button>
          )}
          <small className="text-muted">
            З цієї дати ведеться облік навантаження для авточерги.
            {!user.dateAddedToAuto && computedFairnessDate && (
              <>
                {' '}
                Зараз: <strong>
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
);
