import React, { useState } from 'react';
import { db } from '../db/db';
import { RANKS } from '../utils/constants';
import type { User } from '../types';

interface DevToolsProps {
  refreshData: () => Promise<void>;
}

const DevTools: React.FC<DevToolsProps> = ({ refreshData }) => {
  const [genCount, setGenCount] = useState(10);

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
    refreshData();
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
