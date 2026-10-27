/**
 * The weekly summary for one survey, pure and presentational: no state, no
 * effect and no fetch. The caller owns loading and failure.
 *
 * The client never divides. A percentage comes from `Intl.NumberFormat` with
 * `style: 'percent'`, which scales the server's fraction itself, and an
 * average is only rounded for display (10/3 shows as 3.3). Counts are
 * interpolated exactly as the server sent them. The null cases match contract
 * section 3.3: a null rate is "no eligible members" and a null average is "no
 * answers yet", never `0` and never `NaN`.
 *
 * The bars are decorative (`aria-hidden`). Their segments are sized with
 * `flex-grow` from the raw server numbers, so the browser does the proportion
 * and the client still never divides.
 */

import type { ReactNode } from 'react';
import type { QuestionSummary, Summary } from '@pulse/contracts';

// The top of the rating scale (1 is lowest, 5 is highest). Sizes the empty
// part of the bar and labels the average.
const RATING_MAX = 5;

// en-GB rather than en-ZA: en-ZA writes a decimal comma (4,5), and the rest
// of the app, its tests and the API labels all use a decimal point.
const percentFormat = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 0,
});

const averageFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 1,
});

function CompletionRate({ rate }: { rate: number | null }): ReactNode {
  if (rate === null) {
    return <p className="muted">no eligible members</p>;
  }
  // The parser rejects a non-finite rate, so this is defence in depth: if one
  // ever reaches the render, show nothing rather than a false statement or NaN.
  if (!Number.isFinite(rate)) {
    return null;
  }
  return <p className="stat-value">{percentFormat.format(rate)}</p>;
}

function Bar({
  fill,
  rest,
  restClass,
}: {
  fill: number;
  rest: number;
  restClass: string;
}): ReactNode {
  return (
    <div className="bar" aria-hidden="true">
      <span className="bar-fill" style={{ flexGrow: fill }} />
      <span className={restClass} style={{ flexGrow: rest }} />
    </div>
  );
}

function QuestionAnswer({
  question,
}: {
  question: QuestionSummary;
}): ReactNode {
  if (question.type === 'rating') {
    if (question.average === null || !Number.isFinite(question.average)) {
      return <p className="muted">no answers yet</p>;
    }
    return (
      <>
        <Bar
          fill={question.average}
          rest={RATING_MAX - question.average}
          restClass="bar-rest"
        />
        <p>
          {`average ${averageFormat.format(question.average)} out of ${RATING_MAX} from ${question.count} ${
            question.count === 1 ? 'answer' : 'answers'
          }`}
        </p>
      </>
    );
  }
  return (
    <>
      {question.yes + question.no > 0 && (
        <Bar fill={question.yes} rest={question.no} restClass="bar-no" />
      )}
      <p>{`${question.yes} yes, ${question.no} no`}</p>
    </>
  );
}

export default function SummaryPanel({ summary }: { summary: Summary }) {
  return (
    <div className="summary">
      <div className="stat">
        <CompletionRate rate={summary.completion.rate} />
        <p>
          {`${summary.completion.completed} of ${summary.completion.eligible} members completed`}
        </p>
      </div>
      <ol className="question-results">
        {summary.questions.map((question) => (
          <li className="question-result" key={question.id}>
            <h3>{question.prompt}</h3>
            <QuestionAnswer question={question} />
          </li>
        ))}
      </ol>
    </div>
  );
}
