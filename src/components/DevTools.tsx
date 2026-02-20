import React, { useEffect, useState } from 'react';
import { db } from '../db/db';
import { RANKS } from '../utils/constants';
import type { User } from '../types';
import { toLocalISO } from '../utils/dateUtils';

interface DevToolsProps {
  refreshData: () => Promise<void>;
}

const DevTools: React.FC<DevToolsProps> = ({ refreshData }) => {
  const [genCount, setGenCount] = useState(10);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [newAddedDate, setNewAddedDate] = useState<string>(toLocalISO(new Date()));

  const loadUsers = async () => {
    const all = await db.users.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setUsers(all);
    if (all.length > 0 && selectedUserId === '') {
      setSelectedUserId(all[0].id || '');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

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
    alert(`Згенеровано ${genCount} бійців`);
    await refreshData();
    await loadUsers();
  };

  const handleSetAddedDate = async () => {
    if (!selectedUserId) return;
    if (!newAddedDate) {
      alert('Оберіть дату');
      return;
    }

    await db.users.update(selectedUserId, { dateAddedToAuto: newAddedDate });
    const user = users.find((u) => u.id === selectedUserId);
    alert(
      `Оновлено dateAddedToAuto: ${user?.name || 'Боєць'} -> ${newAddedDate}`
    );
    await refreshData();
    await loadUsers();
  };

  const handleWipe = async () => {
    if (confirm('УВАГА! Це видалить ВСЮ базу даних безповоротно. Продовжити?')) {
      await db.delete();
      window.location.reload();
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-6 col-lg-4">
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
