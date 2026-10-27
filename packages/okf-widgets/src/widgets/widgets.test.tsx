import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import Eligibility from './Eligibility.tsx';
import RequestMemory from './RequestMemory.tsx';
import RlsPlayground from './RlsPlayground.tsx';
import SummaryStats from './SummaryStats.tsx';
import { pgAverage } from '../models/pgAverage.ts';
import WeekBounds from './WeekBounds.tsx';

describe('WeekBounds', () => {
  it('files Monday 00:30 in SAST under the previous week, then moves with a preset', async () => {
    render(<WeekBounds />);
    expect(screen.getByTestId('week-label')).toHaveTextContent(
      'Mon 14 Sep to Sun 20 Sep',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'New Year in Auckland' }),
    );
    expect(screen.getByTestId('week-label')).toHaveTextContent(
      'Mon 28 Dec to Sun 3 Jan',
    );
  });
});

describe('Eligibility', () => {
  it('starts at the seed and shows a rate over 100% for the promotion bug', async () => {
    render(<Eligibility />);
    const result = screen.getByTestId('eligibility-result');
    expect(result).toHaveTextContent('50%');
    expect(result).toHaveTextContent('2 of 4 members completed');
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Both respondents promoted, branch off',
      }),
    );
    expect(result).toHaveTextContent('200%');
    expect(screen.getByRole('status')).toHaveTextContent('A rate above 100%');
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Also count anyone/ }),
    );
    expect(result).toHaveTextContent('2 of 3 members completed');
  });

  it('drops a Member deactivated before the week', async () => {
    render(<Eligibility />);
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Not Answered deactivated' }),
      'Sun before',
    );
    expect(screen.getByTestId('eligibility-result')).toHaveTextContent(
      '2 of 3',
    );
  });
});

describe('SummaryStats', () => {
  it('formats the avg() string the way PostgreSQL returns it', () => {
    expect(pgAverage([5, 4])).toBe('4.5000000000000000');
    expect(pgAverage([])).toBeNull();
  });

  it('runs the seeded responses through the real SummaryPanel', () => {
    render(<SummaryStats />);
    const panel = screen.getByRole('region', { name: 'What the Manager sees' });
    expect(within(panel).getByText('50%')).toBeInTheDocument();
    expect(
      within(panel).getByText('average 4.5 out of 5 from 2 answers'),
    ).toBeInTheDocument();
    expect(within(panel).getByText('1 yes, 1 no')).toBeInTheDocument();
  });

  it('shows null, not zero, once every response is removed', async () => {
    render(<SummaryStats />);
    for (const button of screen.getAllByRole('button', {
      name: /^Remove response/,
    })) {
      await userEvent.click(button);
    }
    const panel = screen.getByRole('region', { name: 'What the Manager sees' });
    expect(within(panel).getAllByText('no answers yet')).toHaveLength(2);
    await userEvent.clear(screen.getByRole('spinbutton'));
    expect(within(panel).getByText('no eligible members')).toBeInTheDocument();
  });
});

describe('RlsPlayground', () => {
  it('holds when the filter is forgotten and leaks once the API connects as the owner', async () => {
    render(<RlsPlayground />);
    await userEvent.click(
      screen.getByRole('radio', { name: 'Acme Member Long Ago' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /forgets its organisation filter/ }),
    );
    const rows = () =>
      within(screen.getByTestId('rls-result')).getAllByText('returned');
    expect(rows()).toHaveLength(1);
    expect(screen.queryByText(/A leak/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /connects as pulse_owner/ }),
    );
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('A leak');
  });

  it('raises 22P02 with no session once nullif is removed', async () => {
    render(<RlsPlayground />);
    await userEvent.click(
      screen.getByRole('radio', { name: 'No session (a public route)' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Remove nullif/ }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('SQLSTATE 22P02');
  });
});

describe('RequestMemory', () => {
  it('shows request scope rebuilding the chain for every request in flight', async () => {
    render(<RequestMemory />);
    const result = screen.getByTestId('memory-result');
    expect(result).toHaveTextContent('Per-request instances0 (0 × 12)');
    await userEvent.click(
      screen.getByRole('radio', { name: /Inject a request-scoped provider/ }),
    );
    expect(result).toHaveTextContent('Per-request instances60 (5 × 12)');
    expect(result).toHaveTextContent('5,000');
  });

  it('warns about a stale organisation when the stamp does not fade', async () => {
    render(<RequestMemory />);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.change(
      screen.getByRole('slider', { name: 'Requests in flight' }),
      {
        target: { value: '4' },
      },
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /is_local = false/ }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "still carries the last caller's organisation",
    );
    expect(
      screen.getByText('The pool: 4 of 10 connections borrowed'),
    ).toBeInTheDocument();
  });
});
