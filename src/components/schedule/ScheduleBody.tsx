// src/components/schedule/ScheduleBody.tsx

import React, { useState } from 'react';
import type { User, ScheduleEntry, Signatories, PrintMode, PrintWeekRange } from '../../types';
import type { DeletedUserInfo } from '../../services/userService';
import type { ScheduleModalsProps } from './ScheduleModals';
import type { DragDropHandlers } from '../../hooks/useScheduleDragDrop';
import { getWeekRangeDates } from '../../utils/dateUtils';
import WeekNavigator from './WeekNavigator';
import ScheduleControls from './ScheduleControls';
import PrintHeader from './PrintHeader';
import PrintFooter from '../PrintFooter';
import ScheduleTable from './ScheduleTable';
import PrintCalendar from './PrintCalendar';
import PrintDutyTable from './PrintDutyTable';
import PrintWeekCalendarTable from './PrintWeekCalendarTable';
import PrintStatusList from './PrintStatusList';
import ScheduleModals from './ScheduleModals';

// ─── Local cell type, matching the shape used in useAssignmentModal ──────────

interface SelectedCell {
  date: string;
  entry: ScheduleEntry | null;
  assignedUserId?: number;
}

// ─── Props (extends ScheduleModalsProps with visual-content additions) ───────

export interface ScheduleBodyProps extends Omit<ScheduleModalsProps, 'handleAssign'> {
  /** Full 3-arg handleAssign so onQuickAssignClick can pass an explicit targetCell. */
  handleAssign: (
    userId: number | undefined,
    penalize?: boolean,
    targetCell?: SelectedCell | null
  ) => Promise<void>;
  // Week view
  todayStr: string;
  scheduledWeeksMap: Map<number, Set<number>>;
  shiftWeek: (n: number) => void;
  jumpToWeek: (weekNumber: number, year?: number) => void;
  goToToday: () => void;
  handleDatePick: (date: string) => void;
  // Issues + cascade
  scheduleIssues: {
    conflicts: string[];
    criticalConflicts: string[];
    gaps: string[];
    conflictByDate: Record<string, number[]>;
  };
  shouldShowCascadeRecalc: boolean;
  cascadeStartDate: string | null;
  // Table data
  dutiesPerDay: number;
  deletedUserNames: Record<number, DeletedUserInfo>;
  handleStartEdit: (user: User) => void;
  // Toolbar
  setHistoryMode: React.Dispatch<React.SetStateAction<boolean>>;
  forceAssignMode: boolean;
  onToggleForceAssignMode: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  // Toolbar actions
  runFillGaps: () => Promise<void>;
  runFixConflicts: () => Promise<void>;
  runFullAutoSchedule: () => Promise<void>;
  runClearWeek: () => Promise<void>;
  runCascadeRecalc: () => Promise<void>;
  runDismissCascade: () => Promise<void>;
  runUndo: () => Promise<void>;
  runRedo: () => Promise<void>;
  // Print
  signatories: Signatories;
  printMode: PrintMode;
  printMaxRows: number;
  printDutyTableShowAllUsers: boolean;
  printWeekRange: PrintWeekRange | null;
  dowHistoryWeeks: number;
  dowHistoryMode: 'numbers' | 'dots';
  dragDropHandlers?: DragDropHandlers;
  violationsCount?: number;
  onPrint?: (mode: PrintMode) => void;
  zenMode?: boolean;
  onZenToggle?: () => void;
  previewMode?: boolean;
  isPreviewComputing?: boolean;
  isPreviewPrefetching?: boolean;
  previewSchedule?: Record<string, ScheduleEntry>;
  onPreviewToggle?: () => void;
}

/**
 * Renders the full schedule view body: navigation bar, table, print modes,
 * and all overlay modals. Extracted from ScheduleView to keep it under 300 lines.
 */
