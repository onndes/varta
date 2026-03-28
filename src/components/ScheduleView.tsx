import React, { useState, useEffect } from 'react';
import type {
  User,
  ScheduleEntry,
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  PrintMode,
  PrintWeekRange,
} from '../types';
import * as userService from '../services/userService';
import type { DeletedUserInfo } from '../services/userService';
import { useAutoScheduler } from '../hooks';
import { useScheduleHistory } from '../hooks/useScheduleHistory';
import { useWeekNavigation } from '../hooks/useWeekNavigation';
import { useScheduleActions } from '../hooks/useScheduleActions';
import { useAssignmentModal } from '../hooks/useAssignmentModal';
import { useUserEditFlow } from '../hooks/useUserEditFlow';
import { useScheduleIssues } from '../hooks/useScheduleIssues';
import { useAssignAndRemove } from '../hooks/useAssignAndRemove';
import { useScheduleUserQueries } from '../hooks/useScheduleUserQueries';
import { useScheduleKeyboard } from '../hooks/useScheduleKeyboard';
import { useScheduleDragDrop } from '../hooks/useScheduleDragDrop';
import ScheduleBody from './schedule/ScheduleBody';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ScheduleViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  onWeekDatesChange?: (weekDates: string[]) => void;
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
  printWeekRange: PrintWeekRange | null;
  printMaxRows: number;
  printDutyTableShowAllUsers: boolean;
  ignoreHistoryInLogic: boolean;
  dowHistoryWeeks: number;
  dowHistoryMode: 'numbers' | 'dots';
  violationsCount?: number;
  onPrint?: (mode: PrintMode) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const ScheduleView: React.FC<ScheduleViewProps> = ({
  users,
  schedule,
  onWeekDatesChange,
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
  printWeekRange,
  printMaxRows,
  printDutyTableShowAllUsers,
  ignoreHistoryInLogic,
  dowHistoryWeeks,
  dowHistoryMode,
  violationsCount = 0,
  onPrint,
}) => {
  // ── Deleted users (historical display) ──────────────────────────────────
  const [deletedUserNames, setDeletedUserNames] = useState<Record<number, DeletedUserInfo>>({});
  useEffect(() => {
    userService.getDeletedUserNames().then(setDeletedUserNames);
  }, [users]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [forceAssignMode, setForceAssignMode] = useState(false);
  // ── User edit flow ───────────────────────────────────────────────────────
  const {
    editingUser,
    setEditingUser,
    pendingEditReview,
    isApplyingEdit,
    handleStartEdit,
    handleCloseEditModal,
    handleCancelEditReview,
    handleDiscardEditChanges,
    handleApplyEditChanges,
  } = useUserEditFlow({ schedule, updateCascadeTrigger, refreshData, logAction });

  // ── Core schedule mutations ───────────────────────────────────────────────
  const { assignUser, removeAssignment, bulkDelete } = useAssignAndRemove({
    users,
    dayWeights,
    schedule,
  });

  // ── Auto-scheduler & history ──────────────────────────────────────────────
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
    forceAssignMode,
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

  useEffect(() => {
    onWeekDatesChange?.(weekDates);
  }, [onWeekDatesChange, weekDates]);

  // ── Schedule issues (conflicts & gaps) ───────────────────────────────────
  const scheduleIssues = useScheduleIssues({
    schedule,
    users,
    weekDates,
    dutiesPerDay,
    deletedUserNames,
  });

  // ── User/load queries + cascade check ────────────────────────────────────
  const {
    calculateEffectiveLoad,
    daysSinceLastDuty,
    getFreeUsers,
    getWeekAssignedUsers,
    shouldShowCascadeRecalc,
    scheduledWeeksMap,
  } = useScheduleUserQueries({
    users,
    schedule,
    weekDates,
    dayWeights,
    ignoreHistoryInLogic,
    cascadeStartDate,
    todayStr,
  });

  // ── Toolbar actions ───────────────────────────────────────────────────────
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

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const dragDropHandlers = useScheduleDragDrop({
    schedule,
    users,
    dayWeights,
    todayStr,
    historyMode,
    forceAssignMode,
    assignUser,
    removeAssignment,
    pushHistory,
    logAction,
    refreshData,
    updateCascadeTrigger,
    autoScheduleOptions,
    dutiesPerDay,
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useScheduleKeyboard({
    schedule,
    selectedCell,
    pendingAssignConfirm,
    showImportModal,
    undoHistory,
    redoHistory,
    refreshData,
    runClearWeek,
    runFillGaps,
    runFullAutoSchedule,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScheduleBody
      weekDates={weekDates}
      todayStr={todayStr}
      scheduledWeeksMap={scheduledWeeksMap}
      shiftWeek={shiftWeek}
      jumpToWeek={jumpToWeek}
      goToToday={goToToday}
      handleDatePick={handleDatePick}
      scheduleIssues={scheduleIssues}
      shouldShowCascadeRecalc={shouldShowCascadeRecalc}
      cascadeStartDate={cascadeStartDate}
      historyMode={historyMode}
      setHistoryMode={setHistoryMode}
      forceAssignMode={forceAssignMode}
      onToggleForceAssignMode={() => setForceAssignMode((v) => !v)}
      showImportModal={showImportModal}
      setShowImportModal={setShowImportModal}
      canUndo={canUndo}
      canRedo={canRedo}
      undoLabel={undoLabel}
      redoLabel={redoLabel}
      runFillGaps={runFillGaps}
      runFixConflicts={runFixConflicts}
      runFullAutoSchedule={runFullAutoSchedule}
      runClearWeek={runClearWeek}
      runCascadeRecalc={runCascadeRecalc}
      runDismissCascade={runDismissCascade}
      runUndo={runUndo}
      runRedo={runRedo}
      users={users}
      schedule={schedule}
      dutiesPerDay={dutiesPerDay}
      deletedUserNames={deletedUserNames}
      handleStartEdit={handleStartEdit}
      selectedCell={selectedCell}
      setSelectedCell={setSelectedCell}
      swapMode={swapMode}
      setSwapMode={setSwapMode}
      pendingAssignConfirm={pendingAssignConfirm}
      setPendingAssignConfirm={setPendingAssignConfirm}
      executeAssign={(userId, penalize, isForced) =>
        void executeAssign(userId, penalize, undefined, isForced)
      }
      handleAssign={handleAssign}
      handleSwap={handleSwap}
      handleRemove={handleRemove}
      getFreeUsers={getFreeUsers}
      getWeekAssignedUsers={getWeekAssignedUsers}
      daysSinceLastDuty={daysSinceLastDuty}
      calculateEffectiveLoad={calculateEffectiveLoad}
      logAction={logAction}
      refreshData={refreshData}
      editingUser={editingUser}
      pendingEditReview={pendingEditReview}
      isApplyingEdit={isApplyingEdit}
      setEditingUser={setEditingUser}
      handleCloseEditModal={handleCloseEditModal}
      handleApplyEditChanges={handleApplyEditChanges}
      handleDiscardEditChanges={handleDiscardEditChanges}
      handleCancelEditReview={handleCancelEditReview}
      signatories={signatories}
      printMode={printMode}
      printWeekRange={printWeekRange}
      printMaxRows={printMaxRows}
      printDutyTableShowAllUsers={printDutyTableShowAllUsers}
      dowHistoryWeeks={dowHistoryWeeks}
      dowHistoryMode={dowHistoryMode}
      violationsCount={violationsCount}
      onPrint={onPrint}
      dragDropHandlers={dragDropHandlers}
    />
  );
};

export default ScheduleView;
