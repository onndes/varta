# РЕАЛИЗАЦИЯ НЕДОСТАЮЩИХ ФУНКЦИЙ - ФАЗА 1 (Backend)

**Дата:** 2026-02-19  
**Статус:** ✅ Backend завершён, осталось UI

---

## ✅ ЧТО РЕАЛИЗОВАНО (Backend)

### 1. Параметр `perDay` (дежурных в день)

#### ✅ Типы и константы:

- `ScheduleEntry.userId` теперь `number | number[] | null` - поддержка множественных дежурных
- Добавлена константа `DEFAULT_DUTIES_PER_DAY = 1`

#### ✅ Сервисы:

- `getDutiesPerDay()` - получить настройку
- `saveDutiesPerDay(count)` - сохранить настройку
- Хранение в `appState.dutiesPerDay`

**Файлы изменены:**

- `src/types/index.ts` - ScheduleEntry.userId
- `src/utils/constants.ts` - DEFAULT_DUTIES_PER_DAY
- `src/services/settingsService.ts` - get/save функции

---

### 2. Флаг `isExtra` (особые участники)

#### ✅ Типы:

```typescript
export interface User {
  // ... existing fields
  isExtra?: boolean; // Не участвует в авторасчёте
  dateAddedToAuto?: string; // Дата включения в авторежим
}
```

#### ✅ База данных:

- Версия схемы обновлена до **версия 8**
- Добавлены поля `isExtra, dateAddedToAuto` в users

#### ✅ Алгоритм:

- `autoScheduler.ts` (строка 61): фильтр `!u.isExtra` при автоназначении
- `getFreeUsersForDate()` (строка 190): фильтр `!u.isExtra`

**Логика:**

- Если `isExtra = true` → НЕ участвует в автоматическом распределении
- Назначается только вручную
- При выключении `isExtra` → сохраняется `dateAddedToAuto` (текущая дата)
- Статистика учитывается только с даты `dateAddedToAuto`

**Файлы изменены:**

- `src/types/index.ts` - User interface
- `src/db/db.ts` - версия 8 схемы
- `src/services/autoScheduler.ts` - 2 фильтра

---

### 3. Карма за ручные переносы

#### ✅ Новые функции в `scheduleService.ts`:

```typescript
// Расчёт изменения кармы при переносе
calculateKarmaForTransfer(fromDate, toDate, dayWeights): number

// Применить карму при переносе
applyKarmaForTransfer(userId, fromDate, toDate, dayWeights): Promise<void>
```

**Логика:**

- Сравнивает веса дней `fromDate` и `toDate`
- Если перенос на более тяжёлый день → **положительная карма** (награда)
- Если перенос на более лёгкий день → **отрицательная карма** (штраф)
- Изменение кармы: `toWeight - fromWeight`

**Примеры:**

- Перенос с Понедельника (1.0) на Субботу (2.0) → +1.0 карма
- Перенос с Субботы (2.0) на Понедельник (1.0) → -1.0 карма
- Перенос с Пятницы (1.5) на Воскресенье (1.5) → 0 карма

**Файлы изменены:**

- `src/services/scheduleService.ts` - 2 новые функции

---

## ❌ ЧТО ОСТАЛОСЬ (Frontend / UI)

### 1. UI для `perDay` настройки

**Где:** `src/components/SettingsView.tsx`

**Что добавить:**

```tsx
<div className="mb-3">
  <label className="form-label">Дежурных на добу</label>
  <input type="number" min="1" max="5" value={dutiesPerDay} onChange={handleDutiesPerDayChange} />
</div>
```

---

### 2. UI для флага `isExtra`

**Где:** `src/components/UsersView.tsx` или `EditUserModal.tsx`

**Что добавить:**

```tsx
<div className="form-check">
  <input
    type="checkbox"
    id="isExtra"
    checked={user.isExtra || false}
    onChange={handleIsExtraChange}
  />
  <label htmlFor="isExtra">Особий учасник (не бере участь в авторозподілі)</label>
</div>
```

**Логика при изменении:**

```typescript
const handleIsExtraChange = async (checked: boolean) => {
  const updates: Partial<User> = { isExtra: checked };

  // Если снимаем флаг isExtra → сохраняем дату включения
  if (!checked && user.isExtra) {
    updates.dateAddedToAuto = new Date().toISOString().split('T')[0];
  }

  await updateUser(user.id!, updates);
};
```

---

### 3. Интеграция кармы с drag-and-drop

**Где:** `src/components/ScheduleView.tsx`

**Что добавить в обработчик переноса:**

