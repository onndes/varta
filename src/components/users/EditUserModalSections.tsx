// src/components/users/EditUserModalSections.tsx — IncompatiblePairsSection, AdvancedSettingsSection
import React from 'react';
import type { User } from '../../types';
import { RANKS } from '../../utils/constants';
import { formatRank } from '../../utils/helpers';

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

/** Advanced settings: rank, name, note, birthday, dateAddedToAuto. */
export const AdvancedSettingsSection: React.FC<AdvancedSettingsSectionProps> = ({
  user,
  computedFairnessDate,
  firstDutyDate,
  onChange,
}) => (
  <div className="card mb-3">
    <div className="card-body">
      <h6 className="card-title">
        <i className="fas fa-id-card me-2 text-secondary"></i>Особові дані
      </h6>
      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label small text-muted mb-1">Військове звання</label>
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
        <div className="col-md-6">
          <label className="form-label small text-muted mb-1">ПІБ</label>
          <input
            className="form-control form-control-sm"
            value={user.name}
            onChange={(e) => onChange({ ...user, name: e.target.value })}
            placeholder="Прізвище І.Б."
          />
        </div>
        <div className="col-md-4">
          <label className="form-label small text-muted mb-1">Посада / Примітка</label>
          <input
            className="form-control form-control-sm"
            value={user.note || ''}
            onChange={(e) => onChange({ ...user, note: e.target.value })}
            placeholder="Наприклад: водій, комендант"
          />
          <div className="form-text">Звання відображається окремо</div>
        </div>
        <div className="col-md-4">
          <label className="form-label small text-muted mb-1">
            <i className="fas fa-birthday-cake me-1"></i>Дата народження
          </label>
          <div className="d-flex gap-2 align-items-center">
            <input
              type="date"
              className="form-control form-control-sm"
              value={user.birthday || ''}
              onChange={(e) => onChange({ ...user, birthday: e.target.value || undefined })}
            />
            {user.birthday && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm flex-shrink-0"
                onClick={() => onChange({ ...user, birthday: undefined })}
                title="Очистити"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>
          <div className="form-text">Чергування в цей день будуть заблоковані.</div>
        </div>
        <div className="col-md-4">
          <label className="form-label small text-muted mb-1">
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
              <i className="fas fa-calendar-check me-1"></i>З першого чергування
            </button>
          )}
          <div className="form-text">
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
          </div>
        </div>
      </div>
    </div>
  </div>
);
