// src/hooks/useWeekNavigation.ts

import { useState, useMemo, useCallback, useEffect } from 'react';
import { toLocalISO, getMondayOfWeek } from '../utils/dateUtils';

/** Вычислить понедельник текущей недели */
const getCurrentMonday = (): Date => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

interface UseWeekNavigationOptions {
  /** Блокувати клавіатурну навігацію (коли відкрито модальне вікно) */
  isModalOpen: boolean;
}

export const useWeekNavigation = ({ isModalOpen }: UseWeekNavigationOptions) => {
  const [currentMonday, setCurrentMonday] = useState(getCurrentMonday);

  const weekDates = useMemo(() => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i);
      dates.push(toLocalISO(d));
    }
    return dates;
  }, [currentMonday]);

  const todayStr = useMemo(() => toLocalISO(new Date()), []);

  const shiftWeek = useCallback((offset: number) => {
    setCurrentMonday((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + offset * 7);
      return newDate;
    });
  }, []);

  const jumpToWeek = useCallback(
    (w: number, year?: number) =>
      setCurrentMonday(getMondayOfWeek(year ?? new Date().getFullYear(), w)),
    []
  );

  const goToToday = useCallback(() => setCurrentMonday(getCurrentMonday()), []);

  const handleDatePick = useCallback((dateValue: string) => {
    if (!dateValue) return;
    const d = new Date(dateValue);
    const day = d.getDay();
    setCurrentMonday(new Date(d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))));
  }, []);

  // Keyboard: ArrowLeft / ArrowRight for week switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isModalOpen) return;
      shiftWeek(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shiftWeek, isModalOpen]);

  return {
    currentMonday,
    weekDates,
    todayStr,
    shiftWeek,
    jumpToWeek,
    goToToday,
    handleDatePick,
  };
};
