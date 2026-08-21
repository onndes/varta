import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import type { User, ScheduleEntry, DecisionLog } from '../../types';
import type { DragDropHandlers } from '../../hooks/useScheduleDragDrop';
import { formatRank, formatNameForPrint } from '../../utils/helpers';
import { STATUSES } from '../../utils/constants';
import { getUserAvailabilityStatus } from '../../services/userService';
import { isAssignedInEntry } from '../../utils/assignment';
import { countUserDaysOfWeek } from '../../services/scheduleService';
import { getStatusPeriodAtDate } from '../../utils/userStatus';
import { toLocalISO } from '../../utils/dateUtils';
import { buildStaticLog } from './scheduleTableUtils';
import DecisionLogModal from './DecisionLogModal';
import { DEFAULT_HELPER_DECORATIONS, type HelperDecorations } from './helperDecorations';
import { getWorkloadBand, type UserWorkload, type WorkloadPoint } from '../../utils/workload';
import { getWeeklyDutyTarget, isStaffDuty } from '../../utils/staffDuty';
import { getStatsCutoff } from '../../utils/statsReset';

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

/** Людський опис навантаження для підказки */
const NO_WORKLOAD_REASON: Record<NonNullable<UserWorkload['noDataReason']>, string> = {
  'not-started': 'Облік навантаження ще не почався — дата включення пізніша за цей тиждень',
  excluded: 'Виключений(-а) з авто-розподілу, тому доступних днів для чергування немає',
  'all-blocked':
    'Увесь період обліку закритий статусом (відпустка / відрядження / лікарняний) або блокуваннями',
};

const describeWorkload = (point: WorkloadPoint, asOf: string): string => {
  if (point.availableDays === 0) return 'Немає доступних днів для обліку навантаження';
  const perDuty =
    point.daysPerDuty > 0 ? `1 наряд на ${point.daysPerDuty.toFixed(1)} дн.` : 'нарядів ще не було';
  return (
    `Навантаження на ${asOf}: ${point.index}% від середнього по підрозділу\n` +
    `${point.duties} нарядів / ${point.availableDays} доступних днів (${perDuty})\n` +
    'Доступні дні = усі дні обліку мінус відпустки, відрядження, лікарняні, блокування'
  );
};

interface ScheduleTableRowProps {
  user: User;
  index: number;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  allUsers: User[];
  todayStr: string;
  historyMode?: boolean;
  dowHistoryWeeks?: number;
  dowHistoryMode?: 'numbers' | 'dots';
  onUserClick?: (user: User) => void;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
  onQuickAssignClick: (date: string, user: User) => void;
  forceAssignMode?: boolean;
  helperDecorations?: HelperDecorations;
  dragDropHandlers?: DragDropHandlers;
  /** Preview-mode entries (never saved to DB). Keyed by date. */
  previewSchedule?: Record<string, ScheduleEntry>;
  /** Показник навантаження бійця (підсумок + зріз на кожну дату тижня). */
  workload?: UserWorkload;
  /** Тижнева норма бійця вичерпана при увімкненому ліміті нарядів на тиждень. */
  weekCapReached?: boolean;
  /** Скільки нарядів у бійця в межах відображеного тижня. */
  weekDutyCount?: number;
  /**
   * Розклад для підрахунків: без нарядів, прихованих обнуленням статистики.
   * Сітка малюється з `schedule`, а всі цифри рахуються звідси.
   */
  statsSchedule?: Record<string, ScheduleEntry>;
}

/**
 * Single row in schedule table representing one user
 */
