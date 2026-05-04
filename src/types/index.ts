// src/types/index.ts

export type PrintMode = 'calendar' | 'duty-table' | 'week-calendar-table' | 'status-list';
export type ScheduleDocumentMode = Exclude<PrintMode, 'status-list'>;

export interface PrintWeekRange {
  year: number;
  fromWeek: number;
  toWeek: number;
}

/** Тема оформлення */
export type AppTheme = 'light' | 'dark';

export interface DayWeights {
  [key: number]: number;
}

export interface Signatories {
  approverPos?: string;
  approverRank?: string;
  approverName?: string;
  commanderRank?: string;
  commanderName?: string;
  showCreatorFooter?: boolean;
  creatorPos?: string;
  creatorRank?: string;
  creatorName?: string;
  scheduleTitle?: string;
  scheduleSubtitle?: string;
  scheduleLine3?: string;
  // Підписант для довідки по складу (окремий від графіка)
  reportCreatorPos?: string;
  reportCreatorRank?: string;
  reportCreatorName?: string;
}

// Теперь value имеет конкретные возможные типы вместо any
export interface AppStateEntry {
  key: string;
  value:
    | DayWeights
    | Signatories
    | AutoScheduleOptions
    | BirthdayBlockOpts
    | string
    | number
    | boolean
    | null;
}

export interface User {
  id?: number;
  name: string;
  rank: string;
  status: UserStatus;
  statusFrom?: string;
  statusTo?: string;
  isPersonnel?: boolean; // true = особа є в загальному о/с; undefined/false = не додана
  isDutyMember?: boolean; // true = людина входить до складу чергових; false/undefined = не черговий
  isActive: boolean; // Full participation (if false - user is absent, shown gray in separate tab)
  excludeFromAuto?: boolean; // Exclude from automatic scheduling (manual assignment only)
  note?: string;
  incompatibleWith?: number[]; // IDs of users who can't be on duty on consecutive days
  debt: number;
  restBeforeStatus?: boolean;
  restAfterStatus?: boolean;
  blockedDays?: number[]; // Array of day indices (1=Mon, 7=Sun)
  blockedDaysFrom?: string; // Початок періоду блокування (ISO date)
  blockedDaysTo?: string; // Кінець періоду блокування (ISO date)
  blockedDaysComment?: string; // Коментар до заблокованих днів
  owedDays?: Record<number, number>;
  isExtra?: boolean; // Special participant (trainee, driver) - manual assignment only
  dateAddedToAuto?: string; // Date when isExtra was disabled (included in auto schedule)
  statusComment?: string; // Legacy comment field (migrated into statusPeriods[].comment)
  statusPeriods?: UserStatusPeriod[]; // Planned/current status periods (multiple intervals)
  birthday?: string; // YYYY-MM-DD format — full date of birth, blocks duty on birthday
  inactivePeriods?: { from: string; to?: string }[]; // Auto-tracked periods when isActive was false
  excludedFromAutoPeriods?: { from: string; to?: string }[]; // Auto-tracked periods when excludeFromAuto was true (legacy)
  blockedDaysPeriods?: BlockedDaysPeriod[]; // Period-based blocked days (new system)
  excludeFromAutoPeriods2?: ExcludeFromAutoPeriod[]; // Explicitly managed exclude-from-auto periods (new system)
}

export interface BirthdayBlockOpts {
  enabled: boolean;
  blockBefore: boolean; // block the day before birthday
  blockAfter: boolean; // block the day after birthday
}

export type UserStatus = 'ACTIVE' | 'VACATION' | 'TRIP' | 'SICK' | 'ABSENT' | 'OTHER';
export type UserAbsenceStatus = 'VACATION' | 'TRIP' | 'SICK' | 'ABSENT';

export interface UserStatusPeriod {
  status: UserAbsenceStatus;
  from?: string;
  to?: string;
  comment?: string; // For ABSENT only
  restBefore?: boolean; // Rest day before this status period
  restAfter?: boolean; // Rest day after this status period
}

