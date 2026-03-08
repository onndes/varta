import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  User,
  ScheduleEntry,
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  PrintMode,
} from '../types';
import { toLocalISO, getWeekNumber, getWeekYear } from '../utils/dateUtils';
import {
  calculateEffectiveLoad as calcEffectiveLoad,
  removeAssignmentWithDebt,
  bulkDeleteSchedule,
} from '../services/scheduleService';
import * as userService from '../services/userService';
import type { DeletedUserInfo } from '../services/userService';
import { isUserAvailable } from '../services/userService';
import { useAutoScheduler } from '../hooks';
import { useScheduleHistory } from '../hooks/useScheduleHistory';
import { useWeekNavigation } from '../hooks/useWeekNavigation';
import { useScheduleActions } from '../hooks/useScheduleActions';
import { useAssignmentModal } from '../hooks/useAssignmentModal';
import * as auditService from '../services/auditService';
import WeekNavigator from './schedule/WeekNavigator';
import ScheduleControls from './schedule/ScheduleControls';
import PrintHeader from './schedule/PrintHeader';
import PrintFooter from './PrintFooter';
import ScheduleTable from './schedule/ScheduleTable';
import PrintCalendar from './schedule/PrintCalendar';
import PrintDutyTable from './schedule/PrintDutyTable';
import PrintStatusList from './schedule/PrintStatusList';
import AssignmentModal from './schedule/AssignmentModal';
import ConfirmAssignModal from './schedule/ConfirmAssignModal';
import ImportScheduleModal from './schedule/ImportScheduleModal';
import EditUserModal from './users/EditUserModal';
import UserChangesReviewModal from './users/UserChangesReviewModal';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';
import { getAssignedCount, toAssignedUserIds, getLogicSchedule, getFirstDutyDate } from '../utils/assignment';
import { getFutureStatusPeriods, getStatusPeriodAtDate, getUserStatusPeriods } from '../utils/userStatus';
import { cloneUserDraft, getUserChangeSummary } from '../utils/userEditDiff';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  refreshData: () => Promise<void>;
  logAction: (action: string, details: string) => Promise<void>;
  dayWeights: DayWeights;
  cascadeStartDate: string | null;
  updateCascadeTrigger: (date: string) => Promise<void>;
  clearCascadeTrigger: () => Promise<void>;
  signatories: Signatories;
  autoScheduleOptions?: AutoScheduleOptions;
  dutiesPerDay: number;
  printMode: PrintMode;
  printMaxRows: number;
  ignoreHistoryInLogic: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

