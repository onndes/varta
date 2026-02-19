import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/db';
import {
  getDayWeights,
  saveDayWeights,
  getSignatories,
  saveSignatories,
  getDutiesPerDay,
  saveDutiesPerDay,
} from '@/services/settingsService';
import type { DayWeights, Signatories } from '@/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('settingsService', () => {
  describe('getDayWeights', () => {
    it('повинен повертати дефолтні ваги днів', async () => {
      const weights = await getDayWeights();

      expect(weights).toBeDefined();
      expect(weights[1]).toBe(1.0); // Понеділок
      expect(weights[6]).toBe(2.0); // Субота
    });

    it('повинен повертати збережені ваги', async () => {
      const customWeights: DayWeights = {
        0: 2.0,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.5,
        5: 2.0,
        6: 3.0,
      };

      await db.appState.put({
        key: 'dayWeights',
        value: JSON.stringify(customWeights),
      });

      const weights = await getDayWeights();
      expect(weights[6]).toBe(3.0); // Змінена субота
      expect(weights[4]).toBe(1.5); // Змінений четвер
    });
  });

  describe('saveDayWeights', () => {
    it('повинен зберігати нові ваги днів', async () => {
      const newWeights: DayWeights = {
        0: 1.0,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.0,
        5: 1.5,
        6: 2.5,
      };

      await saveDayWeights(newWeights);

      const saved = await getDayWeights();
      expect(saved[6]).toBe(2.5);
    });

    it('повинен оновлювати існуючі ваги', async () => {
      await saveDayWeights({
        0: 1.5,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.0,
        5: 1.5,
        6: 2.0,
      });

      await saveDayWeights({
        0: 2.0,
        1: 1.0,
        2: 1.0,
        3: 1.0,
        4: 1.0,
        5: 1.5,
        6: 3.0,
      });

      const saved = await getDayWeights();
      expect(saved[0]).toBe(2.0);
      expect(saved[6]).toBe(3.0);
    });
  });

  describe('getSignatories', () => {
    it('повинен повертати дефолтних підписантів', async () => {
      const sigs = await getSignatories();

      expect(sigs).toBeDefined();
      expect(sigs.commanderRank).toBe('Командир роти');
      expect(sigs.creatorRank).toBe('Старший сержант');
    });

    it('повинен повертати збережених підписантів', async () => {
      const customSigs: Signatories = {
        commanderRank: 'Генерал',
        commanderName: 'Іванов І.І.',
        creatorRank: 'Полковник',
        creatorName: 'Петров П.П.',
      };

      await db.appState.put({
        key: 'signatories',
        value: JSON.stringify(customSigs),
      });

      const sigs = await getSignatories();
      expect(sigs.commanderRank).toBe('Генерал');
      expect(sigs.commanderName).toBe('Іванов І.І.');
    });
  });

  describe('saveSignatories', () => {
    it('повинен зберігати нових підписантів', async () => {
      const newSigs: Signatories = {
        commanderRank: 'Майор',
        commanderName: 'Коваль К.К.',
        creatorRank: 'Капітан',
        creatorName: 'Мельник М.М.',
      };

      await saveSignatories(newSigs);

      const saved = await getSignatories();
      expect(saved.commanderRank).toBe('Майор');
      expect(saved.creatorName).toBe('Мельник М.М.');
    });
  });

  describe('getDutiesPerDay', () => {
    it('повинен повертати дефолтне значення 1', async () => {
      const count = await getDutiesPerDay();
      expect(count).toBe(1);
    });

    it('повинен повертати збережене значення', async () => {
      await db.appState.put({
        key: 'dutiesPerDay',
        value: '2',
      });

      const count = await getDutiesPerDay();
      expect(count).toBe(2);
    });
  });

  describe('saveDutiesPerDay', () => {
    it('повинен зберігати нову кількість дежурних', async () => {
      await saveDutiesPerDay(3);

      const saved = await getDutiesPerDay();
      expect(saved).toBe(3);
    });

    it('повинен оновлювати існуючу кількість', async () => {
      await saveDutiesPerDay(2);
      await saveDutiesPerDay(4);

      const saved = await getDutiesPerDay();
      expect(saved).toBe(4);
    });

    it('повинен працювати з різними числами', async () => {
      for (let i = 1; i <= 5; i++) {
        await saveDutiesPerDay(i);
        const saved = await getDutiesPerDay();
        expect(saved).toBe(i);
      }
    });
  });
});