export interface BlockedDaysPeriod {
  days: number[]; // array of ISO weekday indices (1=Mon…7=Sun)
  from?: string; // ISO date, undefined = always active from start
  to?: string; // ISO date, undefined = open-ended
  comment?: string;
}

export interface ExcludeFromAutoPeriod {
  from: string; // ISO date — required (defaults to today when created via UI)
  to?: string; // ISO date, undefined = still active
  comment?: string;
}

// Duty rotation pattern — controls how many consecutive days a person works
// and how many mandatory rest days follow before the next rotation starts.
export type DutyPatternMode = 'classic' | 'block-rotation';

export interface DutyPattern {
  mode: DutyPatternMode;
  /** block-rotation: how many consecutive duty days per cycle (min 1, max 14) */
  dutyDays: number;
  /** block-rotation: how many mandatory rest days after the duty block (min 1, max 30) */
  restDays: number;
}

// ─── Decision Log (Info Button «i») ──────────────────────────────────────

/** Reason code for why a candidate was filtered out / outranked. */
export type RejectReason =
  | 'hard_inactive'
  | 'hard_status_busy' // VACATION / SICK / TRIP / ABSENT
  | 'hard_day_blocked'
  | 'hard_rest_day' // restBefore / restAfter
  | 'hard_incompatible_pair'
  | 'filter_rest_days' // avoidConsecutiveDays
  | 'filter_weekly_cap'
  | 'filter_force_use_all'
  | 'outranked'; // passed all filters but lost in comparator

/** Metrics snapshot for a single candidate (used in debug JSON). */
export interface CandidateSnapshot {
  userId: number;
  userName: string;
  rejected: boolean;
  rejectPhase: 'hardConstraint' | 'filter' | 'comparator';
  rejectReason: RejectReason | string;
  metrics: {
    dowCount: number;
    sameDowPenalty: number;
    loadRate: number;
    waitDays: number;
    weeklyCount: number;
    fairnessIndex?: number;
  } | null;
}

/** Structured section for the «i» modal (✅ / ❌ / 📅 / ⚠️ / 🔍). */
export interface DecisionLogSection {
  icon: string;
  title: string;
  items: string[];
}

// ─── Enhanced Decision Log types ─────────────────────────────────────────

/** Filter pipeline step result — one per filter applied during candidate selection. */
export interface FilterStepResult {
  filterName: string;
  inputCount: number;
  outputCount: number;
  eliminated: { userId: number; userName: string }[];
  reason: string;
  wasFallback: boolean;
}

/** Full metrics for a candidate in the selection table. */
export interface CandidateRow {
  userId: number;
  userName: string;
  rank: string;
  dowCount: number;
  weeklyCount: number;
  waitDays: number;
  loadRate: number;
  sameDowPenalty: number;
  crossDowGuard: number;
  debt: number;
  status: 'winner' | 'soft-eliminated' | 'hard-eliminated' | 'filter-eliminated';
  eliminatedByFilter?: string;
  eliminatedReason?: string;
}

/** Detailed metrics for the winning candidate. */
export interface UserMetricsFull {
  dowCount: number;
  dowSSE: number;
  sameDowPenalty: number;
  crossDowGuard: number;
  weeklyCount: number;
  dowRecency: number;
  loadRate: number;
  waitDays: number;
  debt: number;
  avgLoadRate: number;
  avgDowCount: number;
  winningCriterion: string;
  winningCriterionDelta: number;
}

/** Week context information — who does what this week. */
export interface WeekContext {
  weekFrom: string;
  weekTo: string;
  userDutiesThisWeek: number;
  groupDutiesThisWeek: Record<number, number>;
  isSecondDutyThisWeek: boolean;
  isThirdOrMoreDutyThisWeek: boolean;
  whyExtraDutyAllowed: string | null;
}

