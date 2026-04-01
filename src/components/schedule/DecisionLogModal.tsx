import React, { useState, useMemo } from 'react';
import type {
  DecisionLog,
  FilterStepResult,
  CandidateRow,
  AnomalyFlag,
  ComparatorCriterion,
  WeekContext,
  User,
  ScheduleEntry,
} from '../../types';
import { toAssignedUserIds } from '../../utils/assignment';
import { getUserAvailabilityStatus } from '../../services/userService';
import Modal from '../Modal';
import { FILTER_PHRASES, ELIMINATION_REASON } from '../../services/autoScheduler/decisionPhrases';
import { DOW_SHORT, DOW_NAMES_NOMINATIVE } from '../../services/autoScheduler/decisionLog';

// ─── Tab types ───────────────────────────────────────────────────────────────

type TabKey = 'explanation' | 'details' | 'weekContext';

// ─── Sub-components ──────────────────────────────────────────────────────────

const AnomalyBadges: React.FC<{ flags: AnomalyFlag[] }> = ({ flags }) => {
  if (flags.length === 0) return null;
  return (
    <div className="dlm-anomalies mb-3">
      {flags.map((f, i) => (
        <span key={i} className={`badge dlm-badge-${f.severity} me-2 mb-1`} title={f.adminText}>
          {f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '⚠️' : 'ℹ️'} {f.humanText}
        </span>
      ))}
    </div>
  );
};

const FilterFunnel: React.FC<{ pipeline: FilterStepResult[] }> = ({ pipeline }) => {
  if (pipeline.length === 0) return <div className="text-muted">Дані воронки недоступні.</div>;
  return (
    <div className="dlm-funnel">
      {pipeline.map((step, i) => {
        const isLast = i === pipeline.length - 1;
        const eliminated = step.inputCount - step.outputCount;
        const eliminatedNames = step.eliminated.map((e) => e.userName.split(' ')[0]).join(', ');
        return (
          <div key={i} className="dlm-funnel-step">
            <div className="dlm-funnel-bar">
              <div
                className="dlm-funnel-fill"
                style={{
                  width: `${pipeline[0].inputCount > 0 ? (step.outputCount / pipeline[0].inputCount) * 100 : 100}%`,
                }}
              />
            </div>
            <div className="dlm-funnel-label">
              <span className="dlm-funnel-name">
                {FILTER_PHRASES[step.filterName] || step.filterName}
              </span>
              <span className="dlm-funnel-count">
                → {step.outputCount}
                {eliminated > 0 && (
                  <span
                    className="text-danger ms-1"
                    title={step.eliminated.map((e) => e.userName).join(', ')}
                  >
                    (−{eliminated}
                    {step.eliminated.length <= 2 ? `: ${eliminatedNames}` : ''})
                  </span>
                )}
                {step.wasFallback && (
                  <span className="text-warning ms-1" title="Фільтр скасовано (fallback)">
                    fallback ✓
                  </span>
                )}
              </span>
            </div>
            {!isLast && <div className="dlm-funnel-arrow">↓</div>}
          </div>
        );
      })}
      <div className="dlm-funnel-step dlm-funnel-winner">
        <div className="dlm-funnel-label">
          <span className="dlm-funnel-name">🏆 Компаратор</span>
          <span className="dlm-funnel-count">→ Обрано переможця</span>
        </div>
      </div>
    </div>
  );
};

