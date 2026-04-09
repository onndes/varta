// src/components/InfoModalContent.tsx — static informational content for the help modal
import React, { useState } from 'react';
import { CellLegendTable, IconLegendTable, TabsTable } from './InfoLegendTables';

type HelpSection =
  | 'about'
  | 'quickstart'
  | 'schedule'
  | 'users'
  | 'stats'
  | 'settings'
  | 'print'
  | 'data'
  | 'legend'
  | 'tech';

const SECTIONS: { key: HelpSection; icon: string; label: string }[] = [
  { key: 'about', icon: 'fa-info-circle', label: 'Про систему' },
  { key: 'quickstart', icon: 'fa-rocket', label: 'Швидкий старт' },
  { key: 'schedule', icon: 'fa-calendar-days', label: 'Графік' },
  { key: 'users', icon: 'fa-users', label: 'Особовий склад' },
  { key: 'stats', icon: 'fa-chart-bar', label: 'Статистика' },
  { key: 'settings', icon: 'fa-cogs', label: 'Налаштування' },
  { key: 'print', icon: 'fa-print', label: 'Друк та Excel' },
  { key: 'data', icon: 'fa-database', label: 'Дані та бекапи' },
  { key: 'legend', icon: 'fa-border-all', label: 'Легенда' },
  { key: 'tech', icon: 'fa-microchip', label: 'Технічне' },
];

