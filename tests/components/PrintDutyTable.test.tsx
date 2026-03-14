import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrintDutyTable from '@/components/schedule/PrintDutyTable';
import type { ScheduleEntry, User } from '@/types';

const users: User[] = [
  {
    id: 1,
    name: 'Іваненко Іван Іванович',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    debt: 0,
    owedDays: {},
  },
  {
    id: 2,
    name: 'Петренко Петро Петрович',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    debt: 0,
    owedDays: {},
    statusPeriods: [{ status: 'VACATION', from: '2026-03-16', to: '2026-03-16' }],
  },
  {
    id: 3,
    name: 'Сидоренко Сидір Сидорович',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    debt: 0,
    owedDays: {},
  },
];

const schedule: Record<string, ScheduleEntry> = {
  '2026-03-16': { date: '2026-03-16', userId: 1, type: 'auto' },
};

describe('PrintDutyTable', () => {
  it('prints all active users across multiple pages when showAllUsers is enabled', () => {
    const { container } = render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users}
        maxRowsPerPage={2}
        showAllUsers
      />
    );

    expect(screen.getByText("ІВАНЕНКО Іван Іванович")).toBeInTheDocument();
    expect(screen.getByText("ПЕТРЕНКО Петро Петрович")).toBeInTheDocument();
    expect(screen.getByText("СИДОРЕНКО Сидір Сидорович")).toBeInTheDocument();
    expect(container.querySelectorAll('.print-duty-table')).toHaveLength(2);
  });

  it('prints only scheduled users when showAllUsers is disabled', () => {
    render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users}
        maxRowsPerPage={2}
        showAllUsers={false}
      />
    );

    expect(screen.getByText("ІВАНЕНКО Іван Іванович")).toBeInTheDocument();
    expect(screen.queryByText("ПЕТРЕНКО Петро Петрович")).not.toBeInTheDocument();
    expect(screen.queryByText("СИДОРЕНКО Сидір Сидорович")).not.toBeInTheDocument();
  });

  it('prints vacation, trip and sick statuses in duty-table cells', () => {
    render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users}
        maxRowsPerPage={2}
        showAllUsers
      />
    );

    expect(screen.getByText('Відпустка')).toBeInTheDocument();
  });

  it('reserves the last page for the footer so it is not printed alone', () => {
    const { container } = render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users.slice(0, 2)}
        maxRowsPerPage={2}
        showAllUsers
        footer={<div>Графік склав:</div>}
      />
    );

    expect(container.querySelectorAll('.print-duty-table')).toHaveLength(2);
    expect(screen.getByText('Графік склав:')).toBeInTheDocument();
  });
});