const ScheduleView: React.FC<ScheduleViewProps> = ({
  users,
  schedule,
  refreshData,
  logAction,
  dayWeights,
  cascadeStartDate,
  updateCascadeTrigger,
  clearCascadeTrigger,
  signatories,
  autoScheduleOptions = DEFAULT_AUTO_SCHEDULE_OPTIONS,
  dutiesPerDay,
  printMode,
  printMaxRows,
  ignoreHistoryInLogic,
}) => {
  // ── Deleted users (historical display) ──────────────────────────────────
  const [deletedUserNames, setDeletedUserNames] = useState<Record<number, DeletedUserInfo>>({});
  useEffect(() => {
    userService.getDeletedUserNames().then(setDeletedUserNames);
  }, [users]);

  const deletedUserIds = useMemo(
    () => new Set(Object.keys(deletedUserNames).map(Number)),
    [deletedUserNames]
  );

  // ── Filtered schedule for load calculations ─────────────────────────────
  const logicSchedule = useMemo(
    () => getLogicSchedule(schedule, ignoreHistoryInLogic),
    [schedule, ignoreHistoryInLogic]
  );

  // ── UI state ────────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editBaseUser, setEditBaseUser] = useState<User | null>(null);
  const [pendingEditReview, setPendingEditReview] = useState<{
    draft: User;
    changes: ReturnType<typeof getUserChangeSummary>;
  } | null>(null);
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);

  const saveEditedUser = useCallback(
    async (user: User) => {
      if (!user.id) return;
      const todayStr = toLocalISO(new Date());
      const normalizedPeriods = getUserStatusPeriods(user);
      const currentPeriod = getStatusPeriodAtDate(user, todayStr);
      const nextPeriod = getFutureStatusPeriods(user, todayStr)[0];
      const legacyPeriod = currentPeriod || null;
      const legacyRestBefore = legacyPeriod?.restBefore || false;
      const legacyRestAfter = legacyPeriod?.restAfter || false;

      await userService.updateUser(user.id, {
        name: user.name,
        rank: user.rank,
        status: legacyPeriod ? legacyPeriod.status : 'ACTIVE',
        statusFrom: legacyPeriod ? legacyPeriod.from : undefined,
        statusTo: legacyPeriod ? legacyPeriod.to : undefined,
        isActive: user.isActive,
        excludeFromAuto: user.excludeFromAuto,
        note: user.note,
        restBeforeStatus: legacyRestBefore,
        restAfterStatus: legacyRestAfter,
        blockedDays: user.blockedDays,
        blockedDaysFrom: user.blockedDaysFrom,
        blockedDaysTo: user.blockedDaysTo,
        blockedDaysComment: user.blockedDaysComment,
        statusComment: legacyPeriod?.status === 'ABSENT' ? legacyPeriod.comment : undefined,
        statusPeriods: normalizedPeriods,
        dateAddedToAuto: user.dateAddedToAuto,
      });
      await userService.syncUserIncompatibility(user.id, user.incompatibleWith);

      if (legacyPeriod?.from) {
        await updateCascadeTrigger(legacyPeriod.from);
      } else if (nextPeriod?.from) {
        await updateCascadeTrigger(nextPeriod.from);
      } else {
        await updateCascadeTrigger(todayStr);
      }

      await refreshData();
    },
    [updateCascadeTrigger, refreshData]
  );

  const resetEditState = useCallback(() => {
    setEditingUser(null);
    setEditBaseUser(null);
    setPendingEditReview(null);
    setIsApplyingEdit(false);
  }, []);

  const handleStartEdit = useCallback((user: User) => {
    setEditBaseUser(cloneUserDraft(user));
    setEditingUser(cloneUserDraft(user));
  }, []);

  const handleCloseEditModal = useCallback(() => {
    if (!editingUser || !editBaseUser) {
      resetEditState();
      return;
    }

    const changes = getUserChangeSummary(editBaseUser, editingUser, users);
    if (changes.length === 0) {
      resetEditState();
      return;
    }

    setPendingEditReview({
      draft: cloneUserDraft(editingUser),
      changes,
    });
  }, [editBaseUser, editingUser, resetEditState, users]);

  const handleCancelEditReview = useCallback(() => {
    setPendingEditReview(null);
  }, []);

  const handleDiscardEditChanges = useCallback(() => {
    resetEditState();
  }, [resetEditState]);

  const handleApplyEditChanges = useCallback(async () => {
    const draft = pendingEditReview?.draft;
    if (!draft?.id) {
      resetEditState();
      return;
    }

    setIsApplyingEdit(true);
    try {
      await saveEditedUser(draft);
      await logAction('EDIT', `Редаговано: ${draft.name}`);
      resetEditState();
    } finally {
      setIsApplyingEdit(false);
    }
  }, [logAction, pendingEditReview, resetEditState, saveEditedUser]);

  // ── Core operations ─────────────────────────────────────────────────────
  const calculateEffectiveLoad = useCallback(
    (user: User) => calcEffectiveLoad(user, logicSchedule, dayWeights),
    [logicSchedule, dayWeights]
  );

  const assignUser = useCallback(
    async (
      date: string,
      userId: number,
      isManual = true,
      options?: {
        maxPerDay?: number;
        replaceUserId?: number;
        penalizeReplaced?: boolean;
        historyMode?: boolean;
      }
    ) => {
      const existing = schedule[date];
      const existingIds = toAssignedUserIds(existing?.userId);
      if (existingIds.includes(userId)) return;

      let nextIds = [...existingIds];
      const replaceUserId = options?.replaceUserId;
      if (typeof replaceUserId === 'number' && nextIds.includes(replaceUserId)) {
        nextIds = nextIds.filter((id) => id !== replaceUserId);
        const prevUser = users.find((u) => u.id === replaceUserId);
        if (prevUser) {
          if (options?.penalizeReplaced) {
            const dayIdx = new Date(date).getDay();
            const weight = dayWeights[dayIdx] || 1.0;
            await userService.updateUserDebt(replaceUserId, -weight);
            await auditService.logAction(
              'REMOVE',
              `${prevUser.name} замінено на ${date} (Карма -${weight})`
            );
          } else {
            await auditService.logAction('REMOVE', `${prevUser.name} замінено на ${date}`);
          }
        }
      }

      if (options?.maxPerDay && !options?.historyMode && nextIds.length >= options.maxPerDay) {
        throw new Error('Досягнуто ліміт чергувань на день');
      }

      nextIds.push(userId);

      const isReplace = typeof replaceUserId === 'number';
      const entryType = options?.historyMode
        ? 'history'
        : isManual
          ? isReplace
            ? 'replace'
            : 'manual'
          : 'auto';

      const { saveScheduleEntry } = await import('../services/scheduleService');
      const entry: ScheduleEntry = {
        date,
        userId: nextIds.length === 1 ? nextIds[0] : nextIds,
        type: entryType,
        isLocked: false,
      };
      await saveScheduleEntry(entry);

      const user = users.find((u) => u.id === userId);
      if (user && isManual) {
        const dayIdx = new Date(date).getDay();
        const weight = dayWeights[dayIdx] || 1.0;
        await userService.repayOwedDay(userId, dayIdx, weight);
        await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
      } else if (user) {
        await auditService.logAction('ASSIGN', `${user.name} на ${date}`);
      }
    },
    [users, dayWeights, schedule]
  );

  const removeAssignment = useCallback(
    async (date: string, reason: 'request' | 'work' = 'work', targetUserId?: number) => {
      const entry = schedule[date];
      if (!entry || !entry.userId) return;
      await removeAssignmentWithDebt(date, reason, dayWeights, targetUserId);
    },
    [schedule, dayWeights]
  );

  const bulkDelete = useCallback(async (dates: string[]) => {
    await bulkDeleteSchedule(dates);
    await auditService.logAction('BULK_DELETE', `Видалено ${dates.length} записів`);
  }, []);

  // ── Auto-scheduler & history hooks ──────────────────────────────────────
  const { fillGaps, recalculateFrom, generateWeekSchedule } = useAutoScheduler(
    users,
    schedule,
    dayWeights,
    dutiesPerDay,
    autoScheduleOptions,
    ignoreHistoryInLogic
  );

  const {
    pushHistory,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
  } = useScheduleHistory();

  // ── Assignment modal ────────────────────────────────────────────────────
  const {
    selectedCell,
    setSelectedCell,
    swapMode,
    setSwapMode,
    pendingAssignConfirm,
    setPendingAssignConfirm,
    executeAssign,
    handleAssign,
    handleSwap,
    handleRemove,
  } = useAssignmentModal({
    users,
    schedule,
    dayWeights,
    dutiesPerDay,
    historyMode,
    pushHistory,
    assignUser,
    removeAssignment,
    updateCascadeTrigger,
    logAction,
    refreshData,
  });

  // ── Week navigation ─────────────────────────────────────────────────────
  const { weekDates, todayStr, shiftWeek, jumpToWeek, goToToday, handleDatePick } =
    useWeekNavigation({ isModalOpen: !!selectedCell || !!pendingAssignConfirm });

  // ── Keyboard: Ctrl+Z / Ctrl+Y for undo/redo ────────────────────────────
  const scheduleRef = React.useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  useEffect(() => {
    const handleUndoRedo = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undoHistory(scheduleRef.current).then(() => refreshData());
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void redoHistory(scheduleRef.current).then(() => refreshData());
      }
    };
    window.addEventListener('keydown', handleUndoRedo);
    return () => window.removeEventListener('keydown', handleUndoRedo);
  }, [undoHistory, redoHistory, refreshData]);

  // ── Scheduled weeks map (for WeekNavigator dots) ────────────────────────
  const scheduledWeeksMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    Object.keys(schedule).forEach((dateStr) => {
      const d = new Date(dateStr);
      const year = getWeekYear(d);
      const week = getWeekNumber(d);
      if (!map.has(year)) map.set(year, new Set());
      map.get(year)!.add(week);
    });
    return map;
  }, [schedule]);

  // ── Schedule issues (conflicts & gaps) ──────────────────────────────────
  const scheduleIssues = useMemo(() => {
    const conflicts: string[] = [];
    const criticalConflicts: string[] = [];
    const gaps: string[] = [];
    const conflictByDate: Record<string, number[]> = {};
    const checkStart = weekDates[0];

    Object.entries(schedule).forEach(([date, entry]) => {
      if (date < checkStart) return;
      const ids = toAssignedUserIds(entry.userId);
      const conflictIds = ids.filter((id) => {
        const user = users.find((u) => u.id === id);
        if (!user) return !deletedUserIds.has(id);
        if (!isUserAvailable(user, date, schedule)) {
          const period = getStatusPeriodAtDate(user, date);
          if (period && (period.status === 'VACATION' || period.status === 'SICK' || period.status === 'TRIP')) {
            criticalConflicts.push(date);
          }
          return true;
        }
        return false;
      });
      if (conflictIds.length > 0) {
        conflicts.push(date);
        conflictByDate[date] = conflictIds;
      }
    });

    weekDates.forEach((d) => {
      if (getAssignedCount(schedule[d]) < dutiesPerDay) gaps.push(d);
    });

    return { conflicts, criticalConflicts, gaps, conflictByDate };
  }, [schedule, users, weekDates, dutiesPerDay, deletedUserIds]);

  // ── User queries ────────────────────────────────────────────────────────
  const daysSinceLastDuty = useCallback(
    (userId: number, refDate: string): number => {
      const previousDates = Object.values(schedule)
        .filter((s) => s.date < refDate && toAssignedUserIds(s.userId).includes(userId))
        .map((s) => s.date)
        .sort();
      if (previousDates.length === 0) return Number.POSITIVE_INFINITY;
      const last = previousDates[previousDates.length - 1];
      return Math.floor((new Date(refDate).getTime() - new Date(last).getTime()) / 86400000);
    },
    [schedule]
  );

  const getFreeUsers = useCallback(
    (dateStr: string, includeRestDay = false) => {
      const dayIndex = new Date(dateStr).getDay();
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));

      return users
        .filter((u) => {
          if (assignedOnDate.has(u.id!)) return false;
          return includeRestDay
            ? isUserAvailable(u, dateStr)
            : isUserAvailable(u, dateStr, schedule);
        })
        .sort((a, b) => {
          const oweA = (a.owedDays && a.owedDays[dayIndex]) || 0;
          const oweB = (b.owedDays && b.owedDays[dayIndex]) || 0;
          if (oweA !== oweB) return oweB - oweA;
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          if (loadA !== loadB) return loadA - loadB;
          if (a.debt !== b.debt) return a.debt - b.debt;
          return daysSinceLastDuty(b.id!, dateStr) - daysSinceLastDuty(a.id!, dateStr);
        });
    },
    [schedule, users, calculateEffectiveLoad, daysSinceLastDuty]
  );

  const getWeekAssignedUsers = useCallback(
    (dateStr: string) => {
      const assignedOnDate = new Set(toAssignedUserIds(schedule[dateStr]?.userId));
      const weekUserIds = new Set<number>();
      for (const wd of weekDates) {
        if (wd === dateStr) continue;
        const entry = schedule[wd];
        if (entry) toAssignedUserIds(entry.userId).forEach((id) => weekUserIds.add(id));
      }
      return users
        .filter(
          (u) =>
            u.id !== undefined && u.isActive && weekUserIds.has(u.id) && !assignedOnDate.has(u.id)
        )
        .sort((a, b) => {
          const loadA = calculateEffectiveLoad(a);
          const loadB = calculateEffectiveLoad(b);
          if (loadA !== loadB) return loadA - loadB;
          if (a.debt !== b.debt) return a.debt - b.debt;
          return daysSinceLastDuty(b.id!, dateStr) - daysSinceLastDuty(a.id!, dateStr);
        });
    },
    [schedule, users, weekDates, calculateEffectiveLoad, daysSinceLastDuty]
  );

  // ── Cascade recalc check ────────────────────────────────────────────────
  const shouldShowCascadeRecalc = useMemo(() => {
    if (!cascadeStartDate) return false;
    const start = cascadeStartDate < todayStr ? todayStr : cascadeStartDate;
    let improvableCount = 0;
    for (const [date, entry] of Object.entries(schedule)) {
      if (date < start || entry.type === 'manual') continue;
      const assignedIds = toAssignedUserIds(entry.userId);
      if (assignedIds.length === 0) continue;
      const freeUsers = getFreeUsers(date).filter((u) => !assignedIds.includes(u.id!));
      if (freeUsers.length === 0) continue;
      const hasImprovement = assignedIds.some((assignedId) => {
        const currentUser = users.find((u) => u.id === assignedId);
        if (!currentUser) return true;
        const currentLoad = calculateEffectiveLoad(currentUser);
        return freeUsers.some((u) => calculateEffectiveLoad(u) < currentLoad - 0.5);
      });
      if (hasImprovement && ++improvableCount >= 2) return true;
    }
    return false;
  }, [cascadeStartDate, schedule, todayStr, users, getFreeUsers, calculateEffectiveLoad]);

  // ── Toolbar actions ─────────────────────────────────────────────────────
  const {
    runFillGaps,
    runFixConflicts,
    runFullAutoSchedule,
    runClearWeek,
    runCascadeRecalc,
    runDismissCascade,
    runUndo,
    runRedo,
  } = useScheduleActions({
    users,
    schedule,
    dayWeights,
    weekDates,
    todayStr,
    dutiesPerDay,
    autoScheduleOptions,
    cascadeStartDate,
    scheduleIssues,
    pushHistory,
    fillGaps,
    recalculateFrom,
    generateWeekSchedule,
    removeAssignment,
    bulkDelete,
    updateCascadeTrigger,
    clearCascadeTrigger,
    logAction,
    refreshData,
    undoHistory,
    redoHistory,
  });

  // ── Keyboard: C/F/G quick actions on schedule screen ───────────────────
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const handleQuickActions = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (selectedCell || pendingAssignConfirm || showImportModal) return;

      const key = e.key.toLowerCase();
      if (key === 'c') {
        e.preventDefault();
        void runClearWeek();
      } else if (key === 'f') {
        e.preventDefault();
        void runFillGaps();
      } else if (key === 'g') {
        e.preventDefault();
        void runFullAutoSchedule();
      }
    };

    window.addEventListener('keydown', handleQuickActions);
    return () => window.removeEventListener('keydown', handleQuickActions);
  }, [
    selectedCell,
    pendingAssignConfirm,
    showImportModal,
    runClearWeek,
    runFillGaps,
    runFullAutoSchedule,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="schedule-view-wrapper">
      <div className="schedule-top-row no-print">
        <WeekNavigator
          currentDate={new Date()}
          activeDate={new Date(weekDates[0])}
          scheduledWeeksMap={scheduledWeeksMap}
          onJumpToWeek={jumpToWeek}
        />

        <ScheduleControls
          weekDates={weekDates}
          cascadeStartDate={cascadeStartDate}
          shouldShowCascade={shouldShowCascadeRecalc}
          conflictsCount={scheduleIssues.conflicts.length}
          criticalConflictsCount={scheduleIssues.criticalConflicts.length}
          onPrevWeek={() => shiftWeek(-1)}
          onNextWeek={() => shiftWeek(1)}
          onToday={goToToday}
          onDatePick={handleDatePick}
          onFillGaps={runFillGaps}
          onFixConflicts={runFixConflicts}
          onAutoSchedule={runFullAutoSchedule}
          onCascadeRecalc={runCascadeRecalc}
          onDismissCascade={runDismissCascade}
          onClearWeek={runClearWeek}
          onImportSchedule={() => setShowImportModal(true)}
          historyMode={historyMode}
          onToggleHistoryMode={() => setHistoryMode((v) => !v)}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={runUndo}
          onRedo={runRedo}
        />
      </div>

      {printMode !== 'status-list' && (
        <PrintHeader signatories={signatories} weekDates={weekDates} />
      )}

      <div className="schedule-table-scroll-area">
        <ScheduleTable
          users={users}
          weekDates={weekDates}
          schedule={schedule}
          todayStr={todayStr}
          dutiesPerDay={dutiesPerDay}
          historyMode={historyMode}
          deletedUserNames={deletedUserNames}
          onUserClick={handleStartEdit}
          onCellClick={(date, entry, assignedUserId) => {
            setPendingAssignConfirm(null);
            setSelectedCell({ date, entry, assignedUserId });
            setSwapMode('replace');
          }}
        />
      </div>

      {printMode === 'calendar' && (
        <PrintCalendar weekDates={weekDates} schedule={schedule} users={users} />
      )}

      {printMode === 'duty-table' && (
        <PrintDutyTable
          weekDates={weekDates}
          schedule={schedule}
          users={users}
          maxRowsPerPage={printMaxRows}
        />
      )}

      {printMode === 'status-list' && (
        <PrintStatusList
          users={users}
          schedule={schedule}
          weekDates={weekDates}
          signatories={signatories}
        />
      )}

      {printMode !== 'status-list' && <PrintFooter signatories={signatories} />}

      {selectedCell && (
        <AssignmentModal
          show={true}
          date={selectedCell.date}
          assignedUserId={selectedCell.assignedUserId}
          users={users}
          freeUsers={getFreeUsers(selectedCell.date, true)}
          swapUsers={getWeekAssignedUsers(selectedCell.date)}
          schedule={schedule}
          weekDates={weekDates}
          swapMode={swapMode}
          onSetSwapMode={setSwapMode}
          onAssign={(userId, penalize) => handleAssign(userId, penalize)}
          onSwap={handleSwap}
          onRemove={handleRemove}
          onClose={() => {
            setPendingAssignConfirm(null);
            setSelectedCell(null);
          }}
          isOnRestDay={(userId: number, dateStr: string) => {
            const prevDate = new Date(dateStr);
            prevDate.setDate(prevDate.getDate() - 1);
            const prevEntry = schedule[toLocalISO(prevDate)];
            return prevEntry ? toAssignedUserIds(prevEntry.userId).includes(userId) : false;
          }}
          calculateEffectiveLoad={calculateEffectiveLoad}
          daysSinceLastDuty={daysSinceLastDuty}
          hasEntry={!!selectedCell.entry}
          historyMode={historyMode}
        />
      )}

      <ImportScheduleModal
        show={showImportModal}
        users={users}
        onClose={() => setShowImportModal(false)}
        onImported={async (result) => {
          await logAction('IMPORT_SCHEDULE', `Імпортовано ${result.imported} днів старого графіка`);
          await refreshData();
        }}
      />

      <ConfirmAssignModal
        show={!!pendingAssignConfirm && !!selectedCell}
        pending={pendingAssignConfirm}
        targetDate={selectedCell?.date || ''}
        users={users}
        onConfirm={(userId) => executeAssign(userId, pendingAssignConfirm?.penalizeReplaced)}
        onClose={() => setPendingAssignConfirm(null)}
      />

      {editingUser && !pendingEditReview && (
        <EditUserModal
          user={editingUser}
          onChange={setEditingUser}
          onClose={handleCloseEditModal}
          computedFairnessDate={(() => {
            const dates = Object.keys(schedule).sort();
            return dates[0] || toLocalISO(new Date());
          })()}
          firstDutyDate={editingUser.id ? getFirstDutyDate(schedule, editingUser.id) : undefined}
          allUsers={users}
        />
      )}

      {pendingEditReview && (
        <UserChangesReviewModal
          show={true}
          userName={pendingEditReview.draft.name}
          changes={pendingEditReview.changes}
          isApplying={isApplyingEdit}
          onApply={() => void handleApplyEditChanges()}
          onDiscard={handleDiscardEditChanges}
          onCancel={handleCancelEditReview}
        />
      )}
    </div>
  );
};

export default ScheduleView;
