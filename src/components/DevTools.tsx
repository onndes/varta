import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import { RANKS, DEFAULT_AUTO_SCHEDULE_OPTIONS } from '../utils/constants';
import type { User, UserStatusPeriod, ScheduleEntry, DayWeights } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { useDialog } from './useDialog';
import * as autoScheduler from '../services/autoScheduler';
import { countUserDaysOfWeek } from '../services/scheduleService';
import { computeUserLoadRate, calculateUserFairnessIndex } from '../services/autoScheduler';
import { daysSinceLastSameDowAssignment } from '../services/autoScheduler/helpers';

interface ScheduleStatsRow {
  name: string;
  total: number;
  dow: number[];
  repeatDow: number;
  fairness: number;
}

interface DevToolsProps {
  refreshData: () => Promise<void>;
}

const DevTools: React.FC<DevToolsProps> = ({ refreshData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [genCount, setGenCount] = useState(10);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [newAddedDate, setNewAddedDate] = useState<string>(toLocalISO(new Date()));
  const [isLoading, setIsLoading] = useState(false);
  const [genWeeks, setGenWeeks] = useState(4);
  const [scheduleStats, setScheduleStats] = useState<ScheduleStatsRow[] | null>(null);
  const [chaosLog, setChaosLog] = useState<string[]>([]);

  const loadUsers = useCallback(async () => {
    const all = await db.users.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setUsers(all);
    if (all.length > 0 && selectedUserId === '') {
      setSelectedUserId(all[0].id || '');
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleGenerate = async () => {
    const surnames = [
      'Коваленко',
      'Бондаренко',
      'Ткаченко',
      'Кравченко',
      'Шевченко',
      'Бойко',
      'Мельник',
      'Олійник',
      'Мороз',
      'Лисенко',
    ];
    const names = [
      'Іван',
      'Сергій',
      'Андрій',
      'Петро',
      'Тарас',
      'Василь',
      'Олег',
      'Микола',
      'Дмитро',
      'Олександр',
    ];
    const middles = ['Петрович', 'Іванович', 'Миколайович', 'Сергійович'];

    const newUsers: User[] = [];

    for (let i = 0; i < genCount; i++) {
      const sur = surnames[Math.floor(Math.random() * surnames.length)];
      const nam = names[Math.floor(Math.random() * names.length)];
      const mid = middles[Math.floor(Math.random() * middles.length)];

      newUsers.push({
        name: `${sur} ${nam} ${mid}`,
        rank: RANKS[Math.floor(Math.random() * RANKS.length)],
        status: 'ACTIVE',
        isActive: true,
        note: '',
        debt: 0.0,
        owedDays: {},
      });
    }

    await db.users.bulkAdd(newUsers);
    await showAlert(`Згенеровано ${genCount} бійців`);
    await refreshData();
    await loadUsers();
  };

  const handleSetAddedDate = async () => {
    if (!selectedUserId) return;
    if (!newAddedDate) {
      await showAlert('Оберіть дату');
      return;
    }

    await db.users.update(selectedUserId, { dateAddedToAuto: newAddedDate });
    const user = users.find((u) => u.id === selectedUserId);
    await showAlert(`Оновлено dateAddedToAuto: ${user?.name || 'Боєць'} -> ${newAddedDate}`);
    await refreshData();
    await loadUsers();
  };

  const handleWipe = async () => {
    if (await showConfirm('УВАГА! Це видалить ВСЮ базу даних безповоротно. Продовжити?')) {
      await db.delete();
      window.location.reload();
    }
  };

  // ── Scenario helpers ──────────────────────────────────────────────────────

  const relDate = (offsetDays: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return toLocalISO(d);
  };

  const runScenario = async (name: string, run: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await db.users.clear();
      await db.schedule.clear();
      await run();
      await refreshData();
      await loadUsers();
      await showAlert(`Сценарій завантажено: ${name}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScenario1 = () =>
    runScenario('Стандартна група (7 осіб)', async () => {
      const base: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Кравченко Петро Сергійович',
          rank: 'Молодший сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Шевченко Тарас Іванович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Мельник Василь Петрович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Олійник Дмитро Андрійович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      await db.users.bulkAdd(base as User[]);
    });

  const handleScenario2 = () =>
    runScenario('Відпустки та відрядження (8 осіб)', async () => {
      const vacPeriod: UserStatusPeriod = {
        status: 'VACATION',
        from: relDate(2),
        to: relDate(9),
        restBefore: false,
        restAfter: true,
      };
      const tripPeriod: UserStatusPeriod = {
        status: 'TRIP',
        from: relDate(-1),
        to: relDate(5),
        restBefore: false,
        restAfter: false,
      };
      const sickPeriod: UserStatusPeriod = {
        status: 'SICK',
        from: relDate(0),
        to: relDate(3),
        restBefore: false,
        restAfter: false,
      };
      const users2: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Кравченко Петро Сергійович',
          rank: 'Молодший сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Шевченко Тарас Іванович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Мороз Олег Миколайович',
          rank: 'Солдат',
          status: 'VACATION',
          isActive: true,
          debt: 0,
          owedDays: {},
          statusPeriods: [vacPeriod],
        },
        {
          name: 'Лисенко Микола Петрович',
          rank: 'Старший солдат',
          status: 'TRIP',
          isActive: true,
          debt: 0,
          owedDays: {},
          statusPeriods: [tripPeriod],
        },
        {
          name: 'Гриценко Василь Андрійович',
          rank: 'Сержант',
          status: 'SICK',
          isActive: true,
          debt: 0,
          owedDays: {},
          statusPeriods: [sickPeriod],
        },
      ];
      await db.users.bulkAdd(users2 as User[]);
    });

  const handleScenario3 = () =>
    runScenario('Заблоковані дні (6 осіб)', async () => {
      const users3: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          blockedDays: [1, 2],
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          blockedDays: [6, 7],
        },
        {
          name: 'Кравченко Петро Сергійович',
          rank: 'Молодший сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
          blockedDays: [5],
        },
        {
          name: 'Шевченко Тарас Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Мельник Василь Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      await db.users.bulkAdd(users3 as User[]);
    });

  const handleScenario4 = () =>
    runScenario('Несумісні пари (6 осіб)', async () => {
      // Step 1: insert without incompatibleWith
      const base4: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Кравченко Петро Сергійович',
          rank: 'Молодший сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Шевченко Тарас Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Мельник Василь Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      const insertedIds = (await db.users.bulkAdd(base4 as User[], { allKeys: true })) as number[];
      // Step 2: fetch by name to resolve IDs for incompatible pairs
      const [id2, id3, id5, id6] = [insertedIds[1], insertedIds[2], insertedIds[4], insertedIds[5]];
      await db.users.update(id2, { incompatibleWith: [id3] });
      await db.users.update(id3, { incompatibleWith: [id2] });
      await db.users.update(id5, { incompatibleWith: [id6] });
      await db.users.update(id6, { incompatibleWith: [id5] });
    });

  const handleScenario5 = () =>
    runScenario('Мала група (3 особи)', async () => {
      const users5: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
      ];
      await db.users.bulkAdd(users5 as User[]);
    });

  const handleScenario6 = () =>
    runScenario('Борги та карма (6 осіб)', async () => {
      const users6: Omit<User, 'id'>[] = [
        {
          name: 'Коваленко Іван Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: -3.0,
          owedDays: { 5: 2 },
        },
        {
          name: 'Бондаренко Сергій Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: -1.5,
          owedDays: { 1: 1 },
        },
        {
          name: 'Ткаченко Андрій Миколайович',
          rank: 'Старший солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Кравченко Петро Сергійович',
          rank: 'Молодший сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: 2.0,
          owedDays: {},
        },
        {
          name: 'Шевченко Тарас Іванович',
          rank: 'Солдат',
          status: 'ACTIVE',
          isActive: true,
          debt: 0,
          owedDays: {},
        },
        {
          name: 'Мельник Василь Петрович',
          rank: 'Сержант',
          status: 'ACTIVE',
          isActive: true,
          debt: -0.5,
          owedDays: { 3: 1 },
        },
      ];
      await db.users.bulkAdd(users6 as User[]);
    });

  // ── Block 1: Schedule generator ─────────────────────────────────────────

  const handleGenerateSchedule = async () => {
    setIsLoading(true);
    try {
      const currentUsers = await db.users.toArray();
      if (currentUsers.length === 0) {
        await showAlert('Спочатку завантажте сценарій');
        return;
      }
      await db.schedule.clear();
      const allDates: string[] = [];
      const cursor = new Date();
      for (let i = 0; i < genWeeks * 7; i++) {
        allDates.push(toLocalISO(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      const dayWeights: DayWeights = { 0: 1.5, 1: 1.0, 2: 1.0, 3: 1.0, 4: 1.0, 5: 1.5, 6: 2.0 };
      const currentSchedule: Record<string, ScheduleEntry> = {};
      for (let w = 0; w < genWeeks; w++) {
        const weekDates = allDates.slice(w * 7, w * 7 + 7);
        const updates = await autoScheduler.autoFillSchedule(
          weekDates,
          currentUsers,
          currentSchedule,
          dayWeights,
          1,
          DEFAULT_AUTO_SCHEDULE_OPTIONS,
          false
        );
        await autoScheduler.saveAutoSchedule(updates, dayWeights);
        for (const e of updates) currentSchedule[e.date] = e;
      }
      const todayStr = toLocalISO(new Date());
      const rows: ScheduleStatsRow[] = currentUsers
        .filter((u) => u.isActive && !u.isExtra && !u.excludeFromAuto)
        .map((u) => {
          const dowCounts = countUserDaysOfWeek(u.id!, currentSchedule);
          const dow = [0, 1, 2, 3, 4, 5, 6].map((d) => dowCounts[d] || 0);
          const total = dow.reduce((a, b) => a + b, 0);
          const sortedDates = Object.keys(currentSchedule)
            .filter((d) => {
              const ids = currentSchedule[d].userId;
              return Array.isArray(ids) ? ids.includes(u.id!) : ids === u.id;
            })
            .sort();
          let repeatDow = 0;
          for (let i = 1; i < sortedDates.length; i++) {
            const d1 = new Date(sortedDates[i - 1]);
            const d2 = new Date(sortedDates[i]);
            const gap = (d2.getTime() - d1.getTime()) / 86400000;
            if (gap === 7 && d1.getDay() === d2.getDay()) repeatDow++;
          }
          void daysSinceLastSameDowAssignment; // imported for future use
          void computeUserLoadRate;
          const fairness = calculateUserFairnessIndex(
            u.id!,
            currentUsers,
            currentSchedule,
            dayWeights,
            todayStr
          );
          const parts = u.name.split(' ');
          return { name: parts[0] + ' ' + (parts[1] || ''), total, dow, repeatDow, fairness };
        })
        .sort((a, b) => b.total - a.total);
      setScheduleStats(rows);
      await refreshData();
    } finally {
      setIsLoading(false);
    }
  };

  // ── Block 2: Quick user status editor ────────────────────────────────────

  const applyUserPatch = async (patch: Partial<User>) => {
    if (!selectedUserId) return;
    await db.users.update(selectedUserId, patch);
    await refreshData();
    await loadUsers();
  };

  const handleQuickVacation = async (days: number) => {
    const user = await db.users.get(selectedUserId as number);
    if (!user) return;
    const period: UserStatusPeriod = {
      status: 'VACATION',
      from: relDate(0),
      to: relDate(days),
      restBefore: false,
      restAfter: true,
    };
    await applyUserPatch({ statusPeriods: [...(user.statusPeriods || []), period] });
  };

  const handleQuickTrip = async (days: number) => {
    const user = await db.users.get(selectedUserId as number);
    if (!user) return;
    const period: UserStatusPeriod = {
      status: 'TRIP',
      from: relDate(0),
      to: relDate(days),
      restBefore: false,
      restAfter: false,
    };
    await applyUserPatch({ statusPeriods: [...(user.statusPeriods || []), period] });
  };

  const handleQuickSick = async (days: number) => {
    const user = await db.users.get(selectedUserId as number);
    if (!user) return;
    const period: UserStatusPeriod = {
      status: 'SICK',
      from: relDate(0),
      to: relDate(days),
      restBefore: false,
      restAfter: false,
    };
    await applyUserPatch({ statusPeriods: [...(user.statusPeriods || []), period] });
  };

  const handleQuickBlockWeekend = () => applyUserPatch({ blockedDays: [6, 7] });

  const handleQuickReset = () => applyUserPatch({ statusPeriods: [], blockedDays: undefined });

  // ── Block 3: Chaos mode ───────────────────────────────────────────────────

  const DOW_NAMES_UA = [
    'неділю',
    'понеділок',
    'вівторок',
    'середу',
    'четвер',
    'п\u2019ятницю',
    'суботу',
  ];

  const handleChaos = async () => {
    const all = await db.users.toArray();
    const active = all.filter((u) => u.isActive && !u.isExtra);
    if (active.length < 2) {
      await showAlert('Потрібно мінімум 2 бійці');
      return;
    }
    const log: string[] = [];
    for (const user of active) {
      const patch: Partial<User> = {};
      const periods: UserStatusPeriod[] = [...(user.statusPeriods || [])];
      const r = Math.random;
      if (r() < 0.2) {
        const start = Math.floor(r() * 10) + 1;
        const dur = Math.floor(r() * 12) + 3;
        periods.push({
          status: 'VACATION',
          from: relDate(start),
          to: relDate(start + dur),
          restBefore: false,
          restAfter: true,
        });
        log.push(
          `${user.name.split(' ')[0]}: відпустка з ${relDate(start)} по ${relDate(start + dur)}`
        );
      }
      if (r() < 0.15) {
        const start = Math.floor(r() * 7);
        const dur = Math.floor(r() * 6) + 2;
        periods.push({
          status: 'TRIP',
          from: relDate(start),
          to: relDate(start + dur),
          restBefore: false,
          restAfter: false,
        });
        log.push(
          `${user.name.split(' ')[0]}: відрядження з ${relDate(start)} по ${relDate(start + dur)}`
        );
      }
      if (r() < 0.1) {
        const dur = Math.floor(r() * 5) + 1;
        periods.push({
          status: 'SICK',
          from: relDate(0),
          to: relDate(dur),
          restBefore: false,
          restAfter: false,
        });
        log.push(`${user.name.split(' ')[0]}: лікарняний до ${relDate(dur)}`);
      }
      if (periods.length !== (user.statusPeriods || []).length) patch.statusPeriods = periods;
      if (r() < 0.15) {
        const dow = Math.floor(r() * 7) + 1;
        const blocked = [...(user.blockedDays || []), dow];
        patch.blockedDays = [...new Set(blocked)];
        log.push(`${user.name.split(' ')[0]}: заблоковано ${DOW_NAMES_UA[dow % 7]}`);
      }
      if (r() < 0.1) {
        const newDebt = -(Math.random() * 3);
        patch.debt = parseFloat(newDebt.toFixed(1));
        log.push(`${user.name.split(' ')[0]}: борг ${patch.debt}`);
      }
      if (Object.keys(patch).length > 0) {
        await db.users.update(user.id!, patch);
      }
    }
    setChaosLog(log.length > 0 ? log : ['Нічого не змінилося (не пощастило з кубиком)']);
    await refreshData();
    await loadUsers();
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-7">
        <div className="card shadow-sm border-danger">
          <div className="card-header bg-danger text-white fw-bold">
            <i className="fas fa-exclamation-triangle me-2"></i>Інструменти Розробника
          </div>
          <div className="card-body">
            <h6 className="fw-bold">Генератор даних</h6>
            <div className="input-group mb-3">
              <input
                type="number"
                className="form-control"
                value={genCount}
                onChange={(e) => setGenCount(parseInt(e.target.value))}
              />
              <button className="btn btn-outline-primary" onClick={handleGenerate}>
                Створити бійців
              </button>
            </div>
            <hr />
            <h6 className="fw-bold">Тест метрики доступності</h6>
            <div className="mb-2 small text-muted">
              Змінює дату включення бійця в авточергу (`dateAddedToAuto`), щоб швидко перевірити
              статистику без редагування backup-файлу.
            </div>
            <div className="mb-2">
              <label className="form-label small mb-1">Боєць</label>
              <select
                className="form-select form-select-sm"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
              >
                {users.length === 0 ? (
                  <option value="">Немає користувачів</option>
                ) : (
                  users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="input-group input-group-sm mb-3">
              <span className="input-group-text">Дата додавання</span>
              <input
                type="date"
                className="form-control"
                value={newAddedDate}
                onChange={(e) => setNewAddedDate(e.target.value)}
              />
              <button
                className="btn btn-outline-secondary"
                onClick={handleSetAddedDate}
                disabled={!selectedUserId || users.length === 0}
              >
                Застосувати
              </button>
            </div>

            <hr />
            <h6 className="fw-bold">Тестові сценарії</h6>
            <div className="small text-muted mb-2">
              Кожна кнопка очищає базу і завантажує готовий набір для тестування.
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-success btn-sm w-100"
                onClick={handleScenario1}
                disabled={isLoading}
              >
                Стандартна група (7 осіб)
              </button>
              <div className="small text-muted mt-1">Базовий тест планувальника без обмежень</div>
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-success btn-sm w-100"
                onClick={handleScenario2}
                disabled={isLoading}
              >
                Відпустки та відрядження (8 осіб)
              </button>
              <div className="small text-muted mt-1">8 осіб, 3 у статусі на найближчі 2 тижні</div>
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-success btn-sm w-100"
                onClick={handleScenario3}
                disabled={isLoading}
              >
                Заблоковані дні (6 осіб)
              </button>
              <div className="small text-muted mt-1">
                6 осіб з різними заблокованими днями тижня
              </div>
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-warning btn-sm w-100"
                onClick={handleScenario4}
                disabled={isLoading}
              >
                Несумісні пари (6 осіб)
              </button>
              <div className="small text-muted mt-1">
                6 осіб, 2 несумісні пари (не ставити поряд)
              </div>
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-warning btn-sm w-100"
                onClick={handleScenario5}
                disabled={isLoading}
              >
                Мала група (3 особи)
              </button>
              <div className="small text-muted mt-1">
                Тест граничних випадків: forceUseAll, look-ahead
              </div>
            </div>
            <div className="mb-2">
              <button
                className="btn btn-outline-danger btn-sm w-100"
                onClick={handleScenario6}
                disabled={isLoading}
              >
                Борги та карма (6 осіб)
              </button>
              <div className="small text-muted mt-1">6 осіб з різними боргами та owedDays</div>
            </div>

            <hr />
            {/* ── Block 1: Schedule generator ── */}
            <h6 className="fw-bold">Генератор графіка</h6>
            <div className="small text-muted mb-2">
              Генерує розклад від сьогодні на вказану кількість тижнів. Імітує щотижневе натискання
              кнопки «Генерація тижня».
            </div>
            <div className="input-group input-group-sm mb-2">
              <span className="input-group-text">Тижнів:</span>
              <input
                type="number"
                className="form-control"
                min={1}
                max={52}
                value={genWeeks}
                onChange={(e) => setGenWeeks(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button
                className="btn btn-outline-success"
                onClick={handleGenerateSchedule}
                disabled={isLoading}
              >
                ▶ Згенерувати та показати статистику
              </button>
            </div>
            {scheduleStats !== null &&
              (() => {
                const totalAssigned = scheduleStats.reduce((s, r) => s + r.total, 0);
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="table table-sm table-bordered small mt-2">
                      <thead className="table-light">
                        <tr>
                          <th>Боєць</th>
                          <th>Всього</th>
                          <th>Нд</th>
                          <th>Пн</th>
                          <th>Вт</th>
                          <th>Ср</th>
                          <th>Чт</th>
                          <th>Пт</th>
                          <th>Сб</th>
                          <th>Повтори</th>
                          <th>Fairness</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleStats.map((row, i) => {
                          const minDow = Math.min(...row.dow);
                          const maxDow = Math.max(...row.dow);
                          const fairPct = Math.round(row.fairness * 100);
                          const fairCls =
                            fairPct >= 85
                              ? 'text-success'
                              : fairPct >= 70
                                ? 'text-warning'
                                : 'text-danger';
                          return (
                            <tr key={i}>
                              <td>{row.name}</td>
                              <td className="fw-bold">{row.total}</td>
                              {row.dow.map((cnt, di) => {
                                const isMin = cnt === minDow;
                                const isBad = cnt === maxDow && maxDow > minDow + 1;
                                return (
                                  <td
                                    key={di}
                                    style={{
                                      color: isBad ? '#dc3545' : isMin ? '#198754' : undefined,
                                    }}
                                  >
                                    {cnt}
                                  </td>
                                );
                              })}
                              <td>
                                {row.repeatDow > 0 ? (
                                  <span className="badge bg-danger">{row.repeatDow}</span>
                                ) : (
                                  <span className="text-muted">0</span>
                                )}
                              </td>
                              <td className={fairCls}>{fairPct}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="small text-muted">Всього призначено: {totalAssigned}</div>
                  </div>
                );
              })()}

            <hr />
            {/* ── Block 2: Quick user status editor ── */}
            <h6 className="fw-bold">Швидкий редактор бійця</h6>
            <div className="small text-muted mb-2">
              Додати статус або заблокувати день без відкриття модалки.
            </div>
            <div className="mb-2">
              <select
                className="form-select form-select-sm mb-2"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
              >
                {users.length === 0 ? (
                  <option value="">Немає користувачів</option>
                ) : (
                  users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))
                )}
              </select>
              <div className="d-flex flex-wrap gap-1">
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => handleQuickVacation(7)}
                  disabled={isLoading || !selectedUserId}
                >
                  🏖 Відпустка 7д
                </button>
                <button
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => handleQuickTrip(5)}
                  disabled={isLoading || !selectedUserId}
                >
                  ✈ Відрядження 5д
                </button>
                <button
                  className="btn btn-outline-warning btn-sm"
                  onClick={() => handleQuickSick(3)}
                  disabled={isLoading || !selectedUserId}
                >
                  🤒 Лікарняний 3д
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={handleQuickBlockWeekend}
                  disabled={isLoading || !selectedUserId}
                >
                  🚫 Блок вихідних
                </button>
                <button
                  className="btn btn-outline-danger btn-sm"
                  onClick={handleQuickReset}
                  disabled={isLoading || !selectedUserId}
                >
                  ↺ Скинути статуси
                </button>
              </div>
            </div>

            <hr />
            {/* ── Block 3: Chaos mode ── */}
            <h6 className="fw-bold">Хаос-режим 🎲</h6>
            <div className="small text-muted mb-2">
              Випадково додає статуси та обмеження поточним бійцям.
            </div>
            <button
              className="btn btn-outline-danger btn-sm w-100"
              onClick={handleChaos}
              disabled={isLoading}
            >
              🎲 Випадковий хаос
            </button>
            {chaosLog.length > 0 && (
              <div
                className="small text-muted border rounded p-2 mt-1"
                style={{ maxHeight: 120, overflowY: 'auto' }}
              >
                {chaosLog.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}

            <hr />
            <h6 className="fw-bold text-danger">Небезпечна зона</h6>
            <button className="btn btn-danger w-100 py-2" onClick={handleWipe}>
              <i className="fas fa-bomb me-2"></i>ПОВНЕ ОЧИЩЕННЯ БАЗИ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DevTools;
