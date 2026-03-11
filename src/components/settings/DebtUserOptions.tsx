// src/components/settings/DebtUserOptions.tsx — debt user scheduling toggles and weekly limit
import React from 'react';
import type { AutoScheduleOptions } from '../../types';

const DEBT_WEEKLY_MIN = 1;
const DEBT_WEEKLY_MAX = 4; // weekly assignment limit for debt users

interface DebtUserOptionsProps {
  autoOpts: AutoScheduleOptions;
  onAutoOptsChange: (opts: AutoScheduleOptions) => void;
}

/** Toggles controlling debt-user priority: extra weekly assignments, repayment limit, and speed. */
const DebtUserOptions: React.FC<DebtUserOptionsProps> = ({ autoOpts, onAutoOptsChange }) => (
  <>
    {/* Allow debt users extra weekly assignments */}
    <div className="form-check form-switch mb-2">
      <input
        className="form-check-input"
        type="checkbox"
        id="allowDebtExtra"
        checked={autoOpts.allowDebtUsersExtraWeeklyAssignments}
        onChange={(e) =>
          onAutoOptsChange({
            ...autoOpts,
            allowDebtUsersExtraWeeklyAssignments: e.target.checked,
          })
        }
      />
      <label className="form-check-label" htmlFor="allowDebtExtra">
        <strong>Дозволити особам з боргом частіше чергувати в тижні</strong>
        <div className="text-muted small">
          Потрібно для швидшого погашення карми після зняття з наряду за рапортом.
        </div>
      </label>
    </div>

    {/* Weekly limit for debt users — shown only when extra assignments allowed */}
    {autoOpts.allowDebtUsersExtraWeeklyAssignments && (
      <div className="ms-4 mb-3 p-3 bg-light rounded">
        <label className="form-label fw-bold">Ліміт для осіб з боргом (разів/тиждень)</label>
        <div className="d-flex align-items-center gap-3">
          <input
            type="number"
            min={DEBT_WEEKLY_MIN}
            max={DEBT_WEEKLY_MAX}
            className="form-control"
            style={{ width: '80px' }}
            value={autoOpts.debtUsersWeeklyLimit}
            onChange={(e) =>
              onAutoOptsChange({
                ...autoOpts,
                debtUsersWeeklyLimit: Math.min(
                  DEBT_WEEKLY_MAX,
                  Math.max(DEBT_WEEKLY_MIN, parseInt(e.target.value) || 1)
                ),
              })
            }
          />
          <span className="text-muted small">Від 1 до 4.</span>
        </div>
      </div>
    )}

    {/* Prioritize faster debt repayment */}
    <div className="form-check form-switch mb-3">
      <input
        className="form-check-input"
        type="checkbox"
        id="fasterDebtRepayment"
        checked={autoOpts.prioritizeFasterDebtRepayment}
        onChange={(e) =>
          onAutoOptsChange({
            ...autoOpts,
            prioritizeFasterDebtRepayment: e.target.checked,
          })
        }
      />
      <label className="form-check-label" htmlFor="fasterDebtRepayment">
        <strong>Пріоритет швидшого погашення карми</strong>
        <div className="text-muted small">
          За рівних умов система обирає особу/день, де борг погашається швидше.
        </div>
      </label>
    </div>
  </>
);

export default DebtUserOptions;