/** Anomaly flag for noteworthy situations. */
export interface AnomalyFlag {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  humanText: string;
  adminText: string;
  relatedValue?: number;
}

/** Comparator criterion value snapshot for a single candidate. */
export interface ComparatorCriterion {
  priority: number;
  name: string;
  description: string;
  value: number | string;
  isActive: boolean;
  isDecisive?: boolean;
  isAnomalous?: boolean;
}

/** Full decision log attached to a ScheduleEntry after auto-fill. */
export interface DecisionLog {
  /** Human-readable explanation for end users. */
  userText: string;
  /** Structured sections for the modal UI (Human-First). */
  sections: DecisionLogSection[];
  /** Debug data for developers / XAI transparency. */
  debug: {
    winningCriterion: string;
    assignedUserId: number;
    dowCount: number;
    dowSSE: number;
    sameDowPenalty: number;
    loadRate: number;
    waitDays: number;
    weeklyCount: number;
    poolSizes: {
      initial: number;
      afterHardEligible: number;
      afterRestDays: number;
      afterIncompatiblePairs: number;
      afterWeeklyCap: number;
      afterForceUseAll: number;
      final: number;
    };
    alternatives: CandidateSnapshot[];
    globalObjective_Z?: number;
  };
  /** Filter pipeline steps (enhanced decision log). */
  filterPipeline?: FilterStepResult[];
  /** Full candidate table with all metrics (enhanced decision log). */
  candidateTable?: CandidateRow[];
  /** Detailed metrics for the assigned user (enhanced decision log). */
  assignedMetrics?: UserMetricsFull;
  /** Week context — duties this week for all users (enhanced decision log). */
  weekContext?: WeekContext;
  /** Anomaly flags for noteworthy situations (enhanced decision log). */
  anomalyFlags?: AnomalyFlag[];
  /** Comparator criteria values for the assigned user (enhanced decision log). */
  comparatorCriteria?: ComparatorCriterion[];
  /** Day-of-week weight for the assigned date. */
  dayWeight?: number;
  /** Whether the entry was changed by swap optimization after the greedy pass. */
  wasSwapOptimized?: boolean;
  /** Optimizer history: tracks what the optimizers changed and why. */
  optimizerHistory?: OptimizerHistoryEntry[];
}

/** Single optimizer change record — tracks one reassignment during optimization. */
export interface OptimizerHistoryEntry {
  /** Which optimizer made this change. */
  phase:
    | 'phase1-pair'
    | 'phase2-replace'
    | 'phase3-sameDow'
    | 'phase4-cyclic'
    | 'tabu-pair'
    | 'tabu-replace'
    | 'tabu-diversify'
    | 'lookahead';
  /** Brief Ukrainian description of what happened. */
  description: string;
  /** User who was previously assigned to this date (before the swap). */
  previousUserId?: number;
  previousUserName?: string;
  /** User who was assigned after the swap. */
  newUserId?: number;
  newUserName?: string;
  /** Objective Z before the change. */
  zBefore?: number;
  /** Objective Z after the change. */
  zAfter?: number;
  /** Iteration number (for Tabu Search). */
  iteration?: number;
  /** Human-readable explanation of why the previous assignment was replaced. */
  rejectionReason?: string;
}

export interface ScheduleEntry {
  date: string;
  userId: number | number[] | null; // Can be single ID or array for multiple duties per day
  type: 'manual' | 'auto' | 'critical' | 'replace' | 'swap' | 'history' | 'import' | 'force';
  isLocked?: boolean;
  /** Legacy whole-entry override flag. Prefer `availabilityOverrideUserIds` for new writes. */
  isAvailabilityOverride?: boolean;
  /** User IDs whose availability conflict was explicitly accepted by the operator. */
  availabilityOverrideUserIds?: number[];
  /** Auto-generated decision log (Info Button «i»). Not persisted to DB. */
  decisionLog?: DecisionLog;
}

