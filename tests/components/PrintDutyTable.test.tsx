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
  },
  {
    id: 2,
    name: 'Петренко Петро Петрович',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
    statusPeriods: [{ status: 'VACATION', from: '2026-03-16', to: '2026-03-16' }],
  },
  {
    id: 3,
    name: 'Сидоренко Сидір Сидорович',
    rank: 'Солдат',
    status: 'ACTIVE',
    isActive: true,
  },
];

const schedule: Record<string, ScheduleEntry> = {
  '2026-03-16': { date: '2026-03-16', userId: 1, type: 'auto' },
};

describe('PrintDutyTable', () => {
  it('compresses the table so a small overflow still fits on one page', () => {
    const { container } = render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users}
        maxRowsPerPage={2}
        showAllUsers
      />
    );

    expect(screen.getByText('ІВАНЕНКО Іван Іванович')).toBeInTheDocument();
    expect(screen.getByText('ПЕТРЕНКО Петро Петрович')).toBeInTheDocument();
    expect(screen.getByText('СИДОРЕНКО Сидір Сидорович')).toBeInTheDocument();
    // 3 людини при ліміті 2 — вміщуються на одну сторінку за рахунок ущільнення
    expect(container.querySelectorAll('.print-duty-table')).toHaveLength(1);
    const wrapper = container.querySelector('.print-duty-table-wrapper') as HTMLElement;
    expect(Number(wrapper.style.getPropertyValue('--print-density'))).toBeCloseTo(2 / 3, 3);
  });

  it('splits users evenly so the last page is never left with a single row', () => {
    const many: User[] = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      name: `Прізвище${index + 1} Ім'я По-батькові`,
      rank: 'Солдат',
      status: 'ACTIVE',
      isActive: true,
    }));

    const { container } = render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={{}}
        users={many}
        maxRowsPerPage={2}
        showAllUsers
      />
    );

    // ліміт 2 + ущільнення ×1.6 → 3 рядки на сторінку, 7 осіб → 3/2/2, а не 3/3/1
    const pages = container.querySelectorAll('.print-duty-table');
    expect(pages).toHaveLength(3);
    const rowsPerPage = Array.from(pages).map((table) => table.querySelectorAll('tbody tr').length);
    expect(rowsPerPage).toEqual([3, 2, 2]);
  });

  it('skips users who are absent all week and have no duty when skipFullyAbsent is on', () => {
    render(
      <PrintDutyTable
        weekDates={['2026-03-16']}
        schedule={schedule}
        users={users}
        maxRowsPerPage={5}
        showAllUsers
        skipFullyAbsent
      />
    );

    expect(screen.getByText('ІВАНЕНКО Іван Іванович')).toBeInTheDocument();
    expect(screen.queryByText('ПЕТРЕНКО Петро Петрович')).not.toBeInTheDocument();
    expect(screen.getByText('СИДОРЕНКО Сидір Сидорович')).toBeInTheDocument();
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

    expect(screen.getByText('ІВАНЕНКО Іван Іванович')).toBeInTheDocument();
    expect(screen.queryByText('ПЕТРЕНКО Петро Петрович')).not.toBeInTheDocument();
    expect(screen.queryByText('СИДОРЕНКО Сидір Сидорович')).not.toBeInTheDocument();
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
