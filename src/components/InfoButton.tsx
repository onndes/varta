import React, { useState } from 'react';
import Modal from './Modal';

const InfoButton: React.FC = () => {
  const [show, setShow] = useState(false);

  return (
    <>
      <button
        className="btn btn-link text-muted p-0 ms-2 info-btn-subtle"
        onClick={() => setShow(true)}
        title="Про систему"
        style={{
          opacity: 0.35,
          fontSize: '0.85rem',
          transition: 'opacity 0.2s',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.35')}
      >
        <i className="fas fa-info-circle"></i>
      </button>

      <Modal show={show} onClose={() => setShow(false)} title="Про систему ВАРТА" size="modal-lg">
        <div style={{ maxHeight: '70vh', overflowY: 'auto', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <p className="text-muted mb-3">
            <strong>ВАРТА</strong> — система автоматичного та справедливого розподілу добових
            чергувань у невеликому колективі (2–100 осіб). Працює повністю офлайн (PWA), дані
            зберігаються локально в IndexedDB (Dexie.js).
          </p>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-bullseye me-2 text-primary"></i>Основні цілі
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Повне закриття змін</strong> — кожен день має бути забезпечений черговим, якщо
              це фізично можливо.
            </li>
            <li>
              <strong>Максимальна справедливість</strong> — у довгостроковій перспективі усі мають
              приблизно рівну кількість чергувань та збалансований розподіл по днях тижня.
            </li>
            <li>
              <strong>Пріоритет ручних рішень</strong> — автоматика лише пропонує оптимальний
              графік, остаточне слово завжди за адміністратором.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-cogs me-2 text-primary"></i>Принципи алгоритму
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Пріоритет закриття днів</strong> — якщо є хоча б один доступний — система
              призначає чергового. Пропуск зміни неприпустимий.
            </li>
            <li>
              <strong>Балансировка навантаження</strong> — кожен день тижня має свою «вагу», яка
              відображає складність чергування. Ваги налаштовуються адміністратором у розділі
              «Налаштування» відповідно до потреб колективу.
            </li>
            <li>
              <strong>Принцип «драбини»</strong> — список чергувань плавно зміщується від тижня до
              тижня, щоб кожен чергував у різні дні.
            </li>
            <li>
              <strong>Заборона послідовних чергувань</strong> — система ніколи не ставить людину на
              два чергування поспіль. Наступний день після добового чергування — «відсипний».
            </li>
            <li>
              <strong>Urgency Score</strong> — пріоритет підвищується для тих, хто має «борг» (див.
              нижче).
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-ban me-2 text-danger"></i>Обмеження та доступність
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Відпустка / лікарняний</strong> — жорсткий блок, чергування неможливе.
            </li>
            <li>
              <strong>«Відсипний»</strong> — день після чергування автоматично заблокований.
            </li>
            <li>
              <strong>Службова заборона</strong> — командировка, важливе завдання тощо. Борг не
              нараховується.
            </li>
            <li>
              <strong>Ручний блок</strong> — адміністратор може заблокувати будь-який день для
              будь-якого співробітника.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-balance-scale me-2 text-warning"></i>Механізм «боргів» і карми
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Нарахування боргу</strong> — борг з'являється лише при знятті «за проханням»
              (особисті обставини). Розмір боргу залежить від ваги дня: чим важчий день — тим
              більший борг.
            </li>
            <li>
              <strong>Знаття «по роботі»</strong> (відпустка, командировка, хвороба) — борг НЕ
              нараховується.
            </li>
            <li>
              <strong>Погашення боргу</strong> — борг зменшується, коли алгоритм призначає
              співробітника на чергування з урахуванням підвищеного пріоритету.
            </li>
            <li>
              <strong>Максимальний борг</strong> — обмежений настроюваним значенням (за
              замовчуванням 4.0).
            </li>
            <li>
              <strong>«Карма»</strong> — якщо керівник вручну переміщує співробітника на день з
              більшою вагою, це фіксується як позитивна карма і компенсується в майбутніх графіках.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-exclamation-triangle me-2 text-danger"></i>Спеціальні випадки
          </h6>
          <ul className="mb-3">
            <li>
              <strong>&lt; 2 особи</strong> — система попереджає про неможливість побудови графіка.
            </li>
            <li>
              <strong>2 особи</strong> — чергування через день, без складної логіки.
            </li>
            <li>
              <strong>3+ осіб</strong> — повний зважений алгоритм з боргами та «драбиною».
            </li>
            <li>
              <strong>is_extra</strong> — спеціальні учасники (стажери, водії) не беруть участі в
              авторозподілі, призначаються лише вручну.
            </li>
            <li>
              <strong>Новий співробітник</strong> — «чистий рахунок», без боргів.
            </li>
            <li>
              <strong>Вибулий</strong> — показники обнулюються, історія зберігається в логах.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-calendar-times me-2 text-danger"></i>Критичні дні («червоні»)
          </h6>
          <p className="mb-3">
            Якщо на день немає жодного доступного кандидата — день позначається як{' '}
            <span className="badge bg-danger">критичний</span>. У комірці з'являється знак питання,
            при кліку показується список усіх з причинами недоступності. Ручне призначення можливе
            лише з явним підтвердженням адміністратора.
          </p>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-history me-2 text-info"></i>Журнал змін (Audit Log)
          </h6>
          <ul className="mb-3">
            <li>Усі дії зберігаються: знаття, перенесення, ручні призначення.</li>
            <li>Фіксується хто, коли, чому та які борги нараховані/списані.</li>
            <li>Вкладка «Журнал» для перегляду історії змін.</li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-desktop me-2 text-primary"></i>Інтерфейс
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Тижнева сітка</strong> — таблиця Пн–Нд з інтерактивними діями (переміщення,
              модальні вікна).
            </li>
            <li>
              <strong>Візуалізація навантаження</strong> — індикатор поряд з кожним прізвищем.
            </li>
            <li>
              <strong>Діалог «Зняти з чергування»</strong> — «По роботі» (без боргу) або «За
              проханням» (з боргом).
            </li>
            <li>
              <strong>Drag & Drop</strong> — перенесення чергувань між днями.
            </li>
            <li>
              <strong>Статистика</strong> — кількість чергувань, розподіл по днях, борг, вага,
              карма.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-print me-2 text-secondary"></i>Експорт і друк
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Excel (.xlsx)</strong> — вивантаження графіка.
            </li>
            <li>
              <strong>Друк / PDF</strong> — CSS @media print, формат A4 альбомна. Блок «ЗАТВЕРДЖУЮ»,
              підписи.
            </li>
            <li>
              <strong>JSON</strong> — імпорт/експорт даних для переносу між пристроями. Кнопка
              експорту змінює колір, якщо дані не збережені &gt; 3 дні.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-server me-2 text-secondary"></i>Технічний стек
          </h6>
          <ul className="mb-3">
            <li>React + TypeScript + Bootstrap 5.3</li>
            <li>Dexie.js (IndexedDB) — повністю офлайн, PWA</li>
            <li>Vite — збірка та dev-сервер</li>
            <li>Vitest — тестування</li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-th-list me-2 text-primary"></i>Вкладки
          </h6>
          <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
            <tbody>
              <tr>
                <td className="fw-bold" style={{ width: '140px' }}>
                  Графік
                </td>
                <td>
                  Тижневий розклад чергувань з можливістю ручного редагування, авторозподіл,
                  каскадна перебудова.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Особовий склад</td>
                <td>
                  Управління списком співробітників: додавання, редагування, статуси (відпустка,
                  хвороба, відрядження), блокування днів.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Статистика</td>
                <td>
                  Зведена таблиця: кількість чергувань, розподіл по днях тижня, борг, вага днів,
                  карма.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Налаштування</td>
                <td>
                  Ваги днів, кількість чергових на день, підписанти для друку (командир, укладач).
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Журнал</td>
                <td>Повна історія всіх дій у системі з фільтрацією.</td>
              </tr>
            </tbody>
          </table>

          <div
            className="text-muted text-center mt-4 pt-3 border-top"
            style={{ fontSize: '0.8rem' }}
          >
            ВАРТА v1.0 · Офлайн-система розподілу чергувань · 2025–2026
          </div>
        </div>
      </Modal>
    </>
  );
};

export default InfoButton;