const ScheduleBody: React.FC<ScheduleBodyProps> = ({
  // Week navigation
  weekDates,
  todayStr,
  scheduledWeeksMap,
  shiftWeek,
  jumpToWeek,
  goToToday,
  handleDatePick,
  // Toolbar state / actions
  historyMode,
  setHistoryMode,
  forceAssignMode,
  onToggleForceAssignMode,
  showImportModal,
  setShowImportModal,
  cascadeStartDate,
  shouldShowCascadeRecalc,
  scheduleIssues,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  runFillGaps,
  runFixConflicts,
  runFullAutoSchedule,
  runClearWeek,
  runCascadeRecalc,
  runDismissCascade,
  runUndo,
  runRedo,
  // Table data
  users,
  schedule,
  dutiesPerDay,
  deletedUserNames,
  handleStartEdit,
  selectedCell,
  setSelectedCell,
  swapMode,
  setSwapMode,
  pendingAssignConfirm,
  setPendingAssignConfirm,
  handleAssign,
  // Print
  signatories,
  printMode,
  printMaxRows,
  printDutyTableShowAllUsers,
  printWeekRange,
  dowHistoryWeeks,
  dowHistoryMode,
  dragDropHandlers,
  violationsCount = 0,
  onPrint,
  zenMode = false,
  onZenToggle,
  previewMode = false,
  isPreviewComputing = false,
  isPreviewPrefetching = false,
  previewSchedule,
  onPreviewToggle,
  // Modal passthrough
  executeAssign,
  handleSwap,
  handleRemove,
  getFreeUsers,
  getWeekAssignedUsers,
  daysSinceLastDuty,
  calculateEffectiveLoad,
  logAction,
  refreshData,
  editingUser,
  setEditingUser,
  pendingEditReview,
  isApplyingEdit,
  handleCloseEditModal,
  handleApplyEditChanges,
  handleDiscardEditChanges,
  handleCancelEditReview,
}) => {
  const [rowFilter, setRowFilter] = useState<'all' | 'available' | 'assigned'>('all');
  const showRowFilters = users.filter((user) => user.isActive).length <= 20;

  const printHeaderDates =
    printMode === 'week-calendar-table' && printWeekRange
      ? getWeekRangeDates(
          printWeekRange.year,
          printWeekRange.fromWeek,
          printWeekRange.toWeek
        ).flat()
      : weekDates;

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
          rowFilter={rowFilter}
          showRowFilters={showRowFilters}
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
          forceAssignMode={forceAssignMode}
          onToggleForceAssignMode={onToggleForceAssignMode}
          onToggleRowFilter={(filter) => setRowFilter((prev) => (prev === filter ? 'all' : filter))}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={runUndo}
          onRedo={runRedo}
          violationsCount={violationsCount}
          onPrint={onPrint}
          zenMode={zenMode}
          onZenToggle={onZenToggle}
          previewMode={previewMode}
          isPreviewComputing={isPreviewComputing}
          isPreviewPrefetching={isPreviewPrefetching}
          onPreviewToggle={onPreviewToggle}
        />
      </div>

      {printMode !== 'status-list' && printMode !== 'week-calendar-table' && (
        <PrintHeader signatories={signatories} weekDates={printHeaderDates} />
      )}

      <div className="schedule-table-scroll-area">
        <ScheduleTable
          users={users}
          weekDates={weekDates}
          schedule={schedule}
          todayStr={todayStr}
          dutiesPerDay={dutiesPerDay}
          rowFilter={rowFilter}
          historyMode={historyMode}
          deletedUserNames={deletedUserNames}
          forceAssignMode={forceAssignMode}
          onUserClick={handleStartEdit}
          dowHistoryWeeks={dowHistoryWeeks}
          dowHistoryMode={dowHistoryMode}
          dragDropHandlers={dragDropHandlers}
          previewSchedule={previewSchedule}
          onCellClick={(date, entry, assignedUserId) => {
            setPendingAssignConfirm(null);
            setSelectedCell({ date, entry, assignedUserId });
            setSwapMode('replace');
          }}
          onQuickAssignClick={(date, user) => {
            setPendingAssignConfirm(null);
            setSwapMode('replace');
            const targetCell = { date, entry: null, assignedUserId: undefined };
            setSelectedCell(targetCell);
            void handleAssign(user.id, false, targetCell);
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
          showAllUsers={printDutyTableShowAllUsers}
          footer={
            signatories.showCreatorFooter !== false ? (
              <PrintFooter signatories={signatories} />
            ) : null
          }
        />
      )}
      {printMode === 'week-calendar-table' && printWeekRange && (
        <PrintWeekCalendarTable users={users} schedule={schedule} range={printWeekRange} />
      )}
      {printMode === 'status-list' && (
        <PrintStatusList
          users={users}
          schedule={schedule}
          weekDates={weekDates}
          signatories={signatories}
        />
      )}
      {printMode !== 'status-list' &&
        printMode !== 'week-calendar-table' &&
        printMode !== 'duty-table' && <PrintFooter signatories={signatories} />}

      <ScheduleModals
        selectedCell={selectedCell}
        setSelectedCell={setSelectedCell}
        swapMode={swapMode}
        setSwapMode={setSwapMode}
        pendingAssignConfirm={pendingAssignConfirm}
        setPendingAssignConfirm={setPendingAssignConfirm}
        executeAssign={(userId, penalize, isForced) =>
          void executeAssign(userId, penalize, isForced)
        }
        handleAssign={(userId, penalize) => handleAssign(userId, penalize)}
        handleSwap={handleSwap}
        handleRemove={handleRemove}
        users={users}
        schedule={schedule}
        weekDates={weekDates}
        historyMode={historyMode}
        getFreeUsers={getFreeUsers}
        getWeekAssignedUsers={getWeekAssignedUsers}
        daysSinceLastDuty={daysSinceLastDuty}
        calculateEffectiveLoad={calculateEffectiveLoad}
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
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
      />
    </div>
  );
};

export default ScheduleBody;