const CandidateTable: React.FC<{ rows: CandidateRow[] }> = ({ rows }) => {
  const [sortKey, setSortKey] = useState<keyof CandidateRow | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: keyof CandidateRow) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const renderSortHeader = (field: keyof CandidateRow, label: string, title?: string) => (
    <th
      className="dlm-sortable"
      onClick={() => handleSort(field)}
      title={title}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {label}
      {sortKey === field && (sortAsc ? ' ▲' : ' ▼')}
    </th>
  );

  const statusIcon = (s: CandidateRow['status']) => {
    switch (s) {
      case 'winner':
        return '🏆';
      case 'soft-eliminated':
        return '📊';
      case 'filter-eliminated':
        return '🚫';
      case 'hard-eliminated':
        return '❌';
    }
  };

  const statusLabel = (row: CandidateRow) => {
    switch (row.status) {
      case 'winner':
        return 'Обрано';
      case 'soft-eliminated':
        return 'Нижчий пріоритет';
      case 'filter-eliminated':
        return (
          ELIMINATION_REASON[`filter_${row.eliminatedByFilter}`] ||
          FILTER_PHRASES[row.eliminatedByFilter || ''] ||
          'Відфільтровано'
        );
      case 'hard-eliminated':
        return (
          ELIMINATION_REASON[row.eliminatedReason || ''] || row.eliminatedReason || 'Недоступний'
        );
    }
  };

  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover dlm-candidate-table mb-0">
        <thead>
          <tr>
            <th style={{ width: '2rem' }}></th>
            {renderSortHeader('userName', 'Боєць')}
            {renderSortHeader('weeklyCount', 'Тиж.', 'Нарядів цього тижня')}
            {renderSortHeader('dowCount', 'Дн.тиж.', 'Нарядів у цей день тижня')}
            {renderSortHeader('sameDowPenalty', 'Повт.', 'Штраф повтору дня тижня')}
            {renderSortHeader('loadRate', 'Навант.', 'Частота нарядів')}
            {renderSortHeader('waitDays', 'Черга', 'Днів від останнього наряду')}
            {renderSortHeader('debt', 'Борг')}
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.userId} className={`dlm-row-${row.status}`}>
              <td>{statusIcon(row.status)}</td>
              <td className="fw-semibold text-nowrap">
                <small className="text-muted me-1">{row.rank}</small>
                {row.userName}
              </td>
              <td>{row.status === 'hard-eliminated' ? '—' : row.weeklyCount}</td>
              <td>{row.status === 'hard-eliminated' ? '—' : row.dowCount}</td>
              <td>
                {row.status === 'hard-eliminated' ? (
                  '—'
                ) : (
                  <span
                    className={
                      row.sameDowPenalty >= 100
                        ? 'text-danger fw-bold'
                        : row.sameDowPenalty >= 25
                          ? 'text-warning'
                          : ''
                    }
                  >
                    {row.sameDowPenalty}
                  </span>
                )}
              </td>
              <td>{row.status === 'hard-eliminated' ? '—' : row.loadRate.toFixed(3)}</td>
              <td>
                {row.status === 'hard-eliminated'
                  ? '—'
                  : row.waitDays === -1
                    ? '∞'
                    : `${row.waitDays}д`}
              </td>
              <td>{row.status === 'hard-eliminated' ? '—' : row.debt}</td>
              <td>
                <small>{statusLabel(row)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ComparatorTable: React.FC<{ criteria: ComparatorCriterion[] }> = ({ criteria }) => (
  <div className="table-responsive">
    <table className="table table-sm dlm-comparator-table mb-0">
      <thead>
        <tr>
          <th style={{ width: '3.5rem' }} title="Пріоритет: менше число = важливіший критерій">
            Пріоритет
          </th>
          <th>Критерій</th>
          <th>Значення</th>
          <th>Опис</th>
        </tr>
      </thead>
      <tbody>
        {criteria.map((c) => (
          <tr
            key={c.priority}
            className={[
              !c.isActive && 'text-muted dlm-row-inactive',
              c.isDecisive && 'dlm-row-decisive',
              c.isAnomalous && 'dlm-row-anomalous',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <td className="text-center">
              <span className="badge bg-secondary">{c.priority}</span>
            </td>
            <td className="fw-semibold text-nowrap">
              {c.name}
              {c.isDecisive && (
                <span className="ms-1" title="Вирішальний критерій">
                  ⭐
                </span>
              )}
            </td>
            <td>
              <span className={c.isAnomalous ? 'text-danger fw-bold' : ''}>
                {typeof c.value === 'number' ? c.value : c.value}
              </span>
              {!c.isActive && <small className="text-muted ms-1">(вимк.)</small>}
            </td>
            <td>
              <small className="text-muted">{c.description}</small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const WeekHeatmap: React.FC<{
  weekContext: WeekContext;
  allUsers: User[];
  schedule: Record<string, ScheduleEntry>;
  assignedId: number;
  dateStr: string;
}> = ({ weekContext, allUsers, schedule, assignedId, dateStr }) => {
  const days = useMemo(() => {
    const result: string[] = [];
    const cursor = new Date(weekContext.weekFrom);
    const end = new Date(weekContext.weekTo);
    while (cursor <= end) {
      result.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }, [weekContext.weekFrom, weekContext.weekTo]);

  // Only show users who are part of the schedule (have at least 1 duty this week or are the assigned user)
  const relevantUsers = useMemo(() => {
    return allUsers
      .filter((u) => {
        if (!u.id) return false;
        if (u.id === assignedId) return true;
        const count = weekContext.groupDutiesThisWeek[u.id] || 0;
        if (count > 0) return true;
        // Show users who are unavailable (for context)
        return u.isActive && !u.isExtra && !u.excludeFromAuto;
      })
      .sort((a, b) => {
        // Assigned user first
        if (a.id === assignedId) return -1;
        if (b.id === assignedId) return 1;
        // Then by duty count descending
        const ca = weekContext.groupDutiesThisWeek[a.id!] || 0;
        const cb = weekContext.groupDutiesThisWeek[b.id!] || 0;
        return cb - ca;
      })
      .slice(0, 15); // Limit to 15 users to keep it readable
  }, [allUsers, assignedId, weekContext.groupDutiesThisWeek]);

  const getCellContent = (
    user: User,
    day: string
  ): { emoji: string; cls: string; title: string } => {
    const entry = schedule[day];
    const isAssigned = entry && toAssignedUserIds(entry.userId).includes(user.id!);
    const isCurrent = day === dateStr && user.id === assignedId;
    const availability = getUserAvailabilityStatus(user, day);

    if (isCurrent) return { emoji: '🔵', cls: 'dlm-heatmap-current', title: 'Поточна дата' };
    if (isAssigned) return { emoji: '🟢', cls: 'dlm-heatmap-assigned', title: 'Наряд' };

    switch (availability) {
      case 'STATUS_BUSY':
        return { emoji: '🏖️', cls: 'dlm-heatmap-vacation', title: 'Відпустка/відрядження' };
      case 'DAY_BLOCKED':
        return { emoji: '🔴', cls: 'dlm-heatmap-blocked', title: 'День заблоковано' };
      case 'BIRTHDAY':
        return { emoji: '🎂', cls: 'dlm-heatmap-birthday', title: 'День народження' };
      case 'REST_DAY':
      case 'PRE_STATUS_DAY':
        return { emoji: '💤', cls: 'dlm-heatmap-rest', title: 'Відпочинок' };
      case 'UNAVAILABLE':
        return { emoji: '—', cls: 'dlm-heatmap-unavail', title: 'Недоступний' };
      default:
        return { emoji: '·', cls: 'dlm-heatmap-empty', title: 'Вільний' };
    }
  };

  const dowHeaders = days.map((d) => DOW_SHORT[new Date(d).getDay()] || '');

  return (
    <div className="dlm-heatmap">
      <div className="table-responsive">
        <table className="table table-sm table-bordered dlm-heatmap-table mb-0">
          <thead>
            <tr>
              <th style={{ minWidth: '120px' }}>Боєць</th>
              {dowHeaders.map((h, i) => (
                <th key={i} className="text-center" style={{ width: '3rem' }}>
                  <div>{h}</div>
                  <div className="text-muted" style={{ fontSize: '0.65rem' }}>
                    {days[i].slice(8, 10)}.{days[i].slice(5, 7)}
                  </div>
                </th>
              ))}
              <th className="text-center" style={{ width: '2.5rem' }}>
                Σ
              </th>
            </tr>
          </thead>
          <tbody>
            {relevantUsers.map((u) => {
              const isHighlighted = u.id === assignedId;
              const weekCount = weekContext.groupDutiesThisWeek[u.id!] || 0;
              return (
                <tr key={u.id} className={isHighlighted ? 'dlm-heatmap-highlight' : ''}>
                  <td className="text-nowrap">
                    {isHighlighted && '🏆 '}
                    <small className="text-muted">{u.rank}</small>{' '}
                    <span className={isHighlighted ? 'fw-bold' : ''}>{u.name.split(' ')[0]}</span>
                  </td>
                  {days.map((day) => {
                    const cell = getCellContent(u, day);
                    return (
                      <td key={day} className={`text-center ${cell.cls}`} title={cell.title}>
                        {cell.emoji}
                      </td>
                    );
                  })}
                  <td className="text-center fw-semibold">{weekCount > 0 ? weekCount : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="dlm-heatmap-legend mt-2">
        <small className="text-muted">
          🟢 наряд &nbsp; 🔵 поточна дата &nbsp; 🔴 заблоковано &nbsp; 🏖️ відпустка &nbsp; 💤
          відпочинок &nbsp; 🎂 день народження &nbsp; · вільний
        </small>
      </div>
    </div>
  );
};

// ─── Main Modal Component ────────────────────────────────────────────────────

interface DecisionLogModalProps {
  log: DecisionLog;
  userName: string;
  userRank: string;
  dateStr: string;
  entryType: string;
  allUsers: User[];
  schedule: Record<string, ScheduleEntry>;
  onClose: () => void;
}

const DecisionLogModal: React.FC<DecisionLogModalProps> = ({
  log,
  userName,
  userRank,
  dateStr,
  entryType,
  allUsers,
  schedule,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('explanation');

  const dateObj = new Date(dateStr);
  const dayIdx = dateObj.getDay();
  const dowName = DOW_NAMES_NOMINATIVE[dayIdx] || '';
  const dateFormatted = `${dowName}, ${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;

  const hasEnhancedData = Boolean(log.filterPipeline || log.candidateTable);
  const anomalyFlags = log.anomalyFlags || [];

  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'explanation', label: 'Пояснення', icon: 'bi bi-chat-text' },
    ...(hasEnhancedData
      ? [
          { key: 'details' as TabKey, label: 'Деталі відбору', icon: 'bi bi-funnel' },
          { key: 'weekContext' as TabKey, label: 'Контекст тижня', icon: 'bi bi-calendar-week' },
        ]
      : []),
  ];

  return (
    <Modal show onClose={onClose} title="Чому цей боєць?" size="modal-xl">
      <div className="dlm-container">
        {/* Header */}
        <div className="dlm-header mb-3">
          <div className="d-flex align-items-center justify-content-between">
            <div>
              <span className="fw-bold text-uppercase" style={{ fontSize: '1rem' }}>
                {userName}
              </span>
              <small className="text-muted ms-2">{userRank}</small>
            </div>
            <div className="text-end">
              <span className="text-muted">{dateFormatted}</span>
              {log.dayWeight != null && (
                <span
                  className="badge bg-light text-dark border ms-2"
                  title="Вага дня тижня (враховується у навантаженні)"
                >
                  ×{log.dayWeight.toFixed(2)}
                </span>
              )}
              <span
                className={`badge ms-2 ${entryType === 'auto' ? 'bg-primary' : 'bg-secondary'}`}
              >
                {entryType === 'auto' ? 'авто' : entryType}
              </span>
              {log.wasSwapOptimized && (
                <span className="badge bg-info ms-1" title="Переставлено swap-оптимізатором">
                  swap
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Anomaly badges */}
        <AnomalyBadges flags={anomalyFlags} />

        {/* Tab navigation */}
        {tabs.length > 1 && (
          <ul className="nav nav-pills dlm-tabs mb-3">
            {tabs.map((tab) => (
              <li key={tab.key} className="nav-item">
                <button
                  className={`nav-link ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <i className={`${tab.icon} me-1`} />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Tab content — min-height prevents jumping when switching tabs */}
        <div className="dlm-tab-content" style={{ minHeight: '320px' }}>
          {activeTab === 'explanation' && <TabExplanation log={log} />}
          {activeTab === 'details' && hasEnhancedData && <TabDetails log={log} />}
          {activeTab === 'weekContext' && log.weekContext && (
            <TabWeekContext log={log} allUsers={allUsers} schedule={schedule} dateStr={dateStr} />
          )}
        </div>
      </div>
    </Modal>
  );
};

// ─── Tab: Explanation (User-facing) ──────────────────────────────────────────

const TabExplanation: React.FC<{ log: DecisionLog }> = ({ log }) => (
  <div style={{ fontSize: '0.88rem', lineHeight: 1.65 }}>
    {log.sections && log.sections.length > 0 ? (
      log.sections.map((section: { icon: string; title: string; items: string[] }, si: number) => (
        <div key={si} className={si > 0 ? 'mt-3' : ''}>
          <div className="fw-bold mb-1" style={{ fontSize: '0.92rem' }}>
            {section.icon} {section.title}
          </div>
          <ul className="mb-0 ps-3" style={{ listStyle: 'none' }}>
            {section.items.map((item: string, ii: number) => (
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
      <div style={{ whiteSpace: 'pre-wrap' }}>{log.userText}</div>
    )}

    {/* Debug JSON (collapsible) */}
    {log.debug?.winningCriterion && (
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
          {JSON.stringify(log.debug, null, 2)}
        </pre>
      </details>
    )}
  </div>
);

// ─── Tab: Details ────────────────────────────────────────────────────────────

const TabDetails: React.FC<{ log: DecisionLog }> = ({ log }) => (
  <div className="dlm-details">
    {/* Intro */}
    <div className="dlm-section-intro mb-3">
      Система обирає чергового у 2 етапи: спершу <strong>фільтри</strong> послідовно відсіюють тих,
      хто не може чергувати (відпустка, відпочинок, ліміт тощо), а потім <strong>компаратор</strong>{' '}
      порівнює залишок кандидатів за 10+ критеріями і обирає найкращого.
    </div>

    {/* 1. Filter funnel */}
    <div className="dlm-section mb-3">
      <h6 className="dlm-section-title">
        <span className="dlm-section-number">1</span>
        Воронка фільтрів
      </h6>
      <p className="dlm-section-desc">
        Кожен фільтр перевіряє одну умову і може відсіяти кандидатів. Якщо фільтр відсіє{' '}
        <em>усіх</em>, його результат скасовується (fallback).
      </p>
      <FilterFunnel pipeline={log.filterPipeline || []} />
    </div>

    {/* 2. Candidate table */}
    <div className="dlm-section mb-3">
      <h6 className="dlm-section-title">
        <span className="dlm-section-number">2</span>
        Таблиця кандидатів
      </h6>
      <p className="dlm-section-desc">
        Усі бійці, яких система розглядала. 🏆 — обраний, 📊 — пройшов фільтри але програв у
        порівнянні, 🚫 — відсіяний фільтром, ❌ — недоступний. Натисніть заголовок колонки для
        сортування.
      </p>
      {log.candidateTable && log.candidateTable.length > 0 ? (
        <CandidateTable rows={log.candidateTable} />
      ) : (
        <div className="text-muted">Дані кандидатів недоступні.</div>
      )}
    </div>

    {/* 3. Comparator criteria */}
    {log.comparatorCriteria && log.comparatorCriteria.length > 0 && (
      <div className="dlm-section mb-3">
        <h6 className="dlm-section-title">
          <span className="dlm-section-number">3</span>
          Критерії порівняння
        </h6>
        <p className="dlm-section-desc">
          Після фільтрації кандидати порівнюються за цими критеріями зверху вниз. Вищий пріоритет
          (менше число) — важливіший. Як тільки знайдено різницю, решта критеріїв ігнорується. ⭐ —
          критерій, що визначив переможця. Сірі рядки — вимкнені у поточних налаштуваннях.
        </p>
        <ComparatorTable criteria={log.comparatorCriteria} />
      </div>
    )}

    {/* Assigned metrics summary */}
    {log.assignedMetrics && (
      <details className="mt-2">
        <summary className="text-muted" style={{ fontSize: '0.78rem', cursor: 'pointer' }}>
          📊 Повні метрики обраного бійця (JSON)
        </summary>
        <pre
          className="mt-2 p-2 rounded"
          style={{
            fontSize: '0.72rem',
            background: 'var(--bs-body-bg)',
            border: '1px solid var(--bs-border-color)',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {JSON.stringify(log.assignedMetrics, null, 2)}
        </pre>
      </details>
    )}
  </div>
);

// ─── Tab: Week Context ───────────────────────────────────────────────────────

const TabWeekContext: React.FC<{
  log: DecisionLog;
  allUsers: User[];
  schedule: Record<string, ScheduleEntry>;
  dateStr: string;
}> = ({ log, allUsers, schedule, dateStr }) => {
  const wc = log.weekContext!;

  // Week summary stats
  const entries = Object.entries(wc.groupDutiesThisWeek) as [string, number][];
  const withDuties = entries.filter(([, c]) => c > 0);
  const maxDuties = withDuties.length > 0 ? Math.max(...withDuties.map(([, c]) => c)) : 0;

  return (
    <div className="dlm-week-context">
      {/* Week summary */}
      <div className="d-flex gap-3 mb-3 flex-wrap">
        <div className="dlm-stat-card">
          <div className="dlm-stat-value">{wc.userDutiesThisWeek}</div>
          <div className="dlm-stat-label">Нарядів цього тижня</div>
        </div>
        <div className="dlm-stat-card">
          <div className="dlm-stat-value">{withDuties.length}</div>
          <div className="dlm-stat-label">Бійців з нарядами</div>
        </div>
        <div className="dlm-stat-card">
          <div className="dlm-stat-value">{maxDuties}</div>
          <div className="dlm-stat-label">Макс. нарядів</div>
        </div>
        {wc.whyExtraDutyAllowed && (
          <div className="dlm-stat-card dlm-stat-warning">
            <div className="dlm-stat-label">{wc.whyExtraDutyAllowed}</div>
          </div>
        )}
      </div>

      {/* Heatmap */}
      <h6 className="text-muted mb-2">
        <i className="bi bi-grid-3x3 me-1" /> Тижневий розклад
      </h6>
      <WeekHeatmap
        weekContext={wc}
        allUsers={allUsers}
        schedule={schedule}
        assignedId={log.debug?.assignedUserId || 0}
        dateStr={dateStr}
      />
    </div>
  );
};

export default DecisionLogModal;
