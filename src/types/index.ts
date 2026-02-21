// src/types/index.ts

export interface DayWeights {
  [key: number]: number;
}

export interface Signatories {
  approverPos?: string;
  approverRank?: string;
  approverName?: string;
  commanderRank?: string;
  commanderName?: string;
  creatorPos?: string;
  creatorRank?: string;
  creatorName?: string;
  scheduleTitle?: string;
  scheduleSubtitle?: string;
  scheduleLine3?: string;
}

// Теперь value имеет конкретные возможные типы вместо any
export interface AppStateEntry {
  key: string;
  value: DayWeights | Signatories | AutoScheduleOptions | string | number | boolean | null;
}

export interface User {
  id?: number;
  name: string;
  rank: string;
  status: 'ACTIVE' | 'VACATION' | 'TRIP' | 'SICK' | 'OTHER';
  statusFrom?: string;
  statusTo?: string;
  isActive: boolean; // Full participation (if false - user is absent, shown gray in separate tab)
  excludeFromAuto?: boolean; // Exclude from automatic scheduling (manual assignment only)
  note?: string;
  debt: number;
  restBeforeStatus?: boolean;
  restAfterStatus?: boolean;
  blockedDays?: number[]; // Array of day indices (1=Mon, 7=Sun)
  owedDays?: Record<number, number>;
  isExtra?: boolean; // Special participant (trainee, driver) - manual assignment only
  dateAddedToAuto?: string; // Date when isExtra was disabled (included in auto schedule)
}

export interface ScheduleEntry {
  date: string;
  userId: number | number[] | null; // Can be single ID or array for multiple duties per day
  type: 'manual' | 'auto' | 'critical';
  isLocked?: boolean;
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