/** Shortcut badge */
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd
    style={{
      display: 'inline-block',
      padding: '1px 7px',
      fontSize: '0.8em',
      fontFamily: 'inherit',
      fontWeight: 600,
      lineHeight: '1.6',
      borderRadius: 4,
      border: '1px solid #8a9199',
      background: '#2e3338',
      color: '#e8edf2',
      boxShadow: '0 1px 0 #111',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </kbd>
);

/* ────────────────── Individual sections ────────────────── */

const AboutSection: React.FC = () => (
  <>
    <p className="text-muted mb-3">
      <strong>ВАРТА</strong> — система автоматичного та справедливого розподілу добових чергувань
      для військових підрозділів (2–100 осіб). Працює повністю офлайн — дані зберігаються локально
      на пристрої, жодна інформація не передається в інтернет.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-bullseye me-2 text-primary"></i>Основні цілі
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Повне закриття змін</strong> — кожен день має бути забезпечений черговим, якщо це
        фізично можливо.
      </li>
      <li>
        <strong>Максимальна справедливість</strong> — у довгостроковій перспективі всі мають
        приблизно рівну кількість чергувань та збалансований розподіл по днях тижня.
      </li>
      <li>
        <strong>Пріоритет ручних рішень</strong> — автоматика лише пропонує оптимальний графік,
        остаточне слово завжди за адміністратором.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-cogs me-2 text-primary"></i>Як працює алгоритм
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Принцип «драбини»</strong> — список чергувань плавно зміщується від тижня до тижня,
        щоб кожен чергував у різні дні.
      </li>
      <li>
        <strong>Балансування навантаження</strong> — кожен день тижня має свою «вагу» (складність).
        Алгоритм вирівнює загальне навантаження між усіма.
      </li>
      <li>
        <strong>Заборона послідовних чергувань</strong> — система ніколи не ставить людину на два
        чергування поспіль. Наступний день — «відсипний».
      </li>
      <li>
        <strong>DOW-ротація</strong> — алгоритм уникає того, щоб одна особа стояла в один і той
        самий день тижня два тижні поспіль.
      </li>
      <li>
        <strong>Двопрохідна оптимізація</strong> — спочатку «жадібний» розподіл, потім свопи для
        мінімізації відхилень від ідеалу.
      </li>
    </ul>
  </>
);

const QuickStartSection: React.FC = () => (
  <>
    <div className="alert alert-info py-2 small mb-3">
      <i className="fas fa-lightbulb me-1"></i>
      Мінімальний шлях від встановлення до першого графіка.
    </div>

    <ol className="mb-3">
      <li className="mb-2">
        <strong>Додайте особовий склад</strong> — перейдіть у вкладку{' '}
        <i className="fas fa-users me-1"></i>
        <em>Особовий склад</em> і створіть усіх чергових (ім'я, звання). Мінімум 2 особи.
      </li>
      <li className="mb-2">
        <strong>Вкажіть статуси</strong> — відпустка, лікарняний, відрядження та інші відсутності.
        Можна задати періоди наперед.
      </li>
      <li className="mb-2">
        <strong>Перейдіть у Графік</strong> — на потрібному тижні натисніть кнопку{' '}
        <i className="fas fa-magic me-1"></i>
        <strong>«Згенерувати»</strong> (або клавішу <Kbd>G</Kbd>). Система автоматично створить
        оптимальний розклад.
      </li>
      <li className="mb-2">
        <strong>Перевірте результат</strong> — натисніть <i className="fas fa-info-circle me-1"></i>
        на будь-якій клітинці, щоб побачити, чому саме цю особу обрано.
      </li>
      <li className="mb-2">
        <strong>Відкоригуйте вручну</strong> — клікніть на клітинку для заміни, або перетягніть
        прізвище мишкою (drag & drop).
      </li>
      <li className="mb-2">
        <strong>Збережіть бекап</strong> — натисніть <strong>«Експорт»</strong> у шапці, щоб
        зберегти дані у JSON-файл.
      </li>
    </ol>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-keyboard me-2 text-primary"></i>Гарячі клавіші
    </h6>
    <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
      <tbody>
        <tr>
          <td style={{ width: 150 }}>
            <Kbd>G</Kbd>
          </td>
          <td>Згенерувати графік на тиждень</td>
        </tr>
        <tr>
          <td>
            <Kbd>F</Kbd>
          </td>
          <td>Заповнити пропуски (незайняті дні)</td>
        </tr>
        <tr>
          <td>
            <Kbd>C</Kbd>
          </td>
          <td>Очистити тиждень</td>
        </tr>
        <tr>
          <td>
            <Kbd>←</Kbd> <Kbd>→</Kbd>
          </td>
          <td>Навігація між тижнями</td>
        </tr>
        <tr>
          <td>
            <Kbd>Ctrl+Z</Kbd>
          </td>
          <td>Скасувати останню дію</td>
        </tr>
        <tr>
          <td>
            <Kbd>Ctrl+Y</Kbd>
          </td>
          <td>Повторити скасовану дію</td>
        </tr>
        <tr>
          <td>
            <Kbd>Esc</Kbd>
          </td>
          <td>Вийти з режиму Zen</td>
        </tr>
      </tbody>
    </table>
  </>
);

const ScheduleSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-table-cells me-2 text-primary"></i>Тижнева сітка
    </h6>
    <p className="mb-3">
      Головний екран — таблиця Пн–Нд, де кожен рядок — особа, а кожна клітинка — день. Клітинки
      кольорово позначені: зелені = призначено, сірі = недоступний, червоні = конфлікт.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-magic me-2 text-success"></i>Автоматична генерація
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Згенерувати</strong> (<Kbd>G</Kbd>) — повна генерація тижня з нуля.
      </li>
      <li>
        <strong>Заповнити пропуски</strong> (<Kbd>F</Kbd>) — залишає існуючі призначення, заповнює
        лише порожні дні.
      </li>
      <li>
        <strong>Виправити конфлікти</strong> — автоматично замінює недоступних чергових. Для
        ручних винятків можна обрати <strong>«Залишити так»</strong>.
      </li>
      <li>
        <strong>Каскадна перебудова</strong> — перераховує графік від обраної дати до кінця. Корисно
        після зміни статусу чи складу.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-hand-pointer me-2 text-primary"></i>Ручне редагування
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Клік на клітинку</strong> — відкриває модальне вікно призначення з кількома
        режимами:
        <ul className="mt-1">
          <li>
            <em>Замінити</em> — обрати іншу особу або призначити вільну.
          </li>
          <li>
            <em>Обміняти</em> — обмін чергуваннями між двома особами.
          </li>
          <li>
            <em>Додати</em> — додати ще одного чергового (якщо дозволено кількість на день).
          </li>
          <li>
            <em>Зняти за проханням</em> — знімає з нарахуванням боргу.
          </li>
          <li>
            <em>Зняти за роботою</em> — знімає без боргу (хвороба, відрядження тощо).
          </li>
        </ul>
      </li>
      <li>
        <strong>Drag & Drop</strong> — перетягніть прізвище з однієї клітинки в іншу. Якщо цільова
        клітинка зайнята — відбудеться обмін. Система перевіряє відсипний, несумісність і ліміт на
        день.
      </li>
      <li>
        <strong>Примусове призначення</strong> — режим, що дозволяє ставити навіть на заблокований
        день (вихідний, статус, блок). Для виняткових ситуацій.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-eye me-2 text-info"></i>Превʼю (попередній перегляд)
    </h6>
    <p className="mb-3">
      Кнопка <i className="fas fa-eye me-1"></i> вмикає превʼю — система показує, як виглядатиме
      графік на наступних тижнях, без збереження. Кожен наступний тиждень будує графік на основі
      попереднього превʼю, імітуючи реальну генерацію.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-info-circle me-2 text-secondary"></i>Кнопка «і» на клітинці
    </h6>
    <p className="mb-3">
      Для кожного авто-призначення доступний лог рішення — пояснення, чому саме цю особу обрано, хто
      був відсіяний і за яким критерієм. Корисно для перевірки справедливості.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-undo me-2 text-secondary"></i>Скасування / Повтор
    </h6>
    <p className="mb-3">
      Система зберігає до 25 кроків історії. <Kbd>Ctrl+Z</Kbd> — скасувати, <Kbd>Ctrl+Y</Kbd> —
      повторити. Кожна дія підписана (що саме відбулось).
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-compass me-2 text-primary"></i>Навігація
    </h6>
    <ul className="mb-3">
      <li>
        Кнопки ← / → або клавіші <Kbd>←</Kbd> <Kbd>→</Kbd> — тиждень вперед/назад.
      </li>
      <li>Кнопка «Сьогодні» — повернення до поточного тижня.</li>
      <li>Візуальна стрічка тижнів із позначенням заповнених, порожніх і поточного.</li>
      <li>
        <strong>Zen-режим</strong> — розгортає графік на весь екран, ховає бічну панель. Вихід —{' '}
        <Kbd>Esc</Kbd>.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-filter me-2 text-primary"></i>Фільтри відображення
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Всі</strong> — показувати всіх осіб.
      </li>
      <li>
        <strong>Доступні</strong> — лише ті, хто може чергувати цього тижня.
      </li>
      <li>
        <strong>Призначені</strong> — лише ті, хто вже має чергування.
      </li>
    </ul>
  </>
);

const UsersSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-user-plus me-2 text-success"></i>Управління складом
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Додати</strong> — ім'я, звання, категорія. Мінімум 2 особи для генерації графіка.
      </li>
      <li>
        <strong>Редагувати</strong> — модальне вікно з повним профілем: статуси, блоки,
        несумісність, дата народження.
      </li>
      <li>
        <strong>Видалити</strong> — з підтвердженням; ім'я зберігається в історії.
      </li>
      <li>
        <strong>Активний / Неактивний</strong> — неактивні виключені з авторозподілу, показуються
        окремо.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-calendar-xmark me-2 text-danger"></i>Статуси та відсутність
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Відпустка / Лікарняний / Відрядження / Відсутній</strong> — жорсткий блок,
        чергування неможливе.
      </li>
      <li>
        Можна задати <strong>кілька періодів наперед</strong> (наприклад, відпустка в липні +
        відрядження у серпні).
      </li>
      <li>
        <strong>Відсипний до/після</strong> — автоматичний блок дня перед або після періоду
        відсутності.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-ban me-2 text-warning"></i>Заблоковані дні тижня
    </h6>
    <ul className="mb-3">
      <li>
        Для кожної особи можна заблокувати конкретні дні (Пн–Нд) з необов'язковим діапазоном дат і
        коментарем причини.
      </li>
      <li>Приклад: «Студент: Пн, Ср, Пт заблоковані з 01.09 по 30.06».</li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-people-arrows me-2 text-info"></i>Несумісні пари
    </h6>
    <p className="mb-3">
      Якщо дві особи несумісні — вони не будуть стояти на суміжних днях (день-1 / день). Зв'язок
      двосторонній: якщо А несумісний з Б, то Б автоматично несумісний з А.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-cake-candles me-2 text-danger"></i>День народження
    </h6>
    <p className="mb-3">
      При увімкненій опції система блокує чергування в день народження (та, за бажанням, день до
      нього). Налаштовується глобально у вкладці «Логіка графіка».
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-user-tag me-2 text-secondary"></i>Спеціальні учасники
    </h6>
    <p className="mb-3">
      Позначка <strong>«Додатковий»</strong> (isExtra) — для стажерів, водіїв та інших, яких
      призначають лише вручну. Прапорець <strong>«Виключити з авто»</strong> — не бере участі в
      автогенерації, але може бути призначений вручну.
    </p>
  </>
);

const StatsSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-table me-2 text-primary"></i>Таблиця статистики
    </h6>
    <p className="mb-3">
      Зведена таблиця по кожній особі: кількість чергувань, навантаження, борг, карма, індекс
      справедливості, розподіл по днях тижня.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-list-ol me-2 text-primary"></i>Основні метрики
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Всього нарядів</strong> — загальна кількість чергувань.
      </li>
      <li>
        <strong>Навантаження</strong> — зважена сума (з урахуванням ваг днів тижня).
      </li>
      <li>
        <strong>Частота</strong> — навантаження / кількість активних днів.
      </li>
      <li>
        <strong>Борг (owedDays)</strong> — заборгованість за зняття «за проханням».
      </li>
      <li>
        <strong>Карма</strong> — компенсація за ручні переміщення.
      </li>
      <li>
        <strong>Індекс справедливості</strong> — відхилення від ідеального розподілу.
      </li>
      <li>
        <strong>Розклад по днях</strong> — скільки разів стояв у Пн, Вт, Ср… та відхилення від
        середнього.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-sliders me-2 text-primary"></i>Фільтри та режими
    </h6>
    <ul className="mb-3">
      <li>Перемикач «Включити майбутні» — враховувати заплановані наряди.</li>
      <li>Розбивка по днях — детальна колонка на кожен день тижня.</li>
      <li>Сортування за будь-якою метрикою.</li>
      <li>Клік на особу — модальне вікно з детальною статистикою та таймлайном.</li>
    </ul>
  </>
);

