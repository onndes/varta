import React, { useState } from 'react';
import Modal from './Modal';

const InfoButton: React.FC = () => {
  const [show, setShow] = useState(false);
  const legendCellBadgeBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '170px',
    height: '42px',
    textAlign: 'center',
    padding: '0 10px',
    borderRadius: '10px',
    fontWeight: 700,
    lineHeight: 1.1,
    boxSizing: 'border-box',
  };

  return (
    <>
      <button className="app-sidebar__item" onClick={() => setShow(true)} title="Про систему">
        <i className="fas fa-info-circle app-sidebar__icon"></i>
        <span className="app-sidebar__label">Довідка</span>
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
              відображає складність чергування. Ваги налаштовуються адміністратором.
            </li>
            <li>
              <strong>Принцип «драбини»</strong> — список чергувань плавно зміщується від тижня до
              тижня, щоб кожен чергував у різні дні.
            </li>
            <li>
              <strong>Заборона послідовних чергувань</strong> — система ніколи не ставить людину на
              два чергування поспіль. Наступний день — «відсипний».
            </li>
            <li>
              <strong>Urgency Score</strong> — пріоритет підвищується для тих, хто має «борг».
            </li>
            <li>
              <strong>Агресивна балансировка</strong> — опціональний режим, що пріоритизує
              вирівнювання навантаження (може ігнорувати інші пріоритети).
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
              <strong>Службова заборона</strong> — командировка, важливе завдання тощо.
            </li>
            <li>
              <strong>Заблоковані дні тижня</strong> — для кожної особи можна заблокувати конкретні
              дні тижня з періодом дії та коментарем причини.
            </li>
            <li>
              <strong>Ручний блок</strong> — адміністратор може заблокувати будь-який день.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-balance-scale me-2 text-warning"></i>Механізм «боргів» і карми
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Нарахування боргу</strong> — борг з'являється лише при знятті «за проханням».
              Розмір залежить від ваги дня.
            </li>
            <li>
              <strong>Знаття «по роботі»</strong> (відпустка, командировка, хвороба) — борг НЕ
              нараховується.
            </li>
            <li>
              <strong>Погашення боргу</strong> — зменшується при призначенні з підвищеним
              пріоритетом.
            </li>
            <li>
              <strong>Максимальний борг</strong> — обмежений настроюваним значенням (за
              замовчуванням 4.0).
            </li>
            <li>
              <strong>«Карма»</strong> — компенсація за ручне переміщення на важчий день.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-exclamation-triangle me-2 text-danger"></i>Спеціальні випадки
          </h6>
          <ul className="mb-3">
            <li>
              <strong>&lt; 2 особи</strong> — попередження про неможливість побудови графіка.
            </li>
            <li>
              <strong>2 особи</strong> — чергування через день, без складної логіки.
            </li>
            <li>
              <strong>3+ осіб</strong> — повний зважений алгоритм з боргами та «драбиною».
            </li>
            <li>
              <strong>is_extra</strong> — спеціальні учасники (стажери, водії) — лише ручне
              призначення.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-desktop me-2 text-primary"></i>Інтерфейс
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Тижнева сітка</strong> — таблиця Пн–Нд з інтерактивними діями.
            </li>
            <li>
              <strong>Візуалізація навантаження</strong> — індикатор поряд з кожним прізвищем.
            </li>
            <li>
              <strong>Модальне вікно призначення</strong> — 3 режими: заміна, обмін, додавання.
            </li>
            <li>
              <strong>Критичні дні</strong> — позначаються{' '}
              <span className="badge bg-danger">червоним</span>, коли немає кандидатів.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-border-all me-2 text-primary"></i>Легенда клітинок графіка
          </h6>
          <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
            <tbody>
              <tr>
                <td style={{ width: '200px' }}>
                  <span
                    style={{
                      ...legendCellBadgeBase,
                      backgroundColor: 'var(--app-cell-assigned-bg, #e8f5e9)',
                      color: 'var(--app-cell-assigned-color, #1b5e20)',
                      border: '2px solid var(--app-cell-assigned-border, #a5d6a7)',
                    }}
                  >
                    НАРЯД
                  </span>
                </td>
                <td>Призначення на день (тип призначення визначається значком).</td>
              </tr>
              <tr>
                <td>
                  <span
                    style={{
                      ...legendCellBadgeBase,
                      background:
                        'repeating-linear-gradient(-45deg, var(--app-cell-history-bg1, #e0e7ff), var(--app-cell-history-bg1, #e0e7ff) 4px, var(--app-cell-history-bg2, #eef1ff) 4px, var(--app-cell-history-bg2, #eef1ff) 8px)',
                      color: 'var(--app-cell-history-color, #3730a3)',
                      border: '2px dashed var(--app-cell-history-border, #818cf8)',
                    }}
                  >
                    ІСТОРІЯ
                  </span>
                </td>
                <td>Історичний або імпортований запис (штриховка).</td>
              </tr>
              <tr>
                <td>
                  <span
                    style={{
                      ...legendCellBadgeBase,
                      backgroundColor: 'var(--app-cell-unavailable-bg, #f5f5f5)',
                      color: 'var(--app-cell-unavailable-color, #888)',
                      border: '1px solid var(--app-table-border, #e0e0e0)',
                    }}
                  >
                    ЗАБЛОКОВАНО
                  </span>
                </td>
                <td>Особа недоступна: статус, відсипний або блок днів.</td>
              </tr>
              <tr>
                <td>
                  <span
                    style={{
                      ...legendCellBadgeBase,
                      backgroundColor: 'var(--app-cell-past-locked-bg, #f0f0f0)',
                      color: 'var(--app-cell-past-locked-color, #999)',
                      border: '1px solid var(--app-table-border, #e0e0e0)',
                    }}
                  >
                    МИНУЛЕ
                  </span>
                </td>
                <td>Клітинка минулої дати (без редагування, якщо не увімкнено режим історії).</td>
              </tr>
              <tr>
                <td>
                  <span
                    style={{
                      ...legendCellBadgeBase,
                      backgroundColor: 'var(--app-cell-conflict-bg, #f8d7da)',
                      color: 'var(--app-cell-conflict-color, #842029)',
                      border: '2px solid var(--app-cell-conflict-border, #f5c2c7)',
                    }}
                  >
                    КОНФЛІКТ
                  </span>
                </td>
                <td>Конфліктне призначення: система позначає проблему для виправлення.</td>
              </tr>
            </tbody>
          </table>

          <h6 className="fw-bold mt-3 mb-2">
            <i className="fas fa-icons me-2 text-primary"></i>Значки в клітинці «НАРЯД»
          </h6>
          <table className="table table-sm table-bordered mb-3" style={{ fontSize: '0.85rem' }}>
            <tbody>
              <tr>
                <td style={{ width: '210px' }}>
                  НАРЯД <i className="bi bi-hand-index-thumb schedule-cell-icon ms-1"></i>
                </td>
                <td>Ручне призначення.</td>
              </tr>
              <tr>
                <td>
                  НАРЯД <i className="bi bi-gear-fill schedule-cell-icon ms-1"></i>
                </td>
                <td>Автоматичне призначення.</td>
              </tr>
              <tr>
                <td>
                  НАРЯД <i className="bi bi-arrow-repeat schedule-cell-icon ms-1"></i>
                </td>
                <td>Заміна (перепризначення).</td>
              </tr>
              <tr>
                <td>
                  НАРЯД <i className="bi bi-arrow-left-right schedule-cell-icon ms-1"></i>
                </td>
                <td>Обмін чергуванням.</td>
              </tr>
              <tr>
                <td>
                  НАРЯД <i className="bi bi-clock-history schedule-cell-icon ms-1"></i>
                </td>
                <td>Історичний запис (режим історії).</td>
              </tr>
              <tr>
                <td>
                  НАРЯД <i className="bi bi-box-arrow-in-down schedule-cell-icon ms-1"></i>
                </td>
                <td>Імпортований запис.</td>
              </tr>
            </tbody>
          </table>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-print me-2 text-secondary"></i>Друк (3 режими)
          </h6>
          <ul className="mb-3">
            <li>
              <strong>Графік (календар)</strong> — тижневий розклад у форматі ЗСУ з блоком
              «ЗАТВЕРДЖУЮ» та підписами.
            </li>
            <li>
              <strong>Таблиця чергувань</strong> — офіційна таблиця з прізвищами, званнями та
              підсвіченими днями чергувань. Кількість рядків на сторінку налаштовується.
            </li>
            <li>
              <strong>Довідка по складу</strong> — статуси, заблоковані дні з причинами,
              заміни/обміни, підсумок, підпис «Довідку склав».
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-layer-group me-2 text-info"></i>Робочі простори
          </h6>
          <p className="mb-3">
            Підтримка кількох баз даних (робочих просторів). Кожна база — окремий колектив з
            незалежним розкладом, складом та налаштуваннями. Швидке перемикання через меню у
            заголовку.
          </p>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-file-export me-2 text-secondary"></i>Експорт і дані
          </h6>
          <ul className="mb-3">
            <li>
              <strong>JSON</strong> — імпорт/експорт усіх даних для переносу між пристроями. Включає
              розклад, склад, налаштування, журнал.
            </li>
            <li>
              <strong>Друк / PDF</strong> — через браузер (Ctrl+P), формат A4 альбомна.
            </li>
            <li>
              <strong>Резервне копіювання</strong> — нагадування, якщо дані не збережені &gt; 3 дні.
            </li>
            <li>
              <strong>Excel (.xlsx)</strong> — <em>заплановано</em>.
            </li>
          </ul>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-sliders-h me-2 text-primary"></i>Налаштування
          </h6>
          <ul className="mb-3">
            <li>Ваги днів тижня, кількість чергових на день</li>
            <li>Максимальний борг, облік навантаження, агресивна балансировка</li>
            <li>Підписанти для графіка та довідки (окремо)</li>
            <li>Кількість рядків на сторінку для таблиці чергувань</li>
            <li>Каскадна перебудова графіка</li>
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
                  Тижневий розклад з ручним редагуванням, авторозподілом, каскадною перебудовою.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Особовий склад</td>
                <td>
                  Управління: додавання, редагування, статуси, блокування днів тижня з коментарями.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Статистика</td>
                <td>
                  Кількість чергувань, розподіл по днях, борг, вага, карма, індекс справедливості.
                </td>
              </tr>
              <tr>
                <td className="fw-bold">Налаштування</td>
                <td>Логіка алгоритму та параметри друку. Небезпечні опції позначені червоним.</td>
              </tr>
              <tr>
                <td className="fw-bold">Журнал</td>
                <td>Повна історія всіх дій у системі з фільтрацією.</td>
              </tr>
            </tbody>
          </table>

          <h6 className="fw-bold mt-4 mb-2">
            <i className="fas fa-server me-2 text-secondary"></i>Технічний стек
          </h6>
          <ul className="mb-3">
            <li>React 19 + TypeScript 5.9 + Bootstrap 5.3</li>
            <li>Dexie.js (IndexedDB) — повністю офлайн, PWA</li>
            <li>Vite — збірка та dev-сервер</li>
            <li>Vitest — тестування</li>
          </ul>

          <div
            className="text-muted text-center mt-4 pt-3 border-top"
            style={{ fontSize: '0.8rem' }}
          >
            <div>ВАРТА v1.0-beta · Офлайн-система розподілу чергувань · 2025–2026</div>
            <div className="mt-1">
              Розробник: <strong>Vladyslav V.V.</strong> ·{' '}
              <a href="mailto:vladvyljotnikov@gmail.com" className="text-muted">
                vladvyljotnikov@gmail.com
              </a>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default InfoButton;
