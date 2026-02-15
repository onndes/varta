// src/types/index.ts

export interface DayWeights {
  [key: number]: number;
}

export interface Signatories {
  approverPos: string;
  approverRank: string;
  approverName: string;
  creatorRank: string;
  creatorName: string;
}

// Теперь value имеет конкретные возможные типы вместо any
export interface AppStateEntry {
  key: string;
  value: DayWeights | Signatories | string | number | boolean | null;
}

export interface User {
  id?: number;
  name: string;
  rank: string;
  status: 'ACTIVE' | 'VACATION' | 'TRIP' | 'SICK' | 'OTHER';
  statusFrom?: string;
  statusTo?: string;
  isActive: boolean;
  note?: string;
  debt: number;
  restAfterStatus?: boolean;
  owedDays?: Record<number, number>;
}

export interface ScheduleEntry {
  date: string;
  userId: number | null;
  type: 'manual' | 'auto' | 'critical';
  isLocked?: boolean;
}

export interface AuditLogEntry {
  id?: number;
  timestamp: Date;
  action: string;
  details: string;
}
