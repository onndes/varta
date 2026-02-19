# 🧪 ПОСІБНИК З ТЕСТУВАННЯ VARTA-2026

## 📋 ЗМІСТ

1. [Налаштування тестів](#налаштування)
2. [Приклади тестів](#приклади-тестів)
3. [Запуск тестів](#запуск-тестів)
4. [Що тестувати](#що-тестувати)

---

## ⚙️ НАЛАШТУВАННЯ

### 1. Встановити Vitest

```bash
npm install -D vitest @vitest/ui
npm install -D @testing-library/react @testing-library/jest-dom
npm install -D happy-dom  # швидший браузерний environment
```

### 2. Створити конфігурацію

**Файл: `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts', '**/*.test.tsx'],
    },
  },
});
```

### 3. Створити setup файл

**Файл: `tests/setup.ts`**

```typescript
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Очищення після кожного тесту
afterEach(() => {
  cleanup();
});
```

### 4. Додати скрипти в package.json

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## 🧪 ПРИКЛАДИ ТЕСТІВ

### 1. Тестування утиліт (dateUtils)

**Файл: `tests/utils/dateUtils.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { toLocalISO, getWeekDates, getWeekNumber } from '@/utils/dateUtils';

describe('dateUtils', () => {
  describe('toLocalISO', () => {
    it('повинен конвертувати дату в ISO формат', () => {
      const date = new Date('2026-02-19');
      const result = toLocalISO(date);
      expect(result).toBe('2026-02-19');
    });

    it('повинен додавати 0 до одноцифрових місяців', () => {
      const date = new Date('2026-03-05');
      const result = toLocalISO(date);
      expect(result).toBe('2026-03-05');
    });
  });

  describe('getWeekDates', () => {
    it('повинен повертати 7 днів тижня', () => {
      const monday = '2026-02-16'; // понеділок
      const result = getWeekDates(monday);

      expect(result).toHaveLength(7);
      expect(result[0]).toBe('2026-02-16'); // ПН
      expect(result[6]).toBe('2026-02-22'); // НД
    });
  });

  describe('getWeekNumber', () => {
    it('повинен повертати номер тижня', () => {
      const result = getWeekNumber(new Date('2026-02-19'));
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(53);
    });
  });
});
```

---

### 2. Тестування сервісів (userService)

**Файл: `tests/services/userService.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Dexie from 'dexie';
import { db } from '@/db/db';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  isUserAvailable,
} from '@/services/userService';
import type { User } from '@/types';

// Mock бази даних для тестів
beforeEach(async () => {
  // Створюємо тимчасову БД в пам'яті
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await db.delete();
});

describe('userService', () => {
  describe('createUser', () => {
    it('повинен створити нового користувача', async () => {
      const newUser = {
        name: 'Тестовий Користувач',
        rank: 'Солдат',
        status: 'ACTIVE' as const,
        isActive: true,
        debt: 0,
      };

      const id = await createUser(newUser);

      expect(id).toBeGreaterThan(0);

      const user = await db.users.get(id);
      expect(user).toBeDefined();
      expect(user?.name).toBe('Тестовий Користувач');
      expect(user?.rank).toBe('Солдат');
    });

    it('повинен встановити дефолтні значення', async () => {
      const id = await createUser({
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
      });

      const user = await db.users.get(id);
      expect(user?.isActive).toBe(true);
      expect(user?.debt).toBe(0);
      expect(user?.owedDays).toEqual({});
    });
  });

  describe('updateUser', () => {
    it('повинен оновити існуючого користувача', async () => {
      const id = await createUser({
        name: 'Original',
        rank: 'Солдат',
        status: 'ACTIVE',
      });

      await updateUser(id, { name: 'Updated', debt: 1.5 });

      const user = await db.users.get(id);
      expect(user?.name).toBe('Updated');
      expect(user?.debt).toBe(1.5);
    });
  });

  describe('isUserAvailable', () => {
    it('повинен повертати false якщо користувач на відпустці', async () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'VACATION',
        statusFrom: '2026-02-19',
        statusTo: '2026-02-25',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-20', {});
      expect(available).toBe(false);
    });

    it('повинен повертати true якщо користувач активний', async () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const available = isUserAvailable(user, '2026-02-20', {});
      expect(available).toBe(true);
    });

    it('повинен перевіряти день відпочинку після дежурства', async () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const schedule = {
        '2026-02-19': {
          date: '2026-02-19',
          userId: 1,
          type: 'auto' as const,
        },
      };

      // День після дежурства - недоступний
      const available = isUserAvailable(user, '2026-02-20', schedule);
      expect(available).toBe(false);
    });
  });
});
```

---

### 3. Тестування алгоритму автопланування

**Файл: `tests/services/autoScheduler.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '@/db/db';
import { fillGapsInSchedule } from '@/services/autoScheduler';
import type { User } from '@/types';

beforeEach(async () => {
  await db.delete();
  await db.open();

  // Додаємо тестових користувачів
  await db.users.bulkAdd([
    {
      name: 'User 1',
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
      debt: 0,
      owedDays: {},
    },
    {
      name: 'User 2',
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
      debt: 0,
      owedDays: {},
    },
    {
      name: 'User 3',
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
      debt: 1.5, // має борг
      owedDays: {},
    },
  ]);
});

afterEach(async () => {
  await db.delete();
});

describe('autoScheduler', () => {
  describe('fillGapsInSchedule', () => {
    it('повинен призначити дежурних на всі вільні дні', async () => {
      const dates = ['2026-02-20', '2026-02-21', '2026-02-22'];
      const dayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const result = await fillGapsInSchedule(dates, dayWeights);

      expect(result).toHaveLength(3);
      result.forEach((entry) => {
        expect(entry.userId).toBeDefined();
        expect(entry.date).toBeDefined();
      });
    });

    it('повинен віддавати пріоритет користувачу з боргом', async () => {
      const dates = ['2026-02-20'];
      const dayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const result = await fillGapsInSchedule(dates, dayWeights);

      // User 3 має борг 1.5, має бути призначений
      const user = await db.users.get(result[0].userId as number);
      expect(user?.name).toBe('User 3');
    });

    it('не повинен призначати на два дні підряд', async () => {
      const dates = ['2026-02-20', '2026-02-21'];
      const dayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const result = await fillGapsInSchedule(dates, dayWeights);

      // Перевіряємо що різні користувачі
      expect(result[0].userId).not.toBe(result[1].userId);
    });
  });
});
```

---

### 4. Тестування розрахунків

**Файл: `tests/services/scheduleService.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateEffectiveLoad } from '@/services/scheduleService';
import type { User, ScheduleEntry } from '@/types';

describe('scheduleService', () => {
  describe('calculateEffectiveLoad', () => {
    it('повинен розрахувати навантаження з вагами днів', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: 0,
        owedDays: {},
      };

      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-17': { date: '2026-02-17', userId: 1, type: 'auto' }, // ПН = 1.0
        '2026-02-21': { date: '2026-02-21', userId: 1, type: 'auto' }, // ПТ = 1.5
        '2026-02-22': { date: '2026-02-22', userId: 1, type: 'auto' }, // СБ = 2.0
      };

      const dayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const load = calculateEffectiveLoad(user, schedule, dayWeights);

      // 1.0 + 1.5 + 2.0 = 4.5
      expect(load).toBe(4.5);
    });

    it('повинен враховувати борг користувача', () => {
      const user: User = {
        id: 1,
        name: 'Test',
        rank: 'Солдат',
        status: 'ACTIVE',
        isActive: true,
        debt: -1.5, // негативний борг = менше навантаження
        owedDays: {},
      };

      const schedule: Record<string, ScheduleEntry> = {
        '2026-02-17': { date: '2026-02-17', userId: 1, type: 'auto' },
      };

      const dayWeights = { 0: 1.5, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 2 };

      const load = calculateEffectiveLoad(user, schedule, dayWeights);

      // 1.0 (дежурство) - 1.5 (борг) = -0.5
      expect(load).toBe(-0.5);
    });
  });
});
```

---

## 🚀 ЗАПУСК ТЕСТІВ

### Команди

```bash
# Запуск всіх тестів
npm test

# Запуск у watch режимі (авто-перезапуск при змінах)
npm test -- --watch

# Запуск з UI інтерфейсом
npm run test:ui

# Запуск з покриттям коду (coverage)
npm run test:coverage

# Запуск конкретного файлу
npm test -- userService.test.ts

# Запуск тестів що містять певне слово
npm test -- --grep="calculateEffectiveLoad"
```

### Інтерпретація результатів

```bash
✓ tests/utils/dateUtils.test.ts (3) 5ms
  ✓ dateUtils (3) 4ms
    ✓ toLocalISO (2) 2ms
    ✓ getWeekDates 1ms
    ✓ getWeekNumber 1ms

✓ tests/services/userService.test.ts (5) 45ms
  ✓ userService (5) 43ms
    ✓ createUser (2) 15ms
    ✓ updateUser 12ms
    ✓ isUserAvailable (3) 16ms

 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  14:30:00
   Duration  312ms
```

---

## 📝 ЩО ТЕСТУВАТИ

### Пріоритет 1: Критична логіка ⭐⭐⭐

**Services:**

- ✅ `userService.ts` - створення, оновлення, видалення користувачів
- ✅ `scheduleService.ts` - розрахунки навантаження, пошук конфліктів
- ✅ `autoScheduler.ts` - алгоритм автопланування
- ✅ `settingsService.ts` - збереження налаштувань

**Utils:**

- ✅ `dateUtils.ts` - робота з датами
- ✅ `helpers.ts` - допоміжні функції

### Пріоритет 2: Бізнес-логіка ⭐⭐

- Перевірка доступності користувачів
- Розрахунок карми та боргів
- Валідація даних
- Перевірка конфліктів графіка

### Пріоритет 3: UI компоненти ⭐

**Важливі компоненти:**

- `ScheduleTable` - відображення графіка
- `UserForm` - форми користувачів
- `Modal` - модальні вікна

---

## 🎯 ПРИКЛАД СТРУКТУРИ ТЕСТІВ

```
tests/
├── setup.ts                      # Налаштування тестів
├── utils/
│   ├── dateUtils.test.ts
│   └── helpers.test.ts
├── services/
│   ├── userService.test.ts
│   ├── scheduleService.test.ts
│   ├── autoScheduler.test.ts
│   └── settingsService.test.ts
└── components/
    ├── ScheduleTable.test.tsx
    └── UserForm.test.tsx
```

---

## 💡 ПОРАДИ

### 1. Ізольовані тести

- Кожен тест незалежний
- Використовуйте `beforeEach` для очищення стану
- Mock зовнішні залежності

### 2. Читабельність

```typescript
// ✅ ДОБРЕ
it('повинен повернути false для користувача на відпустці', () => {
  // arrange
  const user = createTestUser({ status: 'VACATION' });

  // act
  const result = isUserAvailable(user, '2026-02-20', {});

  // assert
  expect(result).toBe(false);
});

// ❌ ПОГАНО
it('тест 1', () => {
  expect(isUserAvailable({...}, '2026-02-20', {})).toBe(false);
});
```

### 3. Покриття коду

- Мета: >80% покриття для критичної логіки
- Перевіряйте edge cases
- Тестуйте помилкові сценарії

### 4. CI/CD інтеграція

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

---

## ✅ ЧЕКЛИСТ ГОТОВНОСТІ

- [ ] Встановлено Vitest
- [ ] Створено vitest.config.ts
- [ ] Створено tests/setup.ts
- [ ] Написано тести для dateUtils
- [ ] Написано тести для userService
- [ ] Написано тести для scheduleService
- [ ] Написано тести для autoScheduler
- [ ] Всі тести проходять
- [ ] Покриття коду >70%

---

## 🎉 РЕЗУЛЬТАТ

Після налаштування ви зможете:

1. **Автоматично перевіряти логіку** - без ручного тестування через UI
2. **Швидко знаходити баги** - тести покажуть що зламалось
3. **Впевнено рефакторити** - тести гарантують що логіка не зламалась
4. **Документувати код** - тести показують як використовувати функції
5. **Швидко розробляти** - не потрібно запускати весь додаток

**Час налаштування:** ~30 хвилин  
**Вигода:** Безмежна! 🚀
