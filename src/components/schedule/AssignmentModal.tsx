import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry } from '../../types';
import Modal from '../Modal';
import { formatDate } from '../../utils/dateUtils';
import { toAssignedUserIds } from '../../utils/assignment';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SwapMode = 'replace' | 'swap' | 'remove';

interface AssignmentModalProps {
  show: boolean;
  date: string;
  assignedUserId?: number;
  users: User[];
  freeUsers: User[];
  swapUsers: User[];
  schedule: Record<string, ScheduleEntry>;
  weekDates: string[];
  swapMode: SwapMode;
  onSetSwapMode: (mode: SwapMode) => void;
  onAssign: (userId: number, penalizeReplaced: boolean) => void;
  onSwap: (userId: number, swapDate: string) => void;
  onRemove: (reason: 'request' | 'work') => void;
  onClose: () => void;
  isOnRestDay: (userId: number, date: string) => boolean;
  calculateEffectiveLoad: (user: User) => number;
  daysSinceLastDuty: (userId: number, date: string) => number;
  hasEntry: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if user has a shift the day AFTER the target date */
const hasShiftNextDay = (
  userId: number,
  dateStr: string,
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const nextDate = new Date(dateStr);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextIso = nextDate.toISOString().split('T')[0];
  const entry = schedule[nextIso];
  return entry ? toAssignedUserIds(entry.userId).includes(userId) : false;
};

/** Check if user had duty on Sunday of the previous week */
const hadPrevWeekSundayDuty = (
  userId: number,
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>
): boolean => {
  const prevSunday = new Date(weekDates[0]);
  prevSunday.setDate(prevSunday.getDate() - 1);
  const prevSundayIso = prevSunday.toISOString().split('T')[0];
  const entry = schedule[prevSundayIso];
  return entry ? toAssignedUserIds(entry.userId).includes(userId) : false;
};

/** Get all dates this week where a user is assigned (excluding target date) */
const getUserWeekDates = (
  userId: number,
  targetDate: string,
  weekDates: string[],
  schedule: Record<string, ScheduleEntry>
): string[] => {
  return weekDates.filter((wd) => {
    if (wd === targetDate) return false;
    const entry = schedule[wd];
    return entry ? toAssignedUserIds(entry.userId).includes(userId) : false;
  });
};

// ─── UserListItem ─────────────────────────────────────────────────────────────

const UserListItem: React.FC<{
  user: User;
  date: string;
  isRest: boolean;
  hasNextDayShift: boolean;
  hadSundayDuty: boolean;
  effectiveLoad: number;
  daysSince: number;
  onAction: (userId: number) => void;
  actionLabel?: string;
}> = ({
  user,
  date,
  isRest,
  hasNextDayShift,
  hadSundayDuty,
  effectiveLoad,
  daysSince,
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
      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isRest ? 'list-group-item-warning' : ''}`}
      onClick={() => onAction(user.id!)}
    >
      <div>
        <span className="fw-bold">{user.name}</span>
        <span className="text-muted ms-1 small">({daysSinceLabel})</span>

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
        {hadSundayDuty && (
          <span className="badge bg-secondary ms-2">
            <i className="fas fa-calendar-day me-1"></i>Був у нд мин. тижня
          </span>
        )}

        <div className="small text-muted">
          Навант: {effectiveLoad.toFixed(1)} · Карма:{' '}
          <span
            className={
              user.debt < 0 ? 'text-danger' : user.debt > 0 ? 'text-success' : 'text-muted'
            }
          >
            {user.debt > 0 ? '+' + user.debt : user.debt}
          </span>
        </div>
      </div>
      {actionLabel && <span className="badge bg-primary">{actionLabel}</span>}
    </button>
  );
};

// ─── Confirmation views ───────────────────────────────────────────────────────

type PendingAction =
  | { type: 'replace'; userId: number; penalize: boolean }
  | { type: 'swap'; userId: number; swapDate: string }
  | { type: 'remove'; reason: 'request' | 'work' };

const ConfirmationView: React.FC<{
  pending: PendingAction;
  date: string;
  assignedUser?: User;
  users: User[];
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ pending, date, assignedUser, users, onConfirm, onCancel }) => {
  const newUser = pending.type !== 'remove' ? users.find((u) => u.id === pending.userId) : null;

  return (
    <div>
      <div className="alert alert-warning py-2 mb-3">
        <i className="fas fa-exclamation-triangle me-2"></i>
        <strong>Підтвердження дії</strong>
      </div>

      <div className="mb-3">
        <div className="mb-2">
          <strong>Дата:</strong> {formatDate(date)}
        </div>

        {pending.type === 'replace' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-danger me-2">
                <i className="fas fa-minus"></i>
              </span>
              <span>
                Знімається: <strong>{assignedUser?.name}</strong>
                {pending.penalize && <span className="text-danger ms-1">(−карма)</span>}
              </span>
            </div>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-success me-2">
                <i className="fas fa-plus"></i>
              </span>
              <span>
                Призначається: <strong>{newUser?.name}</strong>
              </span>
            </div>
          </>
        )}

        {pending.type === 'swap' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-primary me-2">
                <i className="fas fa-retweet"></i>
              </span>
              <span>
                <strong>{assignedUser?.name}</strong> ({formatDate(date)})
              </span>
            </div>
            <div className="text-center my-1">
              <i className="fas fa-arrows-up-down text-muted"></i>
            </div>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-primary me-2">
                <i className="fas fa-retweet"></i>
              </span>
              <span>
                <strong>{newUser?.name}</strong> ({formatDate(pending.swapDate)})
              </span>
            </div>
            <div className="small text-muted mt-2">Без штрафів для обох бійців</div>
          </>
        )}

        {pending.type === 'remove' && (
          <>
            <div className="d-flex align-items-center mb-1">
              <span className="badge bg-danger me-2">
                <i className="fas fa-user-minus"></i>
              </span>
              <span>
                Знімається: <strong>{assignedUser?.name}</strong>
              </span>
            </div>
            <div className="small mt-1">
              {pending.reason === 'request' ? (
                <span className="text-danger">
                  <i className="fas fa-file-alt me-1"></i>За рапортом — Карма МІНУС
                </span>
              ) : (
                <span className="text-muted">
                  <i className="fas fa-briefcase me-1"></i>Службова — Карма 0
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="d-grid gap-2">
        <button className="btn btn-primary" onClick={onConfirm}>
          <i className="fas fa-check me-1"></i>Підтвердити
        </button>
        <button className="btn btn-outline-secondary" onClick={onCancel}>
          Назад
        </button>
      </div>
    </div>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────

const AssignmentModal: React.FC<AssignmentModalProps> = ({
  show,
  date,
  assignedUserId,
  users,
  freeUsers,
  swapUsers,
  schedule,
  weekDates,
  swapMode,
  onSetSwapMode,
  onAssign,
  onSwap,
  onRemove,
  onClose,
  isOnRestDay,
  calculateEffectiveLoad,
  daysSinceLastDuty,
  hasEntry,
}) => {
  const assignedUser = users.find((u) => u.id === assignedUserId);
  const [penalizeReplaced, setPenalizeReplaced] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  // For swap: when user has multiple week dates, pick which one
  const [swapPickUserId, setSwapPickUserId] = useState<number | null>(null);

  // Build a map: userId → dates assigned this week (excluding target date)
  const swapUserDatesMap = useMemo(() => {
    const map: Record<number, string[]> = {};
    swapUsers.forEach((u) => {
      map[u.id!] = getUserWeekDates(u.id!, date, weekDates, schedule);
    });
    return map;
  }, [swapUsers, date, weekDates, schedule]);

  const handleClose = () => {
    setPendingAction(null);
    setSwapPickUserId(null);
    onClose();
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'replace') {
      onAssign(pendingAction.userId, pendingAction.penalize);
    } else if (pendingAction.type === 'swap') {
      onSwap(pendingAction.userId, pendingAction.swapDate);
    } else {
      onRemove(pendingAction.reason);
    }
    setPendingAction(null);
    setSwapPickUserId(null);
  };

  const handleSwapUserClick = (userId: number) => {
    const dates = swapUserDatesMap[userId] || [];
    if (dates.length === 1) {
      // One date — go straight to confirmation
      setPendingAction({ type: 'swap', userId, swapDate: dates[0] });
    } else if (dates.length > 1) {
      // Multiple dates — let admin pick which one
      setSwapPickUserId(userId);
    }
  };

  const handleSwapDatePick = (swapDate: string) => {
    if (swapPickUserId === null) return;
    setPendingAction({ type: 'swap', userId: swapPickUserId, swapDate });
    setSwapPickUserId(null);
  };

  const renderUserList = (
    userList: User[],
    action: (userId: number) => void,
    emptyMessage: string,
    actionLabel?: string
  ) => (
    <div className="list-group" style={{ maxHeight: '350px', overflowY: 'auto' }}>
      {userList.length === 0 && <div className="text-muted text-center py-3">{emptyMessage}</div>}
      {userList.map((u) => (
        <UserListItem
          key={u.id}
          user={u}
          date={date}
          isRest={isOnRestDay(u.id!, date)}
          hasNextDayShift={hasShiftNextDay(u.id!, date, schedule)}
          hadSundayDuty={hadPrevWeekSundayDuty(u.id!, weekDates, schedule)}
          effectiveLoad={calculateEffectiveLoad(u)}
          daysSince={daysSinceLastDuty(u.id!, date)}
          onAction={action}
          actionLabel={actionLabel}
        />
      ))}
    </div>
  );

  // ─── Swap date picker for users with multiple weekly duties ─────────────
  const renderSwapDatePicker = () => {
    if (swapPickUserId === null) return null;
    const swapUser = users.find((u) => u.id === swapPickUserId);
    const dates = swapUserDatesMap[swapPickUserId] || [];

    return (
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
              onClick={() => handleSwapDatePick(d)}
            >
              <span>{formatDate(d)}</span>
              <span className="badge bg-primary">
                <i className="fas fa-retweet"></i>
              </span>
            </button>
          ))}
        </div>
        <button className="btn btn-outline-secondary w-100" onClick={() => setSwapPickUserId(null)}>
          Назад
        </button>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const renderContent = () => {
    // Confirmation step
    if (pendingAction) {
      return (
        <ConfirmationView
          pending={pendingAction}
          date={date}
          assignedUser={assignedUser}
          users={users}
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
        />
      );
    }

    // Swap date picker
    if (swapPickUserId !== null) {
      return renderSwapDatePicker();
    }

    // Has an existing assignment
    if (hasEntry) {
      return (
        <div>
          <div className="alert alert-secondary py-2 mb-3">
            <strong>{assignedUser?.name}</strong>
          </div>
          <div className="btn-group w-100 mb-3">
            <button
              className={`btn btn-sm ${swapMode === 'replace' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => onSetSwapMode('replace')}
            >
              <i className="fas fa-right-left me-1"></i>Заміна
            </button>
            <button
              className={`btn btn-sm ${swapMode === 'swap' ? 'btn-success' : 'btn-outline-success'}`}
              onClick={() => onSetSwapMode('swap')}
            >
              <i className="fas fa-retweet me-1"></i>Обмін
            </button>
            <button
              className={`btn btn-sm ${swapMode === 'remove' ? 'btn-danger' : 'btn-outline-danger'}`}
              onClick={() => onSetSwapMode('remove')}
            >
              <i className="fas fa-user-minus me-1"></i>Зняти
            </button>
          </div>

          {swapMode === 'replace' && (
            <>
              <div className="small text-muted mb-2">Замінити на іншого бійця</div>
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="penalizeReplaced"
                  checked={penalizeReplaced}
                  onChange={(e) => setPenalizeReplaced(e.target.checked)}
                />
                <label
                  className={`form-check-label small${penalizeReplaced ? ' text-danger fw-semibold' : ''}`}
                  htmlFor="penalizeReplaced"
                >
                  Нарахувати &minus;карму тому, кого знімають
                </label>
              </div>
              {renderUserList(
                freeUsers,
                (userId) =>
                  setPendingAction({ type: 'replace', userId, penalize: penalizeReplaced }),
                'Немає доступних бійців для заміни'
              )}
            </>
          )}

          {swapMode === 'swap' && (
            <>
              <div className="small text-muted mb-2">
                Обмін місцями з бійцем цього тижня (без штрафів)
              </div>
              {renderUserList(
                swapUsers,
                handleSwapUserClick,
                'Немає бійців цього тижня для обміну',
                '↔'
              )}
            </>
          )}

          {swapMode === 'remove' && (
            <div className="d-grid gap-2">
              <button
                className="btn btn-outline-danger"
                onClick={() => setPendingAction({ type: 'remove', reason: 'request' })}
              >
                <i className="fas fa-file-alt me-1"></i>За рапортом (Карма МІНУС)
              </button>
              <div className="small text-muted text-center">
                Боєць буде &quot;винен&quot; системі.
              </div>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setPendingAction({ type: 'remove', reason: 'work' })}
              >
                <i className="fas fa-briefcase me-1"></i>Службова (Карма 0)
              </button>
            </div>
          )}
        </div>
      );
    }

    // Empty slot — assign
    return (
      <>
        <div className="small text-muted mb-2">Призначити бійця на цей день</div>
        {renderUserList(freeUsers, (userId) => onAssign(userId, false), 'Немає доступних бійців')}
      </>
    );
  };

  return (
    <Modal show={show} onClose={handleClose} title={`Наряд на ${formatDate(date)}`}>
      <div>{renderContent()}</div>
    </Modal>
  );
};

export default AssignmentModal;