const SettingsSection: React.FC = () => (
  <>
    <div className="alert alert-warning py-2 small mb-3">
      <i className="fas fa-triangle-exclamation me-1"></i>
      Більшість налаштувань зберігаються по кнопці «Зберегти» внизу сторінки. Незбережені зміни
      позначаються бейджем.
    </div>

    <h6 className="fw-bold mb-2">
      <i className="fas fa-balance-scale me-2 text-primary"></i>Логіка графіка
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Ваги днів тижня</strong> (0.1–5.0) — визначають «складність» кожного дня. Впливають
        на навантаження та справедливість.
      </li>
      <li>
        <strong>Черговий на добу</strong> — кількість осіб на один день (1–10).
      </li>
      <li>
        <strong>Мінімум днів відпочинку</strong> — скільки днів між чергуваннями (1 = без поспіль, 2
        = один день перерви).
      </li>
      <li>
        <strong>Обмеження 1 наряд/тиждень</strong> — активується, коли ≥7 доступних. Запобігає
        нерівномірному навантаженню.
      </li>
      <li>
        <strong>Максимальний борг</strong> — ліміт заборгованості однієї особи (за замовчуванням 4).
      </li>
      <li>
        <strong>Карма при ручних змінах</strong> — чи нараховувати компенсацію при drag & drop.
      </li>
      <li>
        <strong>Блокування в день народження</strong> — увімкнути/вимкнути та кількість днів
        блокування до дати.
      </li>
      <li>
        <strong>Рахувати з дати першого чергування</strong> — альтернативна точка відліку для нових
        осіб у розрахунку справедливості.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-display me-2 text-primary"></i>Інтерфейс
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Масштаб UI</strong> — 70%–160% для зручності на різних екранах.
      </li>
      <li>
        <strong>Індикатор повторів DOW</strong> — маленький значок на клітинці: показує, чи особа
        стояла в цей самий день тижня нещодавно (глибина та вигляд налаштовуються).
      </li>
      <li>
        <strong>Плашка «розробка»</strong> — бета-попередження, що можна приховати.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-print me-2 text-primary"></i>Друк
    </h6>
    <ul className="mb-3">
      <li>Блок «ЗАТВЕРДЖУЮ» — звання, посада, прізвище.</li>
      <li>Підписант — хто склав графік (окремо для графіка і добідки по складу).</li>
      <li>Заголовок графіка — до 3 рядків.</li>
      <li>Рядків на сторінку — для друку таблиці.</li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-flask me-2 text-secondary"></i>Експериментальні
    </h6>
    <p className="mb-2">
      Нестандартні опції: рівномірний розподіл у малих групах, агресивне балансування, облік
      навантаження. Позначені попередженнями — змінюйте обережно.
    </p>

    <h6 className="fw-bold mt-3 mb-2">
      <i className="fas fa-brain me-2 text-info"></i>Оптимізація графіку
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Перегляд наперед (Lookahead)</strong> — симулює вплив кожного кандидата на N днів
        уперед перед вибором.
      </li>
      <li>
        <strong>Tabu Search</strong> — метаевристика, яка може тимчасово приймати гірші рішення для
        виходу з локальних оптимумів.
      </li>
      <li>
        <strong>Multi-Restart</strong> — багаторазовий перезапуск з випадковим збуренням. Дві
        стратегії збурення:
        <ul>
          <li>
            <em>Парний обмін</em> — випадкова заміна 2–4 пар (класичний підхід).
          </li>
          <li>
            <em>LNS (руйнування-відновлення)</em> — видаляє блок 3–7 днів і заповнює заново з нуля,
            дотримуючись усіх обмежень.
          </li>
        </ul>
      </li>
      <li>
        <strong>Режим часу</strong> — «За часом» (10с–5хв) або «Безлімітний» (працює, поки не
        натиснете Стоп у рядку прогресу. Кнопка Стоп з'являється лише під час Multi-Restart/LNS
        після 250 спроб.
      </li>
    </ul>
  </>
);

const PrintSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-file-lines me-2 text-primary"></i>4 режими друку
    </h6>
    <ol className="mb-3">
      <li>
        <strong>Графік (календар)</strong> — тижневий розклад у форматі ЗСУ з блоком «ЗАТВЕРДЖУЮ» та
        підписами.
      </li>
      <li>
        <strong>Графік (таблиця)</strong> — офіційна таблиця з прізвищами, званнями та підсвіченими
        днями. Кількість рядків на сторінку налаштовується.
      </li>
      <li>
        <strong>Графік (тижні таблицею)</strong> — зведена таблиця по тижнях за обраний діапазон.
      </li>
      <li>
        <strong>Довідка по складу</strong> — статуси, заблоковані дні, заміни/обміни, підсумок.
      </li>
    </ol>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-file-excel me-2 text-success"></i>Експорт у Excel
    </h6>
    <p className="mb-3">
      Доступний для 3 форматів: календар, таблиця, тижнева таблиця. Для тижневої таблиці потрібно
      обрати рік і діапазон ISO-тижнів. Кнопки експорту — у вкладці{' '}
      <i className="fas fa-print me-1"></i>Друк у Налаштуваннях.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-shield-halved me-2 text-warning"></i>Перевірка перед друком
    </h6>
    <p className="mb-3">
      Перед друком система перевіряє графік і попереджує про проблеми: перевантаження (забагато
      чергових на день), недокомплект, чергування поспіль. Можна продовжити друк або виправити.
    </p>
  </>
);

const DataSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-file-export me-2 text-primary"></i>Експорт / Імпорт даних
    </h6>
    <ul className="mb-3">
      <li>
        <strong>JSON-бекап</strong> — повний експорт усіх даних (розклад, склад, налаштування,
        журнал). Використовуйте для переносу між пристроями та резервного копіювання.
      </li>
      <li>
        <strong>Імпорт розкладу</strong> — завантаження графіка з CSV / TXT файлу (формат:{' '}
        <code>дата;прізвище</code>). Підтримує режими «додати» та «замінити».
      </li>
      <li>
        <strong>Нагадування про бекап</strong> — якщо дані не експортувалися понад 3 дні, з'явиться
        попередження.
      </li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-layer-group me-2 text-info"></i>Робочі простори
    </h6>
    <p className="mb-3">
      Підтримка кількох баз даних. Кожна — окремий колектив з незалежним розкладом, складом та
      налаштуваннями. Перемикання — через меню у шапці.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-clipboard-list me-2 text-secondary"></i>Журнал дій
    </h6>
    <p className="mb-3">
      Вкладка <i className="fas fa-book me-1"></i>
      <em>Журнал</em> — повна історія всіх дій: хто кого призначив, зняв, замінив, обміняв,
      імпортував, згенерував, змінив налаштування. Фільтри по категоріям: графік, особовий склад,
      налаштування.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-wrench me-2 text-secondary"></i>Обслуговування БД
    </h6>
    <p className="mb-3">
      У Налаштуваннях є кнопка «База даних» — показує розмір, кількість записів, та дозволяє
      запустити очищення старих логів.
    </p>
  </>
);

const LegendSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-border-all me-2 text-primary"></i>Типи клітинок графіка
    </h6>
    <CellLegendTable />

    <h6 className="fw-bold mt-3 mb-2">
      <i className="fas fa-icons me-2 text-primary"></i>Значки в клітинці «НАРЯД»
    </h6>
    <IconLegendTable />

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-th-list me-2 text-primary"></i>Вкладки додатку
    </h6>
    <TabsTable />

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-balance-scale me-2 text-warning"></i>Механізм боргів і карми
    </h6>
    <ul className="mb-3">
      <li>
        <strong>Борг</strong> — з'являється лише при знятті «за проханням». Розмір залежить від ваги
        дня. Погашається при наступному призначенні на той самий день тижня.
      </li>
      <li>
        <strong>Знаття «по роботі»</strong> (хвороба, відрядження) — борг НЕ нараховується.
      </li>
      <li>
        <strong>Максимальний борг</strong> — обмежений (за замовчуванням 4.0). Налаштовується.
      </li>
      <li>
        <strong>Карма</strong> — компенсація при ручному переміщенні на важчий день (drag & drop).
        Вмикається у налаштуваннях.
      </li>
    </ul>
  </>
);

const TechSection: React.FC = () => (
  <>
    <h6 className="fw-bold mb-2">
      <i className="fas fa-server me-2 text-secondary"></i>Технічний стек
    </h6>
    <ul className="mb-3">
      <li>React 19 + TypeScript 5.9 + Bootstrap 5.3</li>
      <li>Dexie.js (IndexedDB) — повністю офлайн</li>
      <li>Tauri 2 — десктопна оболонка (нативний застосунок)</li>
      <li>Vite 7 — збірка та dev-сервер</li>
      <li>Vitest — тестування (185+ тестів)</li>
    </ul>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-lock me-2 text-success"></i>Конфіденційність
    </h6>
    <p className="mb-3">
      Усі дані зберігаються <strong>виключно на вашому пристрої</strong> (IndexedDB). Додаток не має
      серверу, не збирає аналітику, не передає жодну інформацію в інтернет. Для переносу між
      пристроями використовуйте JSON-бекап.
    </p>

    <h6 className="fw-bold mt-4 mb-2">
      <i className="fas fa-circle-exclamation me-2 text-warning"></i>Обмеження
    </h6>
    <ul className="mb-3">
      <li>Мінімум 2 особи для генерації графіка.</li>
      <li>
        При 2 особах і <code>minRestDays=1</code> — чергування через день (єдиний можливий варіант).
      </li>
      <li>Спеціальні учасники (isExtra) — лише ручне призначення.</li>
      <li>Дані не синхронізуються між пристроями автоматично.</li>
    </ul>

    <div className="text-muted text-center mt-4 pt-3 border-top" style={{ fontSize: '0.8rem' }}>
      <div>ВАРТА · Офлайн-система розподілу чергувань · 2025–2026</div>
      <div className="mt-1">
        Розробник: <strong>Vladyslav V.V.</strong> ·{' '}
        <a href="mailto:vladvyljotnikov@gmail.com" className="text-muted">
          vladvyljotnikov@gmail.com
        </a>
      </div>
    </div>
  </>
);

const SECTION_COMPONENTS: Record<HelpSection, React.FC> = {
  about: AboutSection,
  quickstart: QuickStartSection,
  schedule: ScheduleSection,
  users: UsersSection,
  stats: StatsSection,
  settings: SettingsSection,
  print: PrintSection,
  data: DataSection,
  legend: LegendSection,
  tech: TechSection,
};

/** Full body content of the help/info modal. */
export const InfoModalContent: React.FC = () => {
  const [section, setSection] = useState<HelpSection>('about');
  const SectionBody = SECTION_COMPONENTS[section];

  return (
    <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
      {/* Section navigation */}
      <div className="d-flex flex-wrap gap-1 mb-3 pb-2 border-bottom">
        {SECTIONS.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${section === key ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSection(key)}
            style={{ fontSize: '0.78rem' }}
          >
            <i className={`fas ${icon} me-1`}></i>
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
        <SectionBody />
      </div>
    </div>
  );
};
