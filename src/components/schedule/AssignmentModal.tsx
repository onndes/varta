import React, { useMemo, useState } from 'react';
import type { User, ScheduleEntry } from '../../types';
import Modal from '../Modal';
import { formatDate } from '../../utils/dateUtils';
import { UserFilteredList, SwapDatePicker } from './AssignmentModalParts';
import { ConfirmationView } from './AssignmentConfirmationView';
import { getUserWeekDates, type PendingAction, type SwapMode } from './assignmentModalUtils';

export type { SwapMode };

// ─── Types ────────────────────────────────────────────────────────────────────

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
  historyMode?: boolean;
}

// ─── AssignmentModal ──────────────────────────────────────────────────────────

/**
 * Modal for assigning, replacing, swapping, or removing a duty on a given date.
 * Wraps all sub-views: user list, confirmation step, swap-date picker.
 */
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
  historyMode = false,
}) => {
  const assignedUser = users.find((u) => u.id === assignedUserId);
  const [penalizeReplaced, setPenalizeReplaced] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [swapPickUserId, setSwapPickUserId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  /** Map: userId → dates this user is assigned during the current week (excl. target date). */
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
    setSearchQuery('');
    onClose();
  };

  const handleConfirm = () => {
    if (!pendingAction) return;
    if (pendingAction.type === 'replace') onAssign(pendingAction.userId, pendingAction.penalize);
    else if (pendingAction.type === 'swap') onSwap(pendingAction.userId, pendingAction.swapDate);
    else onRemove(pendingAction.reason);
    setPendingAction(null);
    setSwapPickUserId(null);
  };

  const handleSwapUserClick = (userId: number) => {
    const dates = swapUserDatesMap[userId] || [];
    if (dates.length === 1) {
      setPendingAction({ type: 'swap', userId, swapDate: dates[0] });
    } else if (dates.length > 1) {
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
    <UserFilteredList
      userList={userList}
      date={date}
      schedule={schedule}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isOnRestDay={isOnRestDay}
      calculateEffectiveLoad={calculateEffectiveLoad}
      daysSinceLastDuty={daysSinceLastDuty}
      onAction={action}
      emptyMessage={emptyMessage}
      actionLabel={actionLabel}
    />
  );

  /** Swap-date picker shown when a user has multiple duties in the current week. */
  const renderSwapDatePicker = () => {
    if (swapPickUserId === null) return null;
    const swapUser = users.find((u) => u.id === swapPickUserId);
    const dates = swapUserDatesMap[swapPickUserId] || [];
    return (
      <SwapDatePicker
        swapUser={swapUser}
        dates={dates}
        onPick={handleSwapDatePick}
        onCancel={() => setSwapPickUserId(null)}
      />
    );
  };

  const renderContent = () => {
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

    if (swapPickUserId !== null) return renderSwapDatePicker();

    if (hasEntry) {
      if (historyMode) {
        return (
          <div>
            <div className="alert alert-secondary py-2 mb-3">
              <i className="fas fa-clock-history me-2"></i>
              <strong>{assignedUser?.name}</strong>
            </div>
            <button className="btn btn-outline-danger w-100 mb-3" onClick={() => onRemove('work')}>
              <i className="fas fa-user-minus me-1"></i>Зняти з наряду
            </button>
            <div className="small text-muted mb-2">Або замінити на іншу особу:</div>
            {renderUserList(freeUsers, (userId) => onAssign(userId, false), 'Немає доступних осіб')}
          </div>
        );
      }

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
              <div className="small text-muted mb-2">Замінити на іншу особу</div>
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
                'Немає доступних осіб для заміни'
              )}
            </>
          )}

          {swapMode === 'swap' && (
            <>
              <div className="small text-muted mb-2">
                Обмін місцями з особою цього тижня (без штрафів)
              </div>
              {renderUserList(
                swapUsers,
                handleSwapUserClick,
                'Немає осіб цього тижня для обміну',
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
                Особа буде &quot;винна&quot; системі.
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

    return (
      <>
        <div className="small text-muted mb-2">Призначити особу на цей день</div>
        {renderUserList(freeUsers, (userId) => onAssign(userId, false), 'Немає доступних осіб')}
      </>
    );
  };

  return (
    <Modal show={show} onClose={handleClose} title={`Наряд на ${formatDate(date)}`}>
      <div style={{ minHeight: '72dvh' }}>{renderContent()}</div>
    </Modal>
  );
};

export default AssignmentModal;
