// src/components/schedule/AssignmentModalParts.tsx — UserListItem, ConfirmationView, UserFilteredList, SwapDatePicker
import React from 'react';
import type { User, ScheduleEntry } from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { formatRank, compareByRankAndName } from '../../utils/helpers';
import { countUserDaysOfWeek } from '../../services/scheduleService';
import {
  WEEKDAY_COLUMNS,
  hasShiftNextDay,
  getLastDutyDateBeforeTarget,
} from './assignmentModalUtils';
// ─── UserListItem ─────────────────────────────────────────────────────────────

interface UserListItemProps {
  user: User;
  date: string;
  isRest: boolean;
  hasNextDayShift: boolean;
  lastDutyWeekday?: string;
  effectiveLoad: number;
  daysSince: number;
  weekdayCounts: Record<number, number>;
  onAction: (userId: number) => void;
  actionLabel?: string;
}

/** Single row in the user-selection list showing duty stats and karma. */
export const UserListItem: React.FC<UserListItemProps> = ({
  user,
  date,
  isRest,
  hasNextDayShift,
  lastDutyWeekday,
  effectiveLoad,
  daysSince,
  weekdayCounts,
  onAction,
  actionLabel,
}) => {
  const dayIdx = new Date(date).getDay();
  const owes = (user.owedDays && user.owedDays[dayIdx]) || 0;

  const daysSinceLabel =
    daysSince === Number.POSITIVE_INFINITY
      ? '—'
      : daysSince === 0
        ? 'сьогодні'
        : `${daysSince} дн. тому`;

  return (
    <button
      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-3 ${isRest ? 'list-group-item-warning' : ''}`}
      onClick={() => onAction(user.id!)}
    >
      <div className="flex-grow-1">
        <div className="d-flex align-items-baseline gap-2">
          <small
            className="text-muted text-uppercase"
            style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
          >
            {formatRank(user.rank)}
          </small>
          <div>
            <span
              className="fw-bold text-uppercase"
              style={{ fontSize: '0.82rem', letterSpacing: '0.02em' }}
            >
              {user.name.trim().split(/\s+/)[0]}
            </span>
            {user.name.trim().split(/\s+/).length > 1 && (
              <span className="text-muted ms-1" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {user.name.trim().split(/\s+/).slice(1).join(' ')}
              </span>
            )}
          </div>
        </div>

        {owes > 0 && <span className="badge bg-danger ms-2">борг: {owes}</span>}
        {isRest && (
          <span className="badge bg-warning text-dark ms-2">
            <i className="fas fa-bed me-1"></i>відсипний
          </span>
        )}
        {hasNextDayShift && (
          <span className="badge bg-info text-dark ms-2">
            <i className="fas fa-clock me-1"></i>зміна завтра
          </span>
        )}

        <div className="small text-muted d-flex align-items-center flex-wrap">
          <span>
            Навант: {effectiveLoad.toFixed(1)} · Карма:{' '}
            <span
              className={
                user.debt < 0 ? 'text-danger' : user.debt > 0 ? 'text-success' : 'text-muted'
              }
            >
              {user.debt > 0 ? '+' + user.debt : user.debt}
            </span>
          </span>
          <span className="ms-3">
            ({daysSinceLabel}
            {lastDutyWeekday ? `, ${lastDutyWeekday}` : ''})
          </span>
        </div>
      </div>
      <div className="d-flex align-items-start gap-2 flex-shrink-0">
        <div
          className="d-grid text-center"
          style={{
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: '2px',
            fontSize: '0.65rem',
            minWidth: '224px',
          }}
        >
          {WEEKDAY_COLUMNS.map(({ day, label }) => (
            <div
              key={label}
              className={`rounded px-1 py-1 ${day === dayIdx ? 'bg-body-secondary text-body-secondary' : 'bg-light text-muted'}`}
            >
              {label}
            </div>
          ))}
          {WEEKDAY_COLUMNS.map(({ day, label }) => (
            <div
              key={`${label}-count`}
              className={`rounded px-1 py-1 fw-semibold ${day === dayIdx ? 'bg-secondary-subtle text-body' : 'bg-body-secondary'}`}
            >
              {weekdayCounts[day] || 0}
            </div>
          ))}
        </div>
        {actionLabel && <span className="badge bg-primary mt-1">{actionLabel}</span>}
      </div>
    </button>
  );
};

// ─── UserFilteredList ─────────────────────────────────────────────────────────

interface UserFilteredListProps {
  userList: User[];
  date: string;
  schedule: Record<string, ScheduleEntry>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isOnRestDay: (userId: number, date: string) => boolean;
  calculateEffectiveLoad: (user: User) => number;
  daysSinceLastDuty: (userId: number, date: string) => number;
  onAction: (userId: number) => void;
  emptyMessage: string;
  actionLabel?: string;
}

/** Searchable, sorted user list for assignment/replace/swap selection. */
export const UserFilteredList: React.FC<UserFilteredListProps> = ({
  userList,
  date,
  schedule,
  searchQuery,
  onSearchChange,
  isOnRestDay,
  calculateEffectiveLoad,
  daysSinceLastDuty,
  onAction,
  emptyMessage,
  actionLabel,
}) => {
  const query = searchQuery.toLowerCase().trim();
  const sorted = [...userList].sort(compareByRankAndName);
  const filtered = query
    ? sorted.filter(
        (u) =>
          u.name.toLowerCase().includes(query) || (u.rank && u.rank.toLowerCase().includes(query))
      )
    : sorted;

  return (
    <>
      <input
        type="text"
        className="form-control form-control-sm mb-2"
        placeholder="🔍 Пошук за ПІБ або званням..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className="list-group" style={{ maxHeight: 'min(58dvh, 560px)', overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div className="text-muted text-center py-3">
            {query ? 'Нічого не знайдено' : emptyMessage}
          </div>
        )}
        {filtered.map((u) => {
          const lastDutyDate = getLastDutyDateBeforeTarget(u.id!, date, schedule);
          const lastDutyWeekday = lastDutyDate
            ? new Date(lastDutyDate)
                .toLocaleDateString('uk-UA', { weekday: 'short' })
                .replace('.', '')
                .toUpperCase()
            : undefined;
          const weekdayCounts = countUserDaysOfWeek(u.id!, schedule);
          return (
            <UserListItem
              key={u.id}
              user={u}
              date={date}
              isRest={isOnRestDay(u.id!, date)}
              hasNextDayShift={hasShiftNextDay(u.id!, date, schedule)}
              lastDutyWeekday={lastDutyWeekday}
              effectiveLoad={calculateEffectiveLoad(u)}
              daysSince={daysSinceLastDuty(u.id!, date)}
              weekdayCounts={weekdayCounts}
              onAction={onAction}
              actionLabel={actionLabel}
            />
          );
        })}
      </div>
    </>
  );
};

// ─── SwapDatePicker ───────────────────────────────────────────────────────────
interface SwapDatePickerProps {
  swapUser?: User;
  dates: string[];
  onPick: (date: string) => void;
  onCancel: () => void;
}
/** Shown when a user has multiple duties this week and admin must pick one to swap. */
export const SwapDatePicker: React.FC<SwapDatePickerProps> = ({
  swapUser,
  dates,
  onPick,
  onCancel,
}) => (
  <div>
    <div className="alert alert-info py-2 mb-3">
      <strong>{swapUser?.name}</strong> має {dates.length} нарядів цього тижня.
      <br />
      Оберіть дату для обміну:
    </div>
    <div className="list-group mb-3">
      {dates.map((d) => (
        <button
          key={d}
          className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
          onClick={() => onPick(d)}
        >
          <span>{formatDate(d)}</span>
          <span className="badge bg-primary">
            <i className="fas fa-retweet"></i>
          </span>
        </button>
      ))}
    </div>
    <button className="btn btn-outline-secondary w-100" onClick={onCancel}>
      Назад
    </button>
  </div>
);