export interface AutoScheduleOptions {
  avoidConsecutiveDays: boolean;
  respectOwedDays: boolean;
  considerLoad: boolean;
  minRestDays: number; // Minimum rest days between duties (1 = no consecutive, 2 = one day gap, etc.)
  aggressiveLoadBalancing: boolean;
  aggressiveLoadBalancingThreshold: number;
  limitOneDutyPerWeekWhenSevenPlus: boolean;
  allowDebtUsersExtraWeeklyAssignments: boolean;
  debtUsersWeeklyLimit: number;
  prioritizeFasterDebtRepayment: boolean;
  forceUseAllWhenFew: boolean; // When few users available (<=7), force cyclic use of ALL users regardless of load
  evenWeeklyDistribution: boolean; // Extend forceUseAllWhenFew to all rounds: nobody gets N+1 duties while anyone has N
  useFirstDutyDateAsActiveFrom: boolean; // Use first duty date (not date added to list) as fairness tracking start
  useExperimentalStatsView?: boolean; // Optional for backward compatibility with old tests/backups
  // Lookahead: simulate top-K candidates forward to avoid greedy dead-ends
  lookaheadDepth?: number; // 0=off, 1-14 days to simulate forward (default: 0)
  lookaheadCandidates?: number; // how many top candidates to evaluate (default: 3)
  // Tabu Search: Phase 4 post-optimization that can escape local optima
  useTabuSearch?: boolean; // default: false
  tabuTenure?: number; // how many iterations a move stays forbidden (default: 7)
  tabuMaxIterations?: number; // max iterations for tabu search (default: 50)
  // Multi-Restart (Iterated Local Search): random perturbation + local search within a time budget
  useMultiRestart?: boolean; // default: false
  multiRestartTimeoutMs?: number; // time budget in ms (default: 30000)
  multiRestartStrategy?: 'pair-swap' | 'lns'; // perturbation strategy: pair-swap (classic) or LNS (destroy-repair)
  multiRestartTimeLimitMode?: 'fixed' | 'unlimited'; // 'fixed' = use multiRestartTimeoutMs, 'unlimited' = run until aborted
  // Scheduler visualization: live cell highlighting during generation
  enableSchedulerVisualization?: boolean; // default: false
  schedulerVisSpeed?: number; // delay between visual events in ms (default: 40)
  schedulerVisShowAttempts?: boolean; // show all attempted swaps, not just accepted (default: false)
  // Weekly drought: boost users who missed the previous week so they rotate back in
  prioritizeAfterWeekOff?: boolean; // default: true
  dutyPattern?: DutyPattern;
}

/** Progress callback for long-running scheduler operations. */
export type SchedulerProgressCallback = (phase: string, percent: number) => void;

/** Visualization event emitted during scheduler execution. */
export interface SchedulerVisEvent {
  type:
    | 'greedy-date' // Starting to fill a date
    | 'greedy-candidate' // Top candidates after sorting
    | 'greedy-select' // Candidate selected (winner)
    | 'lookahead-try' // Evaluating a lookahead candidate
    | 'lookahead-best' // Lookahead found a better candidate
    | 'swap-try' // Swap being evaluated (attempted but may be rejected)
    | 'swap-accept' // Swap accepted (Z improved)
    | 'restart-try' // Multi-restart attempting a perturbation
    | 'restart-improve' // Multi-restart found improvement
    | 'restart-best' // Current best assignment (persistent highlight)
    | 'phase-start' // A major phase begins
    | 'phase-end' // A major phase ends
    | 'clear'; // Clear all highlights
  dates?: string[];
  userIds?: number[];
  phase?: string;
}

/** Callback for real-time scheduler visualization. */
export type SchedulerVisCallback = (event: SchedulerVisEvent) => Promise<void>;

export interface AuditLogEntry {
  id?: number;
  timestamp: Date;
  action: string;
  details: string;
}

export interface TimelineEvent {
  date: string;
  title: string;
  details: string;
  tone: 'primary' | 'warning' | 'danger' | 'success' | 'secondary';
}
