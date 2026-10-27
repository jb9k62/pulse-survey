import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SummaryPanel from './SummaryPanel.js';
import type { QuestionSummary, Summary } from '@pulse/contracts';

function makeSummary(
  overrides: {
    completion?: Summary['completion'];
    questions?: QuestionSummary[];
  } = {},
): Summary {
  return {
    survey: { id: 's1', title: 'Weekly pulse', status: 'active' },
    week: {
      start: '2026-09-21',
      end: '2026-09-27',
      label: 'Mon 21 Sep to Sun 27 Sep',
    },
    completion: overrides.completion ?? {
      completed: 2,
      eligible: 3,
      rate: 0.6666666666666666,
    },
    questions: overrides.questions ?? [],
  };
}

describe('SummaryPanel', () => {
  it('renders the completion counts and the rate as a percentage', () => {
    render(<SummaryPanel summary={makeSummary()} />);

    expect(screen.getByText('2 of 3 members completed')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('renders a genuine zero rate as 0%', () => {
    render(
      <SummaryPanel
        summary={makeSummary({
          completion: { completed: 0, eligible: 3, rate: 0 },
        })}
      />,
    );

    expect(screen.getByText('0 of 3 members completed')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders no eligible members for a null rate and never a zero or NaN', () => {
    const { container } = render(
      <SummaryPanel
        summary={makeSummary({
          completion: { completed: 0, eligible: 0, rate: null },
        })}
      />,
    );

    expect(screen.getByText('no eligible members')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('NaN');
  });

  it('uses the server rate and never divides (rate 0.5 with 2 of 3)', () => {
    render(
      <SummaryPanel
        summary={makeSummary({
          completion: { completed: 2, eligible: 3, rate: 0.5 },
        })}
      />,
    );

    // The server said 50%, so the client shows 50%, not 67%.
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByText('67%')).not.toBeInTheDocument();
  });

  it('renders a null average from the real API state as no answers yet', () => {
    render(
      <SummaryPanel
        summary={makeSummary({
          questions: [
            {
              id: 'q1',
              position: 1,
              type: 'rating',
              prompt: 'How are you?',
              average: null,
              count: 0,
            },
            {
              id: 'q2',
              position: 2,
              type: 'yes_no',
              prompt: 'Did you ship?',
              yes: 0,
              no: 0,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('no answers yet')).toBeInTheDocument();
    expect(screen.getByText('0 yes, 0 no')).toBeInTheDocument();
  });

  it('never lets a hand-built NaN reach the DOM', () => {
    const { container } = render(
      <SummaryPanel
        summary={makeSummary({
          completion: { completed: 2, eligible: 3, rate: Number.NaN },
          questions: [
            {
              id: 'q1',
              position: 1,
              type: 'rating',
              prompt: 'How are you?',
              average: Number.NaN,
              count: 2,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('2 of 3 members completed')).toBeInTheDocument();
    // A non-finite rate must not become a false "no eligible members".
    expect(screen.queryByText('no eligible members')).not.toBeInTheDocument();
    expect(screen.getByText('no answers yet')).toBeInTheDocument();
    expect(container.textContent).not.toContain('NaN');
  });

  it('renders a single answer in the singular', () => {
    render(
      <SummaryPanel
        summary={makeSummary({
          questions: [
            {
              id: 'q1',
              position: 1,
              type: 'rating',
              prompt: 'How are you?',
              average: 5,
              count: 1,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('average 5 out of 5 from 1 answer')).toBeInTheDocument();
  });

  it('rounds an average to one decimal place for display', () => {
    render(
      <SummaryPanel
        summary={makeSummary({
          questions: [
            {
              id: 'q1',
              position: 1,
              type: 'rating',
              prompt: 'How are you?',
              average: 3.3333333333333335,
              count: 3,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('average 3.3 out of 5 from 3 answers')).toBeInTheDocument();
  });
});
