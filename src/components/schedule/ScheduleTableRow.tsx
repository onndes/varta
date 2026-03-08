import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import type { User, ScheduleEntry, DecisionLog, DecisionLogSection } from '../../types';
import { formatRank, formatNameForPrint } from '../../utils/helpers';
import { STATUSES } from '../../utils/constants';
import { getUserAvailabilityStatus } from '../../services/userService';
import { isAssignedInEntry } from '../../utils/assignment';
import { getStatusPeriodAtDate } from '../../utils/userStatus';
import { toLocalISO } from '../../utils/dateUtils';
import Modal from '../Modal';

/** Build a static DecisionLog for manual / swap / replace / history / import entries. */
const buildStaticLog = (entry: ScheduleEntry): DecisionLog | undefined => {
  if (entry.type === 'auto' && entry.decisionLog) return entry.decisionLog;

  const sections: DecisionLogSection[] = [];
  let userText = '';

  switch (entry.type) {
    case 'manual':
      userText = 'Призначено вручну — це рішення прийняв адміністратор, не система.';
      sections.push({ icon: '✋', title: 'Ручне призначення', items: [userText] });
      break;
    case 'swap':
      userText = 'Цей наряд отримано в результаті обміну нарядами між бійцями.';
      sections.push({
        icon: '🔄',
        title: 'Обмін нарядами',
        items: [
          userText,
          'Після обміну наряди помінялися місцями.',
          'Це рішення прийняв адміністратор, не система.',
        ],
      });
      break;
    case 'replace':
      userText = 'Цей боєць замінив попереднього чергового на цю дату.';
      sections.push({
        icon: '🔄',
        title: 'Заміна чергового',
        items: [userText, 'Попередній черговий був замінений адміністратором.'],
      });
      break;
    case 'history':
      userText = 'Перенесено з попереднього розкладу.';
      sections.push({
        icon: '📜',
        title: 'Перенесено з архіву',
        items: [userText, 'Система не розраховувала це призначення автоматично.'],
      });
      break;
    case 'import':
      userText = 'Завантажено з зовнішнього файлу.';
      sections.push({
        icon: '📥',
        title: 'Імпортовано',
        items: [userText, 'Система не розраховувала це призначення автоматично.'],
      });
      break;
    default:
      return undefined;
  }

  return { userText, sections, debug: {} as DecisionLog['debug'] };
};

interface ScheduleTableRowProps {
  user: User;
  index: number;
  weekDates: string[];
  schedule: Record<string, ScheduleEntry>;
  todayStr: string;
  historyMode?: boolean;
  onUserClick?: (user: User) => void;
  onCellClick: (date: string, entry: ScheduleEntry | null, assignedUserId?: number) => void;
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
  onUserClick,
  onCellClick,
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

          let cellClass = 'compact-cell';
          let screenContent: React.ReactNode = '';
          let printContent = '';

          if (isAssigned) {
            if (entry.type === 'history' || entry.type === 'import') {
              cellClass += ' history-entry';
            } else {
              cellClass +=
                isPast && !historyMode
                  ? ' assigned-past'
                  : ' assigned' + (entry.isLocked ? ' locked' : '');
            }

            // Show icon for assignment type: manual, auto, replace, swap, history, import, locked
            let icon = '';
            if (entry.isLocked) {
              icon = 'bi bi-lock-fill';
            } else if (entry.type === 'import') {
              icon = 'bi bi-box-arrow-in-down';
            } else if (entry.type === 'history') {
              icon = 'bi bi-clock-history';
            } else if (entry.type === 'replace') {
              icon = 'bi bi-arrow-repeat';
            } else if (entry.type === 'swap') {
              icon = 'bi bi-arrow-left-right';
            } else if (entry.type === 'manual') {
              icon = 'bi bi-hand-index-thumb';
            } else if (entry.type === 'auto') {
              icon = 'bi bi-gear-fill';
            }

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

            // Show status text in unavailable cells
            if (availabilityStatus === 'STATUS_BUSY') {
              const period = getStatusPeriodAtDate(user, date);
              screenContent = period ? STATUSES[period.status] || period.status : 'ЗАЙНЯТИЙ';
            } else if (availabilityStatus === 'REST_DAY') {
              screenContent = 'ЗВІЛЬН. ВІД ЧЕРГ.';
            } else if (availabilityStatus === 'DAY_BLOCKED') {
              screenContent = 'ЗАБЛОКОВАНО';
            } else if (availabilityStatus === 'PRE_STATUS_DAY') {
              screenContent = 'ЗВІЛЬН. ВІД ЧЕРГ.';
            } else {
              screenContent = '—';
            }
          }

          return (
            <td
              key={date}
              className={cellClass}
              onClick={() => {
                if (isPast && !historyMode) return;
                onCellClick(date, isAssigned ? entry : null, isAssigned ? user.id : undefined);
              }}
            >
              <span className="no-print">{screenContent}</span>
              <span className="print-only">{printContent}</span>
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
