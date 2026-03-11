import React, { useState, useEffect } from 'react';
import type {
  User,
  ScheduleEntry,
  DayWeights,
  Signatories,
  AutoScheduleOptions,
  PrintMode,
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
import ScheduleBody from './schedule/ScheduleBody';
import { DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';

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

  // ── UI state ────────────────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);

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
      executeAssign={executeAssign}
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
      printMaxRows={printMaxRows}
    />
  );
};

export default ScheduleView;
