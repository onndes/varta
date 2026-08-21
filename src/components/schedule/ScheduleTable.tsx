import React, { useState, useMemo } from 'react';
import type { User, ScheduleEntry } from '../../types';
import type { DeletedUserInfo } from '../../services/userService';
import type { DragDropHandlers } from '../../hooks/useScheduleDragDrop';
import { getUserAvailabilityStatus } from '../../services/userService';
import ScheduleTableRow from './ScheduleTableRow';
import { toAssignedUserIds, isAssignedInEntry } from '../../utils/assignment';
import {
  compareByRankAndName,
  sortUsersBy,
  formatRank,
  type SortKey,
  type SortDir,
} from '../../utils/helpers';
import { CompactScheduleView } from './CompactScheduleView';
import { ScheduleTableHeader } from './ScheduleTableHeader';
import type { HelperDecorations } from './helperDecorations';
import { computeWorkload } from '../../utils/workload';
import { applyStatsCutoffs, getStatsCutoff } from '../../utils/statsReset';
import {
  countEligibleUsersForWeek,
  MIN_USERS_FOR_WEEKLY_LIMIT,
} from '../../services/autoScheduler/helpers';
import { getWeeklyDutyTarget } from '../../utils/staffDuty';

// ─── Types ────────────────────────────────────────────────────────────────────

type RowFilter = 'all' | 'available' | 'assigned';

interface ScheduleTableProps {
  users: User[];
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  dutiesPerDay: number;
  /** Опція «не більше 1 чергування на тиждень» (м'яке підсвічування, без блокування). */
  weeklyCapEnabled?: boolean;
  rowFilter: RowFilter;
  historyMode?: boolean;
  deletedUserNames?: Record<number, DeletedUserInfo>;
  onUserClick?: (user: User) => void;
  forceAssignMode?: boolean;
  helperDecorations?: HelperDecorations;
  dowHistoryWeeks?: number;
  dowHistoryMode?: 'numbers' | 'dots';
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
  onQuickAssignClick: (date: string, user: User) => void;
  dragDropHandlers?: DragDropHandlers;
  previewSchedule?: Record<string, ScheduleEntry>;
}

// ─── Deleted-user row (historical display) ────────────────────────────────────

type HistoricalReason = 'deleted' | 'inactive' | 'off-roster' | 'hidden';

const HISTORICAL_BADGE: Record<HistoricalReason, { label: string; icon: string; title: string }> = {
  deleted: { label: 'ВИДАЛЕНИЙ', icon: 'fas fa-user-slash', title: 'Видалений зі списку' },
  inactive: { label: 'ВИМКНЕНИЙ', icon: 'fas fa-user-minus', title: 'Тимчасово поза чергою' },
  'off-roster': {
    label: 'ПОЗА СКЛАДОМ',
    icon: 'fas fa-user-xmark',
    title: 'Виведений зі складу чергових',
  },
  hidden: {
    label: 'НЕ ВРАХОВУЄТЬСЯ',
    icon: 'fas fa-eye-slash',
    title: 'Період прихований обнуленням статистики — наряди лише як історія',
  },
};

const DeletedUserRow: React.FC<{
  deletedId: number;
  info: DeletedUserInfo;
  reason?: HistoricalReason;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
}> = ({ deletedId, info, reason = 'deleted', weekDates, schedule }) => {
  const badge = HISTORICAL_BADGE[reason];
  const nameParts = info.name.trim().split(/\s+/);
  return (
    <tr className="user-row-inactive" style={{ opacity: 0.6 }}>
      <td></td>
      <td className="text-start col-user-screen" style={{ minWidth: '70px', paddingRight: 0 }}>
        <small
          className="text-muted text-uppercase"
          style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
        >
          {formatRank(info.rank)}
        </small>
      </td>
      <td className="text-start px-2 col-user-screen">
        <div
          className="fw-bold text-uppercase text-muted"
          style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
        >
          {nameParts[0]}
        </div>
        {nameParts.length > 1 && (
          <div
            className="text-muted"
            style={{ fontSize: '0.73rem', opacity: 0.5, lineHeight: 1.2 }}
          >
            {nameParts.slice(1).join(' ')}
          </div>
        )}
        <span
          className="badge bg-secondary text-white"
          style={{ fontSize: '0.55rem' }}
          title={badge.title}
        >
          <i className={`${badge.icon} me-1`} style={{ fontSize: '0.5rem' }}></i>
          {badge.label}
        </span>
      </td>
      <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
        {info.rank}
      </td>
      <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
        {info.name}
      </td>
      {weekDates.map((date) => {
        const ids = toAssignedUserIds(schedule[date]?.userId);
        const isAssigned = ids.includes(deletedId);
        return (
          <td key={date} className={`compact-cell${isAssigned ? ' past-locked' : ''}`}>
            <span className="no-print">{isAssigned ? 'НАРЯД' : ''}</span>
            <span className="print-only">{isAssigned ? '08:00' : ''}</span>
          </td>
        );
      })}
    </tr>
  );
};

