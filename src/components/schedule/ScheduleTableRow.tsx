import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import type { User, ScheduleEntry, DecisionLog } from '../../types';
import type { DragDropHandlers } from '../../hooks/useScheduleDragDrop';
import { formatRank, formatNameForPrint } from '../../utils/helpers';
import { STATUSES } from '../../utils/constants';
import { getUserAvailabilityStatus } from '../../services/userService';
import { isAssignedInEntry } from '../../utils/assignment';
import { getStatusPeriodAtDate } from '../../utils/userStatus';
import { toLocalISO } from '../../utils/dateUtils';
import Modal from '../Modal';
import { buildStaticLog } from './scheduleTableUtils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AvailabilityStatus = ReturnType<typeof getUserAvailabilityStatus>;

/** Map availability status to display text for unavailable cells */
const getUnavailableContent = (
  status: AvailabilityStatus,
  user: User,
  date: string
): React.ReactNode => {
  switch (status) {
    case 'STATUS_BUSY': {
      const period = getStatusPeriodAtDate(user, date);
      return period ? STATUSES[period.status] || period.status : 'ЗАЙНЯТИЙ';
    }
    case 'REST_DAY':
    case 'PRE_STATUS_DAY':
      return 'ЗВІЛЬН. ВІД ЧЕРГ.';
    case 'DAY_BLOCKED':
      return 'ЗАБЛОКОВАНО';
    case 'BIRTHDAY':
      return <span title="День народження">🎂 ДЕНЬ НАРОДЖ.</span>;
    default:
      return '—';
  }
};

/** Get the entry type icon class */
const getEntryIcon = (entry: ScheduleEntry): string => {
  if (entry.isLocked) return 'bi bi-lock-fill';
  switch (entry.type) {
    case 'import':
      return 'bi bi-box-arrow-in-down';
    case 'history':
      return 'bi bi-clock-history';
    case 'replace':
      return 'bi bi-arrow-repeat';
    case 'swap':
      return 'bi bi-arrow-left-right';
    case 'manual':
      return 'bi bi-hand-index-thumb';
    case 'auto':
      return 'bi bi-gear-fill';
    default:
      return '';
  }
};

/** Compute which past weeks (1..depth) had the same DOW assignment */
const getDowWeeksAgo = (
  date: string,
  userId: number,
  schedule: Record<string, ScheduleEntry>,
  depth: number
): number[] => {
  const result: number[] = [];
  for (let w = 1; w <= depth; w++) {
    const past = new Date(date);
    past.setDate(past.getDate() - w * 7);
    if (isAssignedInEntry(schedule[toLocalISO(past)], userId)) {
      result.push(w);
    }
  }
  return result;
};

interface ScheduleTableRowProps {
  user: User;
  index: number;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  historyMode?: boolean;
  dowHistoryWeeks?: number;
  dowHistoryMode?: 'numbers' | 'dots';
  onUserClick?: (user: User) => void;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
  onQuickAssignClick: (date: string, user: User) => void;
  forceAssignMode?: boolean;
  dragDropHandlers?: DragDropHandlers;
}

/**
 * Single row in schedule table representing one user
 */
