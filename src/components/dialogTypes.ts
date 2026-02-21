import { createContext } from 'react';

export interface DialogContextValue {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
}

export const DialogContext = createContext<DialogContextValue | null>(null);
