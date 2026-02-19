import { describe, it, expect } from 'vitest';
import {
  toLocalISO,
  getWeekNumber,
  getMondayOfWeek,
  getCurrentMonday,
  getWeekDates,
  isPastDate,
  isToday,
  addDays,
  getDayOfWeek,
} from '@/utils/dateUtils';

describe('dateUtils', () => {
  describe('toLocalISO', () => {
    it('повинен конвертувати дату в ISO формат YYYY-MM-DD', () => {
      const date = new Date('2026-02-19T12:00:00Z');
      const result = toLocalISO(date);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('повинен додавати 0 до одноцифрових місяців та днів', () => {
      const date = new Date('2026-03-05T00:00:00');
      const result = toLocalISO(date);
      expect(result).toBe('2026-03-05');
    });
  });

  describe('getWeekNumber', () => {
    it('повинен повертати номер тижня', () => {
      const date = new Date('2026-02-19');
      const result = getWeekNumber(date);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(53);
    });

    it('повинен повертати 1 для початку року', () => {
      const date = new Date('2026-01-05');
      const result = getWeekNumber(date);
      expect(result).toBeLessThanOrEqual(2); // Перші дні року
    });
  });

  describe('getMondayOfWeek', () => {
    it('повинен повертати понеділок вказаного тижня', () => {
      const monday = getMondayOfWeek(2026, 8);
      const day = monday.getDay();
      expect(day).toBe(1); // Понеділок = 1
    });
  });

  describe('getCurrentMonday', () => {
    it('повинен повертати понеділок поточного тижня', () => {
      const monday = getCurrentMonday();
      const day = monday.getDay();
      expect(day).toBe(1); // Понеділок = 1
    });
  });

  describe('getWeekDates', () => {
    it('повинен повертати масив з 7 дат', () => {
      const monday = new Date('2026-02-16'); // Понеділок
      const result = getWeekDates(monday);
      
      expect(result).toHaveLength(7);
      expect(result[0]).toBe('2026-02-16'); // ПН
      expect(result[6]).toBe('2026-02-22'); // НД
    });

    it('дати повинні йти послідовно', () => {
      const monday = new Date('2026-02-16');
      const result = getWeekDates(monday);
      
      for (let i = 1; i < result.length; i++) {
        const prev = new Date(result[i - 1]);
        const curr = new Date(result[i]);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        expect(diff).toBe(1); // Різниця 1 день
      }
    });
  });

  describe('isPastDate', () => {
    it('повинен повертати true для минулої дати', () => {
      const result = isPastDate('2020-01-01');
      expect(result).toBe(true);
    });

    it('повинен повертати false для майбутньої дати', () => {
      const result = isPastDate('2030-12-31');
      expect(result).toBe(false);
    });
  });

  describe('isToday', () => {
    it('повинен повертати true для сьогоднішньої дати', () => {
      const today = toLocalISO(new Date());
      const result = isToday(today);
      expect(result).toBe(true);
    });

    it('повинен повертати false для іншої дати', () => {
      const result = isToday('2020-01-01');
      expect(result).toBe(false);
    });
  });

  describe('addDays', () => {
    it('повинен додавати дні до дати', () => {
      const result = addDays('2026-02-19', 5);
      expect(result).toBe('2026-02-24');
    });

    it('повинен віднімати дні (від\'ємне число)', () => {
      const result = addDays('2026-02-19', -5);
      expect(result).toBe('2026-02-14');
    });

    it('повинен правильно переходити через межу місяця', () => {
      const result = addDays('2026-02-28', 1);
      expect(result).toBe('2026-03-01');
    });
  });

  describe('getDayOfWeek', () => {
    it('повинен повертати правильний день тижня', () => {
      const result = getDayOfWeek('2026-02-16'); // Понеділок
      expect(result).toBe(1);
    });

    it('повинен повертати 0 для неділі', () => {
      const result = getDayOfWeek('2026-02-22'); // Неділя
      expect(result).toBe(0);
    });
  });
});