/**
 * Schedule Table Component
 * Main weekly schedule table
 */
const ScheduleTable: React.FC<ScheduleTableProps> = ({
  users,
  weekDates,
  schedule,
  todayStr,
  dutiesPerDay,
  weeklyCapEnabled = false,
  rowFilter,
  historyMode = false,
  deletedUserNames = {},
  onUserClick,
  forceAssignMode = false,
  helperDecorations,
  dowHistoryWeeks = 4,
  dowHistoryMode = 'numbers',
  onCellClick,
  onQuickAssignClick,
  dragDropHandlers,
  previewSchedule,
}) => {
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  // Розклад для цифр: без нарядів, прихованих обнуленням статистики.
  const statsSchedule = useMemo(() => applyStatsCutoffs(schedule, users), [schedule, users]);
  // Іменами мають резолвитись усі — включно з вимкненими та виведеними зі складу,
  // інакше їхні минулі наряди перетворюються на порожні клітинки.
  const usersById = Object.fromEntries(users.map((u) => [u.id!, u]));

  // Hooks must be called unconditionally before any early return
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };

  /**
   * Бійці, у яких увесь показаний тиждень потрапляє в прихований період:
   * для цих дат їх «ніби не було» — звичайний рядок не малюємо.
   */
  const hiddenUserIds = useMemo(() => {
    const ids = new Set<number>();
    if (weekDates.length === 0) return ids;
    for (const u of activeUsers) {
      const cutoff = getStatsCutoff(u);
      if (cutoff && weekDates.every((d) => d < cutoff)) ids.add(u.id!);
    }
    return ids;
  }, [activeUsers, weekDates]);

  const displayUsers = useMemo(() => {
    let base = sortKey
      ? sortUsersBy(activeUsers, sortKey, sortDir)
      : [...activeUsers].sort(compareByRankAndName);
    if (rowFilter === 'available') {
      base = base.filter((u) =>
        weekDates.some((d) => getUserAvailabilityStatus(u, d) === 'AVAILABLE')
      );
    } else if (rowFilter === 'assigned') {
      base = base.filter((u) => weekDates.some((d) => isAssignedInEntry(schedule[d], u.id!)));
    }
    return base.filter((u) => !hiddenUserIds.has(u.id!));
  }, [activeUsers, sortKey, sortDir, rowFilter, weekDates, schedule, hiddenUserIds]);

  // Навантаження: наряди / реально доступні дні, з накопиченням до кожної дати тижня
  const workload = useMemo(
    () => computeWorkload(activeUsers, statsSchedule, weekDates),
    [activeUsers, statsSchedule, weekDates]
  );

  // Хто вже відчергував цього тижня — рядок підсвічуємо як «квоту вичерпано».
  // Умова дзеркалить планувальник: ліміт діє лише коли на тиждень доступно 7+ осіб.
  const weekDutyCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const u of activeUsers) {
      counts.set(u.id!, weekDates.filter((d) => isAssignedInEntry(schedule[d], u.id!)).length);
    }
    return counts;
  }, [activeUsers, weekDates, schedule]);

  const weekCapReachedIds = useMemo(() => {
    if (!weeklyCapEnabled || weekDates.length === 0) return null;
    if (countEligibleUsersForWeek(users, schedule, weekDates[0]) < MIN_USERS_FOR_WEEKLY_LIMIT) {
      return null;
    }
    const reached = new Set<number>();
    for (const u of activeUsers) {
      // Норма у штатного чергового своя (2–4), у решти — 1.
      if ((weekDutyCounts.get(u.id!) ?? 0) >= getWeeklyDutyTarget(u)) reached.add(u.id!);
    }
    return reached;
  }, [weeklyCapEnabled, weekDates, users, schedule, activeUsers, weekDutyCounts]);

  /**
   * Бійці, яких немає в таблиці (вимкнені / виведені зі складу), але які цього
   * тижня чергували. Показуємо окремими рядками, щоб історія не мала «дірок».
   */
  const historicalUsersInWeek = useMemo(() => {
    const shownIds = new Set(displayUsers.map((u) => u.id!));
    const found = new Map<number, { info: DeletedUserInfo; reason: HistoricalReason }>();
    for (const date of weekDates) {
      for (const id of toAssignedUserIds(schedule[date]?.userId)) {
        if (shownIds.has(id) || found.has(id)) continue;
        const u = usersById[id];
        if (!u) continue; // видалені — окремим списком нижче
        if (!hiddenUserIds.has(id) && u.isActive) continue; // сховані фільтром рядків
        found.set(id, {
          info: { name: u.name, rank: u.rank },
          reason: hiddenUserIds.has(id)
            ? 'hidden'
            : u.isDutyMember === false
              ? 'off-roster'
              : 'inactive',
        });
      }
    }
    return found;
  }, [weekDates, schedule, displayUsers, usersById, hiddenUserIds]);

  const deletedUsersInWeek = useMemo(() => {
    const found = new Map<number, DeletedUserInfo>();
    for (const date of weekDates) {
      const entry = schedule[date];
      if (!entry?.userId) continue;
      const ids = toAssignedUserIds(entry.userId);
      for (const id of ids) {
        if (!usersById[id] && deletedUserNames[id]) {
          found.set(id, deletedUserNames[id]);
        }
      }
    }
    return found;
  }, [weekDates, schedule, usersById, deletedUserNames]);

  // ── Day-centric compact view for large teams (> 20) ──────────────────
  if (activeUsers.length > 20) {
    return (
      <CompactScheduleView
        weekDates={weekDates}
        schedule={schedule}
        todayStr={todayStr}
        dutiesPerDay={dutiesPerDay}
        historyMode={historyMode}
        deletedUserNames={deletedUserNames}
        usersById={usersById}
        onCellClick={onCellClick}
      />
    );
  }

  // ── Standard user-row view for small teams (≤ 20) ────────────────────
  return (
    <div className="view-table">
      <div className="card shadow-sm border-0">
        <table
          className="compact-table"
          onDragOver={
            dragDropHandlers
              ? (e) => {
                  // Fallback preventDefault for elements without their own onDragOver
                  // (e.g. header <th> cells). Without this WebView2 (Windows) resets
                  // the drag gesture when the pointer passes over non-droppable children.
                  if (dragDropHandlers.dragState) e.preventDefault();
                }
              : undefined
          }
        >
          <ScheduleTableHeader
            weekDates={weekDates}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            onDateClick={(date) => onCellClick(date, null, undefined)}
          />
          <tbody>
            {displayUsers.length === 0 ? (
              <tr>
                <td colSpan={3 + weekDates.length} className="text-center text-muted py-4 no-print">
                  <i className="fas fa-users me-2"></i>Немає бійців у складі
                </td>
              </tr>
            ) : (
              displayUsers.map((user, idx) => (
                <ScheduleTableRow
                  key={user.id}
                  user={user}
                  index={idx}
                  weekDates={weekDates}
                  schedule={schedule}
                  allUsers={users}
                  todayStr={todayStr}
                  historyMode={historyMode}
                  dowHistoryWeeks={dowHistoryWeeks}
                  dowHistoryMode={dowHistoryMode}
                  forceAssignMode={forceAssignMode}
                  helperDecorations={helperDecorations}
                  onUserClick={onUserClick}
                  onCellClick={onCellClick}
                  onQuickAssignClick={onQuickAssignClick}
                  dragDropHandlers={dragDropHandlers}
                  previewSchedule={previewSchedule}
                  workload={workload.byUser.get(user.id!)}
                  weekCapReached={!!weekCapReachedIds?.has(user.id!)}
                  weekDutyCount={weekDutyCounts.get(user.id!) ?? 0}
                  statsSchedule={statsSchedule}
                />
              ))
            )}
            {[...historicalUsersInWeek.entries()].map(([userId, { info, reason }]) => (
              <DeletedUserRow
                key={`historical-${userId}`}
                deletedId={userId}
                info={info}
                reason={reason}
                weekDates={weekDates}
                schedule={schedule}
              />
            ))}
            {[...deletedUsersInWeek.entries()].map(([deletedId, info]) => (
              <DeletedUserRow
                key={`deleted-${deletedId}`}
                deletedId={deletedId}
                info={info}
                weekDates={weekDates}
                schedule={schedule}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduleTable;
