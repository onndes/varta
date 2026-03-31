import React, { useEffect, useRef, useState } from 'react';
import type { User, ScheduleEntry, DayWeights } from '../types';
import { type SortKey, type SortDir } from '../utils/helpers';
import UserStatsModal from './users/UserStatsModal';
import { useStatsData } from '../hooks/useStatsData';
import {
  StatsTableHeader,
  StatsTableRow,
  StatsLegend,
  StatsTableHeaderClassic,
  StatsTableRowClassic,
  StatsLegendClassic,
} from './StatsTableParts';
import type { UserStats } from '../hooks/useStatsData';

interface StatsViewProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  dayWeights: DayWeights;
  ignoreHistoryInLogic: boolean;
  useExperimentalStatsView: boolean;
  useFirstDutyDateAsActiveFrom: boolean;
}

const StatsView: React.FC<StatsViewProps> = ({
  users,
  schedule,
  dayWeights,
  ignoreHistoryInLogic,
  useExperimentalStatsView,
  useFirstDutyDateAsActiveFrom,
}) => {
  const [showInactive, setShowInactive] = useState(true);
  const [showActive, setShowActive] = useState(true);
  const [showDayBreakdown, setShowDayBreakdown] = useState(false);
  const [includeFuture, setIncludeFuture] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserStats | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyInnerRef = useRef<HTMLDivElement | null>(null);
  const [stickyScrollbar, setStickyScrollbar] = useState({
    visible: false,
    left: 0,
    width: 0,
    bottom: 0,
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'desc' : 'asc');
    }
  };

  const { stats, groupMeta } = useStatsData({
    users,
    schedule,
    dayWeights,
    ignoreHistoryInLogic,
    showActive,
    showInactive,
    sortKey,
    sortDir,
    includeFuture,
    useFirstDutyDateAsActiveFrom,
  });

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const stickyEl = stickyScrollRef.current;
    const stickyInnerEl = stickyInnerRef.current;
    if (!tableEl || !stickyEl || !stickyInnerEl) return;

    let isSyncing = false;
    const syncFromTable = () => {
      if (isSyncing) return;
      isSyncing = true;
      stickyEl.scrollLeft = tableEl.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };
    const syncFromSticky = () => {
      if (isSyncing) return;
      isSyncing = true;
      tableEl.scrollLeft = stickyEl.scrollLeft;
      requestAnimationFrame(() => {
        isSyncing = false;
      });
    };

    const updateStickyScrollbar = () => {
      const hasHorizontalOverflow = tableEl.scrollWidth - tableEl.clientWidth > 1;
      stickyInnerEl.style.width = `${tableEl.scrollWidth}px`;

      const rect = tableEl.getBoundingClientRect();
      const footerEl = document.querySelector('.app-footer') as HTMLElement | null;
      const footerRect = footerEl?.getBoundingClientRect();
      const footerBottomOffset =
        footerRect && footerRect.top < window.innerHeight
          ? Math.max(0, window.innerHeight - footerRect.top)
          : 0;
      const viewportBottom = window.innerHeight - footerBottomOffset;
      const shouldStick =
        hasHorizontalOverflow && rect.top < viewportBottom && rect.bottom > viewportBottom;

      const next = {
        visible: shouldStick,
        left: Math.max(0, rect.left),
        width: Math.max(0, rect.width),
        bottom: footerBottomOffset,
      };
      setStickyScrollbar((prev) =>
        prev.visible === next.visible &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.bottom === next.bottom
          ? prev
          : next
      );
    };

    const appContentEl = tableEl.closest('.app-content');
    tableEl.addEventListener('scroll', syncFromTable, { passive: true });
    stickyEl.addEventListener('scroll', syncFromSticky, { passive: true });
    appContentEl?.addEventListener('scroll', updateStickyScrollbar, { passive: true });
    window.addEventListener('resize', updateStickyScrollbar);

    const ro = new ResizeObserver(updateStickyScrollbar);
    ro.observe(tableEl);
    const tableTag = tableEl.querySelector('table');
    if (tableTag) ro.observe(tableTag);

    updateStickyScrollbar();
    syncFromTable();

    return () => {
      tableEl.removeEventListener('scroll', syncFromTable);
      stickyEl.removeEventListener('scroll', syncFromSticky);
      appContentEl?.removeEventListener('scroll', updateStickyScrollbar);
      window.removeEventListener('resize', updateStickyScrollbar);
      ro.disconnect();
    };
  }, [stats.length, showActive, showInactive, sortKey, sortDir]);

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white py-3">
        <div className="d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">
            <i className="fas fa-chart-line me-2 text-primary"></i>Статистика навантаження
          </h5>
          <div className="d-flex gap-2 align-items-center">
            <div className="d-flex gap-2">
              {useExperimentalStatsView && (
                <>
                  <button
                    type="button"
                    className={`btn btn-sm stats-filter-btn ${showDayBreakdown ? 'is-on' : ''}`}
                    onClick={() => setShowDayBreakdown(!showDayBreakdown)}
                    title="Показати/сховати розбивку по дням тижня"
                  >
                    <i className="fas fa-calendar-week me-1"></i>
                    Пн–Нд
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm stats-filter-btn ${includeFuture ? 'is-on' : ''}`}
                    onClick={() => setIncludeFuture(!includeFuture)}
                    title={
                      includeFuture
                        ? 'Зараз: враховуються минулі + майбутні наряди. Натисніть — тільки минулі'
                        : 'Зараз: тільки минулі наряди. Натисніть — враховувати майбутні'
                    }
                  >
                    <i className={`fas fa-${includeFuture ? 'calendar-alt' : 'history'} me-1`}></i>
                    {includeFuture ? 'З майбутніми' : 'Минулі'}
                  </button>
                </>
              )}
              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className={`btn btn-sm stats-filter-btn ${showActive ? 'is-on' : ''}`}
                  onClick={() => setShowActive(!showActive)}
                >
                  <i className="fas fa-user-check me-1"></i>
                  Активні
                </button>
                <button
                  type="button"
                  className={`btn btn-sm stats-filter-btn ${showInactive ? 'is-on' : ''}`}
                  onClick={() => setShowInactive(!showInactive)}
                >
                  <i className="fas fa-user-slash me-1"></i>
                  Неактивні
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {stats.length === 0 ? (
        <div className="text-center text-muted py-5 d-flex flex-column align-items-center">
          <i className="fas fa-users fa-2x mb-3"></i>
          <span>Немає осіб у складі</span>
        </div>
      ) : (
        <>
          <div ref={tableScrollRef} className="table-responsive stats-table-scroll">
            <table className="table table-hover align-middle mb-0 table-align-center stats-table">
              {useExperimentalStatsView ? (
                <>
                  <StatsTableHeader
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    showDayBreakdown={showDayBreakdown}
                  />
                  <tbody>
                    {stats.map((u) => (
                      <StatsTableRow
                        key={u.id}
                        u={u}
                        onSelect={setSelectedUser}
                        groupMeta={groupMeta}
                        showDayBreakdown={showDayBreakdown}
                        includeFuture={includeFuture}
                      />
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <StatsTableHeaderClassic
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <tbody>
                    {stats.map((u) => (
                      <StatsTableRowClassic key={u.id} u={u} onSelect={setSelectedUser} />
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
          <div
            ref={stickyScrollRef}
            className={`stats-sticky-scrollbar${stickyScrollbar.visible ? ' is-visible' : ''}`}
            style={{
              left: `${stickyScrollbar.left}px`,
              width: `${stickyScrollbar.width}px`,
              bottom: `${stickyScrollbar.bottom}px`,
            }}
            aria-hidden={!stickyScrollbar.visible}
          >
            <div ref={stickyInnerRef} className="stats-sticky-scrollbar__inner"></div>
          </div>
        </>
      )}
      {useExperimentalStatsView ? <StatsLegend /> : <StatsLegendClassic />}
      {selectedUser && (
        <UserStatsModal
          user={selectedUser}
          users={users}
          schedule={schedule}
          dayWeights={dayWeights}
          ignoreHistoryInLogic={ignoreHistoryInLogic}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
};

export default StatsView;
