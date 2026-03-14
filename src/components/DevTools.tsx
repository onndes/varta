import React, { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import { RANKS } from '../utils/constants';
import type { User, UserStatusPeriod } from '../types';
import { toLocalISO } from '../utils/dateUtils';
import { useDialog } from './useDialog';

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

  const loadUsers = useCallback(async () => {
    const all = await db.users.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setUsers(all);
    if (all.length > 0 && selectedUserId === '') {
      setSelectedUserId(all[0].id || '');
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadUsers(); // eslint-disable-line react-hooks/set-state-in-effect -- Initial data fetch on mount
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