const ScheduleTableRow: React.FC<ScheduleTableRowProps> = ({
  user,
  index,
  weekDates,
  schedule,
  todayStr,
  historyMode = false,
  dowHistoryWeeks = 4,
  dowHistoryMode = 'numbers',
  onUserClick,
  onCellClick,
  onQuickAssignClick,
  forceAssignMode = false,
  dragDropHandlers,
}) => {
  const [activeLog, setActiveLog] = useState<DecisionLog | null>(null);

  // Split name: surname (CAPS) + first/middle (dimmer)
  const nameParts = user.name.trim().split(/\s+/);
  const nameRest = nameParts.slice(1).join(' ');

  return (
    <>
      <tr className={!user.isActive ? 'user-row-inactive' : ''}>
        <td>{index + 1}</td>
        <td
          className="text-start col-user-screen"
          style={{
            width: '96px',
            minWidth: '96px',
            maxWidth: '96px',
            paddingRight: 0,
            whiteSpace: 'nowrap',
            cursor: onUserClick ? 'pointer' : 'default',
          }}
          onClick={() => onUserClick?.(user)}
        >
          <small
            className="text-muted text-uppercase"
            style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
          >
            {formatRank(user.rank)}
          </small>
        </td>
        <td
          className="text-start px-2 col-user-screen"
          style={{ cursor: onUserClick ? 'pointer' : 'default' }}
          onClick={() => onUserClick?.(user)}
        >
          <div
            className="fw-bold text-uppercase"
            style={{ fontSize: '0.8rem', letterSpacing: '0.02em', lineHeight: 1.2 }}
          >
            {nameParts[0]}
          </div>
          {nameRest && (
            <div
              className="text-muted"
              style={{ fontSize: '0.73rem', opacity: 0.7, lineHeight: 1.2 }}
            >
              {nameRest}
            </div>
          )}
          <div className="d-flex flex-wrap gap-1 mt-1">
            {!user.isActive && (
              <span
                className="badge bg-secondary text-white no-print"
                style={{ fontSize: '0.6rem' }}
              >
                ВІДСУТНІЙ
              </span>
            )}
          </div>
        </td>
        <td className="col-user-print text-start" style={{ fontSize: '10pt' }}>
          {user.rank}
        </td>
        <td className="col-user-print text-start fw-bold" style={{ fontSize: '10pt' }}>
          {formatNameForPrint(user.name)}
        </td>
        {weekDates.map((date) => {
          const entry = schedule[date];
          const isAssigned = isAssignedInEntry(entry, user.id!);
          const availabilityStatus = getUserAvailabilityStatus(user, date);
          const available = availabilityStatus === 'AVAILABLE';
          const prevDate = new Date(date);
          prevDate.setDate(prevDate.getDate() - 1);
          const hadSundayDutyPreviousDay =
            prevDate.getDay() === 0 && isAssignedInEntry(schedule[toLocalISO(prevDate)], user.id!);
          const isPast = new Date(date) < new Date(todayStr);
          const dowWeeksAgo = getDowWeeksAgo(date, user.id!, schedule, dowHistoryWeeks);

          let cellClass = 'compact-cell';
          let screenContent: React.ReactNode = '';
          let printContent = '';

          // ── Drag & drop state classes ─────────────────────────────────────
          const dnd = dragDropHandlers;
          let dropHoverTitle: string | undefined;
          if (dnd?.dragState) {
            const isSource = dnd.dragState.userId === user.id && dnd.dragState.date === date;
            const isHover = dnd.hoverCell?.userId === user.id && dnd.hoverCell?.date === date;
            if (isSource) {
              cellClass += ' dragging';
            } else if (isHover) {
              const validation = dnd.dragState.dropValidation;
              const isValid =
                validation !== undefined ? validation.valid : dnd.isDropValid(user.id!, date); // fallback before first hover fires
              cellClass += isValid ? ' drag-over-valid' : ' drag-over-invalid';
              if (!isValid && validation?.reason) dropHoverTitle = validation.reason;
            }
          }

          if (isAssigned) {
            if (entry.type === 'history' || entry.type === 'import') {
              cellClass += ' history-entry';
            } else if (entry.type === 'force') {
              cellClass += isPast && !historyMode ? ' assigned-force-past' : ' assigned-force';
            } else {
              cellClass +=
                isPast && !historyMode
                  ? ' assigned-past'
                  : ' assigned' + (entry.isLocked ? ' locked' : '');
            }

            const icon = getEntryIcon(entry);

            const log = entry.decisionLog || buildStaticLog(entry);
            screenContent = (
              <>
                НАРЯД
                {icon && <i className={`${icon} schedule-cell-icon ms-1`} />}
                {log && (
                  <button
                    className="decision-log-btn no-print"
                    title="Пояснення призначення"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveLog(log);
                    }}
                  >
                    <i className="bi bi-info-circle" />
                  </button>
                )}
              </>
            );
            printContent = '08:00';
          } else if (hadSundayDutyPreviousDay) {
            cellClass += ' unavailable';
            screenContent = 'ВІДСИПНИЙ';
          } else if (!available) {
            cellClass += ' unavailable';
            screenContent = getUnavailableContent(availabilityStatus, user, date);
          }

          const canDrag =
            isAssigned &&
            !(isPast && !historyMode) &&
            !!dragDropHandlers &&
            entry.type !== 'history' &&
            entry.type !== 'import';

          return (
            <td
              key={date}
              className={cellClass + (canDrag ? ' can-drag' : '')}
              title={dropHoverTitle}
              draggable={canDrag}
              onDragStart={
                canDrag
                  ? (e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `${user.id!}-${date}`);
                      dragDropHandlers!.handleDragStart(user.id!, date, entry);
                    }
                  : undefined
              }
              onDragEnd={canDrag ? () => dragDropHandlers!.handleDragEnd() : undefined}
              onDragEnter={
                dragDropHandlers
                  ? () => dragDropHandlers.handleDragEnter(user.id!, date)
                  : undefined
              }
              onDragOver={
                dragDropHandlers
                  ? (e) => dragDropHandlers.handleDragOver(e, user.id!, date)
                  : undefined
              }
              onDrop={
                dragDropHandlers
                  ? (e) => dragDropHandlers.handleDrop(e, user.id!, date, schedule[date] ?? null)
                  : undefined
              }
              onClick={() => {
                if (dragDropHandlers?.dragState) return; // ignore clicks during drag
                if (isPast && !historyMode) return;
                if (isAssigned) {
                  onCellClick(date, entry, user.id);
                  return;
                }

                if (
                  availabilityStatus === 'AVAILABLE' ||
                  hadSundayDutyPreviousDay ||
                  forceAssignMode
                ) {
                  onQuickAssignClick(date, user);
                }
              }}
            >
              <span className="no-print">{screenContent}</span>
              <span className="print-only">{printContent}</span>
              {dowWeeksAgo.length > 0 && (
                <span
                  className="dow-repeat-dots no-print"
                  title={`Чергування в цей день: ${dowWeeksAgo.map((w) => `${w} тиж. тому`).join(', ')}`}
                >
                  {dowHistoryMode === 'dots'
                    ? Array.from({ length: dowHistoryWeeks }, (_, i) => (
                        <span
                          key={i}
                          style={{ opacity: dowWeeksAgo.includes(i + 1) ? 0.75 : 0.12 }}
                        >
                          ●
                        </span>
                      ))
                    : dowWeeksAgo.join('/')}
                </span>
              )}
            </td>
          );
        })}
      </tr>
      {activeLog &&
        ReactDOM.createPortal(
          <Modal show onClose={() => setActiveLog(null)} title="Чому цей боєць?" size="modal-md">
            <div style={{ fontSize: '0.88rem', lineHeight: 1.65 }}>
              {activeLog.sections && activeLog.sections.length > 0 ? (
                activeLog.sections.map((section, si) => (
                  <div key={si} className={si > 0 ? 'mt-3' : ''}>
                    <div className="fw-bold mb-1" style={{ fontSize: '0.92rem' }}>
                      {section.icon} {section.title}
                    </div>
                    <ul className="mb-0 ps-3" style={{ listStyle: 'none' }}>
                      {section.items.map((item, ii) => (
                        <li
                          key={ii}
                          style={{
                            paddingLeft: item.startsWith('  ') ? '1em' : 0,
                            fontSize: item.startsWith('  ') ? '0.84rem' : undefined,
                          }}
                        >
                          {item.startsWith('  ') ? item.trim() : `• ${item}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <div style={{ whiteSpace: 'pre-wrap' }}>{activeLog.userText}</div>
              )}
            </div>
            {activeLog.debug?.winningCriterion && (
              <details className="mt-3">
                <summary className="text-muted" style={{ fontSize: '0.78rem', cursor: 'pointer' }}>
                  🔍 Технічні деталі (Debug)
                </summary>
                <pre
                  className="mt-2 p-2 rounded"
                  style={{
                    fontSize: '0.72rem',
                    background: 'var(--bs-body-bg)',
                    border: '1px solid var(--bs-border-color)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {JSON.stringify(activeLog.debug, null, 2)}
                </pre>
              </details>
            )}
          </Modal>,
          document.body
        )}
    </>
  );
};

export default ScheduleTableRow;
