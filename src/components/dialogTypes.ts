import { createContext } from 'react';

export interface DatePickOptions {
  /** Optional subtitle shown below the title. */
  message?: string;
  /** Default selected date in YYYY-MM-DD format. */
  defaultDate: string;
  /** Earliest selectable date in YYYY-MM-DD format. */
  minDate: string;
}

export interface DialogContextValue {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  /** Shows a date-picker dialog. Resolves with the picked YYYY-MM-DD string, or null if cancelled. */
  showDatePick: (opts: DatePickOptions) => Promise<string | null>;
}

export const DialogContext = createContext<DialogContextValue | null>(null);
