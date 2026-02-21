import { useContext } from 'react';
import { DialogContext, type DialogContextValue } from './dialogTypes';

export const useDialog = (): DialogContextValue => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
};
