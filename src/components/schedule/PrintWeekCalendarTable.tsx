import React, { useMemo } from 'react';
import type { PrintWeekRange, User, ScheduleEntry } from '../../types';
import { DAY_NAMES_FULL } from '../../utils/constants';
import { getWeekRangeDates } from '../../utils/dateUtils';
import { toAssignedUserIds } from '../../utils/assignment';

interface PrintWeekCalendarTableProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
  range: PrintWeekRange;
}

const formatRangeDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });

const formatRangeLabel = (fromIso: string, toIso: string): string =>
  `${formatRangeDate(fromIso)} - ${formatRangeDate(toIso)}`;

const PrintWeekCalendarTable: React.FC<PrintWeekCalendarTableProps> = ({
  users,
  schedule,
  range,
}) => {
  const usersById = useMemo(
    () => new Map(users.filter((user) => user.id !== undefined).map((user) => [user.id!, user])),
    [users]
  );

  const weeks = useMemo(
    () => getWeekRangeDates(range.year, range.fromWeek, range.toWeek),
    [range.fromWeek, range.toWeek, range.year]
  );
  const periodLabel =
    weeks.length > 0 ? formatRangeLabel(weeks[0][0], weeks[weeks.length - 1][6]) : '';

  return (
    <div className="print-only print-week-calendar-table-wrapper">
      <div className="print-week-calendar-table__title">Графіки за період {periodLabel}</div>
      <table className="print-week-calendar-table">
        <thead>
          <tr>
            <th className="col-week-range">Період</th>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <th key={day} className="col-week-day">
                {DAY_NAMES_FULL[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((weekDates, index) => (
            <tr key={`${weekDates[0]}-${index}`}>
              <td className="col-week-range">{formatRangeLabel(weekDates[0], weekDates[6])}</td>
              {weekDates.map((date) => {
                const assignedUsersLabel = toAssignedUserIds(schedule[date]?.userId)
                  .map((id) => usersById.get(id))
                  .filter((user): user is User => Boolean(user))
                  .map((user) => user.name.trim().split(/\s+/)[0])
                  .join(', ');

                return (
                  <td key={date} className="col-week-day">
                    {assignedUsersLabel.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <span className="print-week-calendar-table__name">{assignedUsersLabel}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PrintWeekCalendarTable;