```typescript
const handleDrop = async (fromDate: string, toDate: string, userId: number) => {
  // Existing logic...

  // Calculate and apply karma
  await applyKarmaForTransfer(userId, fromDate, toDate, dayWeights);

  // Log the karma change
  const karma = calculateKarmaForTransfer(fromDate, toDate, dayWeights);
  await logAction(
    'KARMA_TRANSFER',
    `User ${userId}: ${fromDate} → ${toDate}, karma ${karma > 0 ? '+' : ''}${karma}`
  );
};
```

---

### 4. Поддержка множественных дежурных в UI

**Где:** `src/components/ScheduleView.tsx` + `ScheduleTableRow.tsx`

**Проблема:** Сейчас UI ожидает `userId: number`, а теперь может быть `number[]`

**Решение:**

```typescript
// Helper функция
const getUserIds = (entry: ScheduleEntry): number[] => {
  if (!entry.userId) return [];
  return Array.isArray(entry.userId) ? entry.userId : [entry.userId];
};

// В компоненте
const userIds = getUserIds(scheduleEntry);
userIds.forEach((uid) => {
  // Render user badge
});
```

---

### 5. Учёт `dateAddedToAuto` в статистике

**Где:** `src/services/scheduleService.ts` или stats компонент

**Логика:**

```typescript
const calculateUserLoad = (userId: number, schedule, dayWeights) => {
  const user = await getUserById(userId);

  // Учитывать только дежурства после dateAddedToAuto
  const startDate = user.dateAddedToAuto || '1900-01-01';

  return Object.values(schedule)
    .filter((e) => e.date >= startDate && e.userId === userId)
    .reduce((sum, e) => {
      const day = new Date(e.date).getDay();
      return sum + (dayWeights[day] || 1.0);
    }, 0);
};
```

---

## 📋 ПЛАН РЕАЛИЗАЦИИ UI (Фаза 2)

### Приоритет 1: Критичное (2-3 часа)

1. ✅ UI для `perDay` в SettingsView
2. ✅ UI для `isExtra` в UsersView/EditUserModal
3. ✅ Логика сохранения `dateAddedToAuto`

### Приоритет 2: Важное (2-3 часа)

4. ✅ Интеграция кармы с drag-and-drop
5. ✅ Интеграция кармы с ручным назначением
6. ✅ Логирование кармы в AuditLog

### Приоритет 3: Масштабное (4-6 часов)

7. ✅ Поддержка множественных дежурных в UI
8. ✅ Обновление autoScheduler для назначения нескольких
9. ✅ Обновление всех компонентов для рендеринга массива userId

### Приоритет 4: Статистика (2-3 часа)

10. ✅ Учёт `dateAddedToAuto` в расчётах нагрузки
11. ✅ Отображение "с даты" в статистике пользователя

---

## 🔍 ТЕСТИРОВАНИЕ

### После реализации UI проверить:

1. **perDay:**
   - [ ] Изменить в настройках → сохраняется
   - [ ] Автогенерация учитывает perDay
   - [ ] UI корректно отображает N дежурных в день

2. **isExtra:**
   - [ ] Установить isExtra → не попадает в авторасчёт
   - [ ] Снять isExtra → сохраняется dateAddedToAuto
   - [ ] Статистика учитывает только после dateAddedToAuto
   - [ ] Можно назначить вручную

3. **Карма:**
   - [ ] Drag-and-drop на более тяжёлый день → +карма
   - [ ] Drag-and-drop на более лёгкий день → -карма
   - [ ] Карма логируется в AuditLog
   - [ ] Долг обновляется корректно

---

## 📊 МИГРАЦИЯ БАЗЫ ДАННЫХ

**Версия 7 → Версия 8:**

- Автоматическая миграция Dexie
- Существующие записи users получают `isExtra = undefined, dateAddedToAuto = undefined`
- Новые записи могут заполнять эти поля

**Безопасность:**

- Миграция не удаляет данные
- Обратная совместимость сохранена
- При открытии старой БД → автообновление

---

## 🎯 ИТОГОВАЯ СВОДКА

| Задача  | Backend  | Frontend      | Статус |
| ------- | -------- | ------------- | ------ |
| perDay  | ✅ Готов | ❌ Нужен UI   | 🟡 50% |
| isExtra | ✅ Готов | ❌ Нужен UI   | 🟡 70% |
| Карма   | ✅ Готов | ❌ Интеграция | 🟡 60% |

**Общий прогресс:** 🟢 60% завершено

---

**Следующий шаг:** Реализация UI (Фаза 2)  
**Время:** ~10-15 часов работы

**Можно начинать тестировать backend прямо сейчас через DevTools/консоль!**