const ScheduleTableRow: React.FC<ScheduleTableRowProps> = ({
  user,
  index,
  weekDates,
  schedule,
  allUsers,
  todayStr,
  historyMode = false,
  dowHistoryWeeks = 4,
  dowHistoryMode = 'numbers',
  onUserClick,
  onCellClick,
  onQuickAssignClick,
  forceAssignMode = false,
  helperDecorations = DEFAULT_HELPER_DECORATIONS,
  dragDropHandlers,
  previewSchedule,
  workload,
  weekCapReached = false,
  weekDutyCount = 0,
  statsSchedule,
}) => {
  const [activeLog, setActiveLog] = useState<DecisionLog | null>(null);
  const [activeLogDate, setActiveLogDate] = useState<string>('');
  const [activeLogEntry, setActiveLogEntry] = useState<ScheduleEntry | null>(null);
  const countedSchedule = statsSchedule || schedule;
  const dowAssignmentCounts = user.id
    ? countUserDaysOfWeek(user.id, countedSchedule)
    : { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // Штатний черговий: власна тижнева норма замість індексу навантаження
  const staffTarget = isStaffDuty(user) ? getWeeklyDutyTarget(user) : null;

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
            {helperDecorations.workload && staffTarget !== null && (
              <span
                className="workload-badge no-print band-none"
                title={
                  `Штатний черговий: норма ${staffTarget} наряди(-ів) на тиждень, ` +
                  `цього тижня ${weekDutyCount}.\n` +
                  'У середнє навантаження підрозділу не входить — порівнюється лише з власною нормою.'
                }
              >
                <i className="fas fa-shield-halved" />
                {weekDutyCount}/{staffTarget}
                <span className="workload-badge-detail">тиж.</span>
              </span>
            )}
            {helperDecorations.workload && staffTarget === null && workload && workload.availableDays === 0 && (
              <span
                className="workload-badge no-print band-none"
                title={NO_WORKLOAD_REASON[workload.noDataReason ?? 'all-blocked']}
              >
                <i className="fas fa-gauge-high" />—
              </span>
            )}
            {helperDecorations.workload && staffTarget === null && workload && workload.availableDays > 0 && (
              <span
                className={`workload-badge no-print band-${getWorkloadBand(workload)}`}
                title={describeWorkload(workload, weekDates[weekDates.length - 1])}
              >
                <i className="fas fa-gauge-high" />
                {workload.index}%
                <span className="workload-badge-detail">
                  {workload.duties}/{workload.availableDays}
                </span>
              </span>
            )}
            {weekCapReached && (
              <span
                className="week-cap-badge no-print"
                title="Уже чергував цього тижня — за налаштуванням «не більше 1 чергування на тиждень» авто його більше не візьме. Вручну поставити все ще можна."
              >
                <i className="fas fa-check" />
                1/тиждень
              </span>
            )}
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
          // Preview: would this user be auto-assigned here (no real assignment yet)?
          const isPreview =
            !isAssigned &&
            !!previewSchedule?.[date] &&
            isAssignedInEntry(previewSchedule[date], user.id!);
          const availabilityStatus = getUserAvailabilityStatus(user, date);
          const available = availabilityStatus === 'AVAILABLE';
          const prevDate = new Date(date);
          prevDate.setDate(prevDate.getDate() - 1);
          const hadSundayDutyPreviousDay =
            prevDate.getDay() === 0 && isAssignedInEntry(schedule[toLocalISO(prevDate)], user.id!);
          const isPast = new Date(date) < new Date(todayStr);
          const dayOfWeek = new Date(date).getDay();
          const dowWeeksAgo = getDowWeeksAgo(date, user.id!, countedSchedule, dowHistoryWeeks);
          const totalDutiesForDow = dowAssignmentCounts[dayOfWeek] || 0;
          // Зріз навантаження станом на цей день (включно з нарядом цього дня).
          // Для штатного чергового у комірці корисніше бачити виконання тижневої
          // норми на цей день, а не індекс відносно підрозділу.
          const staffWeekProgress =
            staffTarget === null
              ? null
              : weekDates.filter((d) => d <= date && isAssignedInEntry(schedule[d], user.id!))
                  .length;
          const cellWorkloadPoint = workload?.byDate[date];
          const cellWorkload =
            cellWorkloadPoint && cellWorkloadPoint.availableDays > 0 && (available || isAssigned)
              ? cellWorkloadPoint
              : null;

          const statsCutoff = getStatsCutoff(user);

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

          // М'яке підсвічування: квота тижня вичерпана, але клік не блокуємо.
          const softWeekCap = weekCapReached && !isAssigned && available && !isPast;
          if (softWeekCap) cellClass += ' week-cap-soft';

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

            // Наряд до дати обнулення статистики: лишається в графіку, але не рахується.
            if (statsCutoff && date < statsCutoff) cellClass += ' stats-hidden-entry';

            const icon = helperDecorations.assignmentIcons ? getEntryIcon(entry) : '';
            const log = helperDecorations.decisionInfo
              ? entry.decisionLog || buildStaticLog(entry)
              : null;
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
                      setActiveLogDate(date);
                      setActiveLogEntry(entry);
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
          } else if (isPreview) {
            cellClass += ' preview-assignment';
            screenContent = "ПРЕВ'Ю";
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
              data-date={date}
              data-user-id={user.id}
              className={cellClass + (canDrag ? ' can-drag' : '')}
              title={
                dropHoverTitle ??
                (isAssigned && statsCutoff && date < statsCutoff
                  ? `Наряд не враховується у статистиці: облік починається з ${new Date(statsCutoff).toLocaleDateString('uk-UA')}`
                  : softWeekCap
                    ? 'Норма тижня вже виконана (1 чергування). Можна поставити другий раз вручну.'
                    : undefined)
              }
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
              {user.excludeFromAuto && (
                <span className="exclude-auto-marker no-print" aria-hidden="true">
                  <i className="fas fa-ban" />
                </span>
              )}
              {helperDecorations.workload && staffWeekProgress !== null && (available || isAssigned) && (
                <span
                  className="workload-cell-badge no-print band-none"
                  title={`Штатний черговий: ${staffWeekProgress} з ${staffTarget} нарядів тижня станом на ${date}`}
                  aria-hidden="true"
                >
                  {staffWeekProgress}/{staffTarget}
                </span>
              )}
              {helperDecorations.workload && staffTarget === null && cellWorkload && (
                <span
                  className={`workload-cell-badge no-print band-${getWorkloadBand(cellWorkload)}`}
                  title={describeWorkload(cellWorkload, date)}
                  aria-hidden="true"
                >
                  {cellWorkload.index}
                </span>
              )}
              {helperDecorations.dowDutyCounts && (
                <span
                  className={`dow-duty-count-badge no-print${totalDutiesForDow === 0 ? ' is-zero' : ''}`}
                  title={`Усього нарядів у цей день тижня: ${totalDutiesForDow}`}
                  aria-hidden="true"
                >
                  {totalDutiesForDow}
                </span>
              )}
              {helperDecorations.dowHistory && dowWeeksAgo.length > 0 && (
                <span
                  className="dow-repeat-dots no-print"
                  title={`Чергування в цей день: ${dowWeeksAgo.map((w) => `${w} тиж. тому`).join(', ')}`}
                >
                  {dowHistoryMode === 'dots'
                    ? Array.from({ length: Math.min(dowHistoryWeeks, 6) }, (_, i) => (
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
          <DecisionLogModal
            log={activeLog}
            userName={user.name}
            userRank={user.rank}
            dateStr={activeLogDate}
            entryType={activeLogEntry?.type || 'auto'}
            allUsers={allUsers}
            schedule={schedule}
            onClose={() => {
              setActiveLog(null);
              setActiveLogDate('');
              setActiveLogEntry(null);
            }}
          />,
          document.body
        )}
    </>
  );
};

export default ScheduleTableRow;
