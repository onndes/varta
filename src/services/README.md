# Services Layer Documentation

Цей шар містить всю бізнес-логіку додатку, ізольовану від UI компонентів.

## Структура

```
services/
├── index.ts              # Центральна точка експорту
├── userService.ts        # Управління користувачами
├── scheduleService.ts    # Управління графіком
├── autoScheduler.ts      # Автоматичне планування
├── exportService.ts      # Імпорт/Експорт
├── auditService.ts       # Логування дій
└── settingsService.ts    # Налаштування додатку
```

## Сервіси

### 🔷 userService.ts

**Управління користувачами**

```typescript
// CRUD операції
getAllUsers(); // Отримати всіх користувачів
getUserById(id); // Отримати за ID
createUser(user); // Створити нового
updateUser(id, data); // Оновити
deleteUser(id); // Видалити

// Спеціальні операції
resetUserDebt(id); // Скинути баланс
updateUserDebt(id, amount); // Оновити баланс
updateOwedDays(id, dayIndex, inc); // Оновити борги по днях
isUserAvailable(user, date); // Чи доступний
getUserAvailabilityStatus(user, date); // Статус доступності

// Масові операції
bulkCreateUsers(users); // Створити багато
clearAllUsers(); // Очистити всіх
```

### 🔷 scheduleService.ts

**Управління графіком**

```typescript
// CRUD
getAllSchedule(); // Весь графік
getScheduleByDate(date); // За датою
saveScheduleEntry(entry); // Зберегти
deleteScheduleEntry(date); // Видалити

// Запити
getUserSchedule(userId); // Графік користувача
getScheduleRange(start, end); // Діапазон

// Розрахунки
calculateUserLoad(userId, schedule, weights); // Навантаження
calculateEffectiveLoad(user, schedule, weights); // Ефективне навантаження

// Аналіз
findScheduleConflicts(schedule, users, start); // Знайти конфлікти
findScheduleGaps(schedule, dates); // Знайти прогалини
getScheduleStats(schedule, weights); // Статистика

// Утиліти
toggleScheduleLock(date, locked); // Блокувати/розблокувати
getLockedDates(); // Заблоковані дати
```

### 🔷 autoScheduler.ts

**Автоматичне планування**

```typescript
// Основні функції
autoFillSchedule(dates, users, schedule, weights, options);
// Автоматично заповнити графік

saveAutoSchedule(entries, users);
// Зберегти автогенерований графік

recalculateScheduleFrom(date, users, schedule, weights);
// Перерахувати з певної дати

// Допоміжні
getFreeUsersForDate(date, users, weekDates, schedule, weights);
// Вільні користувачі для дати

calculateOptimalAssignment(date, users, schedule, weights);
// Оптимальне призначення

// Опції
interface AutoScheduleOptions {
  avoidConsecutiveDays?: boolean; // Уникати підряд
  respectOwedDays?: boolean; // Враховувати борги
  considerLoad?: boolean; // Враховувати навантаження
}
```

### 🔷 exportService.ts

**Імпорт/Експорт даних**

```typescript
// Експорт
exportData(); // Експорт всіх даних
downloadBackup(); // Завантажити бекап

// Імпорт
importData(data); // Імпорт даних
uploadBackup(file); // Завантажити з файлу

// Перевірки
isBackupNeeded(days); // Чи потрібен бекап
hasUnsavedChanges(); // Чи є незбережені зміни
validateExportData(data); // Валідація даних

// Утиліти
markAsNeedsExport(); // Позначити для експорту
clearNeedsExport(); // Очистити флаг
getLastExportDate(); // Остання дата експорту
```

### 🔷 auditService.ts

**Логування дій**

```typescript
// Логування
logAction(action, details); // Залогувати дію

// Запити
getAllLogs(); // Всі логи
getRecentLogs(limit); // Останні N логів
getLogsByDateRange(start, end); // За діапазоном
getLogsByAction(action); // За типом дії

// Очищення
clearOldLogs(daysToKeep); // Видалити старі
clearAllLogs(); // Видалити всі

// Статистика
getLogStats(); // Статистика логів
```

### 🔷 settingsService.ts

**Налаштування**

```typescript
// Day Weights
getDayWeights()              // Отримати ваги днів
saveDayWeights(weights)      // Зберегти ваги

// Signatories
getSignatories()             // Отримати підписантів
saveSignatories(sigs)        // Зберегти підписантів

// Cascade Trigger
getCascadeStartDate()        // Дата для перерахунку
updateCascadeTrigger(date)   // Оновити тригер
clearCascadeTrigger()        // Очистити тригер

// Загальні
getAppSetting(key, default)  // Отримати налаштування
saveAppSetting(key, value)   // Зберегти налаштування
resetAllSettings()           // Скинути все
```

## Переваги сервісного шару

✅ **Переиспользование** - Логіка доступна з будь-якого компонента ✅ **Тестуємість** - Легко писати
unit-тести ✅ **Читабельність** - Компоненти стають простішими ✅ **Масштабованість** - Легко
додавати нову логіку ✅ **Типізація** - Повна підтримка TypeScript

## Приклад використання

### Було (в компоненті):

```typescript
const handleAdd = async () => {
  await db.users.add({
    name: newName,
    rank: newRank,
    // ... 10 рядків коду
  });
  await db.auditLog.add({
    /* ... */
  });
  await db.appState.put({
    /* ... */
  });
  refreshData();
};
```

### Стало (з сервісом):

```typescript
import { createUser, logAction } from '@/services';

const handleAdd = async () => {
  await createUser({ name: newName, rank: newRank /* ... */ });
  await logAction('ADD', `Додано: ${newName}`);
  refreshData();
};
```

## Наступні кроки

1. ✅ Створити сервісний шар
2. 🔄 Створити кастомні хуки на основі сервісів
3. 🔄 Оновити компоненти для використання сервісів
4. 🔄 Видалити дублікати коду

---

**Створено:** 2026-02-15  
**Версія:** 1.0.0
