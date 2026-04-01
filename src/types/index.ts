// src/types/index.ts

/** Режим друку: календар / таблиця чергувань / тижневий календар / довідка по складу */
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
}

export interface ScheduleEntry {
  date: string;
  userId: number | number[] | null; // Can be single ID or array for multiple duties per day
  type: 'manual' | 'auto' | 'critical' | 'replace' | 'swap' | 'history' | 'import' | 'force';
  isLocked?: boolean;
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
}

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
