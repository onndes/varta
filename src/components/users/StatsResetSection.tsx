// src/components/users/StatsResetSection.tsx — обнулення статистики бійця з обраної дати.
import React, { useEffect, useState } from 'react';
import type { User } from '../../types';
import * as userService from '../../services/userService';
import { useDialog } from '../useDialog';
import { toLocalISO } from '../../utils/dateUtils';

interface StatsResetSectionProps {
  user: User;
  /** Оновити чернетку в модалці, щоб збереження не перетерло зміни. */
  onChange: (user: User) => void;
  /** Перечитати дані застосунку після зміни бази. */
  onStatsChanged?: () => Promise<void>;
  logAction?: (action: string, details: string) => Promise<void>;
}

const formatUk = (iso: string): string => new Date(iso).toLocaleDateString('uk-UA');

/**
 * Дві дії для бійця, у якого «крива» історія (нерівні періоди, довгі відсутності):
 * м'яке приховування нарядів до дати (оборотне) і безповоротне видалення.
 */
export const StatsResetSection: React.FC<StatsResetSectionProps> = ({
  user,
  onChange,
  onStatsChanged,
  logAction,
}) => {
  const { showConfirm, showAlert } = useDialog();
  const todayStr = toLocalISO(new Date());
  const [fromDate, setFromDate] = useState(user.statsHiddenBefore || todayStr);
  const [dutiesBefore, setDutiesBefore] = useState<number | null>(null);
  const [dutiesAfter, setDutiesAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user.id || !fromDate) {
      setDutiesBefore(null);
      setDutiesAfter(null);
      return;
    }
    const userId = user.id;
    void Promise.all([
      userService.countDutiesBefore(userId, fromDate),
      userService.countDutiesBefore(userId, '9999-12-31'),
    ]).then(([before, total]) => {
      if (cancelled) return;
      setDutiesBefore(before);
      setDutiesAfter(total - before);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id, fromDate]);

  const finish = async () => {
    if (onStatsChanged) await onStatsChanged();
  };

  const handleHide = async () => {
    if (!user.id || !fromDate) return;
    setBusy(true);
    try {
      await userService.setStatsHiddenBefore(user.id, fromDate);
      onChange({ ...user, statsHiddenBefore: fromDate });
      await logAction?.(
        'STATS_HIDE',
        `${user.name}: наряди до ${formatUk(fromDate)} приховано зі статистики`
      );
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!user.id) return;
    setBusy(true);
    try {
      await userService.setStatsHiddenBefore(user.id, undefined);
      onChange({ ...user, statsHiddenBefore: undefined });
      await logAction?.('STATS_RESTORE', `${user.name}: приховані наряди повернуто у статистику`);
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const handleHardReset = async () => {
    if (!user.id || !fromDate) return;
    const count = await userService.countDutiesBefore(user.id, fromDate);
    const ok = await showConfirm(
      `БЕЗПОВОРОТНО видалити ${count} нарядів бійця ${user.name} до ${formatUk(fromDate)}?\n\n` +
        `Наряди зникнуть з бази та з графіка, а датою початку обліку стане ${formatUk(fromDate)}.\n` +
        'Відновити їх буде неможливо — хіба що з резервної копії.'
    );
    if (!ok) return;
    const confirmedTwice = await showConfirm(
      `Підтвердіть ще раз: видалити ${count} нарядів назавжди?`
    );
    if (!confirmedTwice) return;

    setBusy(true);
    try {
      const affected = await userService.hardResetUserStats(user.id, fromDate);
      onChange({
        ...user,
        dateAddedToAuto: fromDate,
        statsResetAt: fromDate,
        statsHiddenBefore: undefined,
      });
      await logAction?.(
        'STATS_RESET',
        `${user.name}: видалено ${affected.length} нарядів до ${formatUk(fromDate)}`
      );
      await finish();
      await showAlert(`Видалено ${affected.length} нарядів. Облік починається з ${formatUk(fromDate)}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mb-3 border-danger-subtle">
      <div className="card-body">
        <h6 className="card-title">
          <i className="fas fa-eraser me-2 text-danger"></i>Обнулення статистики
        </h6>
        <div className="form-text mb-2">
          Для бійців із «кривою» історією: довгі лікарняні, відпустки, періоди з 3 нарядами на
          тиждень. Облік можна почати заново з обраної дати.
        </div>

        {user.statsHiddenBefore && (
          <div className="alert alert-warning py-2 px-3 small d-flex flex-wrap gap-2 align-items-center">
            <span>
              <i className="fas fa-eye-slash me-1"></i>
              Наряди до <strong>{formatUk(user.statsHiddenBefore)}</strong> приховані зі статистики
              (у базі збережені).
            </span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm ms-auto"
              disabled={busy}
              onClick={() => void handleRestore()}
            >
              <i className="fas fa-rotate-left me-1"></i>Повернути все назад
            </button>
          </div>
        )}

        {user.statsResetAt && (
          <div className="form-text mb-2">
            <i className="fas fa-clock-rotate-left me-1"></i>Останнє безповоротне обнулення:{' '}
            <strong>{formatUk(user.statsResetAt)}</strong>
          </div>
        )}

        <div className="d-flex flex-wrap align-items-end gap-2">
          <div style={{ flex: '0 0 190px' }}>
            <label className="form-label small text-muted mb-1">Рахувати статистику з</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-outline-warning btn-sm"
            disabled={busy || !fromDate}
            onClick={() => void handleHide()}
          >
            <i className="fas fa-eye-slash me-1"></i>Приховати зі статистики
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy || !fromDate || dutiesBefore === 0}
            onClick={() => void handleHardReset()}
          >
            <i className="fas fa-triangle-exclamation me-1"></i>Видалити безповоротно
          </button>
        </div>

        <div className="form-text mt-2">
          {dutiesBefore === null ? (
            '…'
          ) : (
            <>
              До цієї дати у бійця <strong>{dutiesBefore}</strong> нарядів — саме вони зникнуть з
              обліку.
              {dutiesAfter !== null && dutiesAfter > 0 && (
                <>
                  {' '}
                  Після неї лишається <strong>{dutiesAfter}</strong> — вони й далі рахуються, тож
                  відсоток навантаження скинеться не до нуля. Щоб почати з чистого аркуша, оберіть
                  сьогоднішню дату.
                </>
              )}
            </>
          )}
        </div>

        <ul className="form-text mt-2 mb-0 ps-3">
          <li>
            <strong>Приховати</strong> — наряди лишаються в базі й у сітці графіка, але не
            враховуються ніде: статистика, навантаження, розподіл, авточерга. Повертається одним
            натисканням, ніби приховування не було.
          </li>
          <li className="text-danger">
            <strong>Видалити безповоротно</strong> — наряди стираються з бази, датою початку
            обліку стає обрана. Відновлення лише з резервної копії.
          </li>
        </ul>
      </div>
    </div>
  );
};
