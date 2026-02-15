# Custom Hooks Documentation

React хуки для управління станом та бізнес-логікою додатку.

## 📦 Створені хуки

### 1. useUsers

**Управління користувачами**

```typescript
import { useUsers } from '@/hooks';

const MyComponent = () => {
  const {
    users, // User[] - всі користувачі
    loading, // boolean - статус завантаження
    error, // string | null - помилка
    createUser, // (user) => Promise<number>
    updateUser, // (id, updates) => Promise<void>
    deleteUser, // (id) => Promise<void>
    resetUserDebt, // (id) => Promise<void>
    bulkCreateUsers, // (users[]) => Promise<void>
    getUserById, // (id) => User | undefined
    getActiveUsers, // () => User[]
    getAvailableUsers, // (date) => User[]
  } = useUsers();
};
```

**Функції:**

- ✅ Автоматичне завантаження
- ✅ Сортування по рангу та статусу
- ✅ CRUD операції
- ✅ Логування в audit log
- ✅ Обробка помилок

---

### 2. useSchedule

**Управління графіком**

```typescript
import { useSchedule } from '@/hooks';

const MyComponent = () => {
  const {
    schedule, // Record<string, ScheduleEntry>
    dayWeights, // DayWeights
    loading, // boolean
    error, // string | null
    assignUser, // (date, userId, isManual) => Promise<void>
    removeAssignment, // (date, reason) => Promise<void>
    getUserSchedule, // (userId) => ScheduleEntry[]
    getScheduleRange, // (start, end) => Record<string, ScheduleEntry>
    findConflicts, // (startDate?) => string[]
    findGaps, // (dates) => string[]
    calculateUserLoad, // (userId) => number
    calculateEffectiveLoad, // (user) => number
    getStats, // () => ScheduleStats
    toggleLock, // (date, locked) => Promise<void>
    bulkDelete, // (dates) => Promise<void>
  } = useSchedule(users);
};
```

**Залежності:**

- Потребує `users` з `useUsers`

**Функції:**

- ✅ Призначення користувачів
- ✅ Розрахунок навантаження
- ✅ Пошук конфліктів
- ✅ Статистика

---

### 3. useSettings

**Налаштування додатку**

```typescript
import { useSettings } from '@/hooks';

const MyComponent = () => {
  const {
    dayWeights, // DayWeights
    signatories, // Signatories
    cascadeStartDate, // string | null
    loading, // boolean
    error, // string | null
    saveDayWeights, // (weights) => Promise<void>
    saveSignatories, // (sigs) => Promise<void>
    updateCascadeTrigger, // (date) => Promise<void>
    clearCascadeTrigger, // () => Promise<void>
    resetAllSettings, // () => Promise<void>
  } = useSettings();
};
```

**Функції:**

- ✅ Ваги днів тижня
- ✅ Підписанти для друку
- ✅ Cascade triggers
- ✅ Скидання до defaults

---

### 4. useAutoScheduler

**Автоматичне планування**

```typescript
import { useAutoScheduler } from '@/hooks';

const MyComponent = () => {
  const {
    isProcessing, // boolean - статус обробки
    error, // string | null
    fillGaps, // (dates, onComplete?) => Promise<void>
    fixConflicts, // (conflictDates, onComplete?) => Promise<void>
    recalculateFrom, // (startDate, onComplete?) => Promise<void>
    generateWeekSchedule, // (weekDates, onComplete?) => Promise<void>
    getFreeUsersForDate, // (date, weekDates) => User[]
    getOptimalAssignment, // (date) => User | null
  } = useAutoScheduler(users, schedule, dayWeights);
};
```

**Залежності:**

- Потребує `users`, `schedule`, `dayWeights`

**Функції:**

- ✅ Заповнення прогалин
- ✅ Виправлення конфліктів
- ✅ Перерахунок графіка
- ✅ Генерація тижня
- ✅ Callback при завершенні

---

### 5. useExport

**Імпорт/Експорт даних**

```typescript
import { useExport } from '@/hooks';

const MyComponent = () => {
  const {
    needsExport, // boolean - чи є незбережені зміни
    lastExportDate, // Date | null - остання дата експорту
    isBackupNeeded, // boolean - чи потрібен бекап
    isProcessing, // boolean - статус обробки
    error, // string | null
    exportData, // () => Promise<void>
    importData, // (file) => Promise<void>
    getExportData, // () => Promise<ExportData>
    markAsNeedsExport, // () => Promise<void>
    clearNeedsExport, // () => Promise<void>
    validateImportData, // (data) => boolean
    getDaysSinceLastExport, // () => number | null
    checkExportStatus, // () => Promise<void>
  } = useExport();
};
```

**Функції:**

- ✅ Експорт в JSON
- ✅ Імпорт з файлу
- ✅ Відстеження змін
- ✅ Валідація даних
- ✅ Нагадування про бекап

---

## 🎯 Приклади використання

### Простий компонент з користувачами

```typescript
import { useUsers } from '@/hooks';

const UsersList = () => {
  const { users, loading, deleteUser } = useUsers();

  if (loading) return <div>Завантаження...</div>;

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>
          {user.name}
          <button onClick={() => deleteUser(user.id!)}>Видалити</button>
        </li>
      ))}
    </ul>
  );
};
```

### Компонент з автопланування

```typescript
import { useUsers, useSchedule, useAutoScheduler } from '@/hooks';

const ScheduleManager = () => {
  const { users } = useUsers();
  const { schedule, dayWeights, findGaps } = useSchedule(users);
  const { fillGaps, isProcessing } = useAutoScheduler(users, schedule, dayWeights);

  const handleFillGaps = async () => {
    const weekDates = ['2026-02-17', '2026-02-18', /* ... */];
    const gaps = findGaps(weekDates);

    await fillGaps(gaps, () => {
      alert('Прогалини заповнено!');
    });
  };

  return (
    <button onClick={handleFillGaps} disabled={isProcessing}>
      {isProcessing ? 'Обробка...' : 'Заповнити прогалини'}
    </button>
  );
};
```

### Експорт даних

```typescript
import { useExport } from '@/hooks';

const ExportButton = () => {
  const { exportData, needsExport, isProcessing } = useExport();

  return (
    <button
      onClick={exportData}
      disabled={isProcessing}
      className={needsExport ? 'btn-danger' : 'btn-secondary'}
    >
      {isProcessing ? 'Експорт...' : 'Експорт даних'}
      {needsExport && ' ⚠️'}
    </button>
  );
};
```

---

## 📊 Переваги хуків

### До (без хуків):

```typescript
const App = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = async () => {
    setLoading(true);
    const u = await db.users.toArray();
    u.sort((a, b) => {
      // 20 рядків логіки сортування
    });
    setUsers(u);
    setLoading(false);
  };

  const createUser = async (user) => {
    await db.users.add(user);
    await db.auditLog.add({
      /* ... */
    });
    await loadUsers();
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Ще 100+ рядків подібної логіки...
};
```

### Після (з хуками):

```typescript
const App = () => {
  const { users, loading, createUser } = useUsers();

  // Все! 1 рядок замість 100+
};
```

---

## 🔧 Статистика

```
Хуків створено:    5
Рядків коду:       ~850
Функцій експорто:  60+
Типізація:         100%
```

---

## 🚀 Наступні кроки

1. Оновити `App.tsx` для використання хуків
2. Оновити компоненти для використання хуків
3. Видалити дублікати коду
4. Протестувати функціональність

---

**Створено:** 2026-02-15  
**Версія:** 2.0.0
