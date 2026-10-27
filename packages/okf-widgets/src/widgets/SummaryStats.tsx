/**
 * Summary sandbox: the whole summary path with the real code at each step. The reader edits
 * the responses; the widget builds the raw tallies PostgreSQL would return, runs the API's
 * `completionOf`, `ratingOf` and `yesNoOf`, checks the payload with the shared
 * `summarySchema`, and renders the web app's own `SummaryPanel`.
 */

import { useState } from 'react';
import { summarySchema, type Summary } from '@pulse/contracts';
import {
  completionOf,
  ratingOf,
  yesNoOf,
  type QuestionTally,
} from '@api/surveys/summary.math.ts';
import { weekOf } from '@api/surveys/week.ts';
import SummaryPanel from '@web/components/SummaryPanel.tsx';
import { pgAverage } from '../models/pgAverage.ts';

interface Answers {
  id: number;
  week: number;
  support: boolean;
  clarity: number;
}

const SEEDED: readonly Answers[] = [
  { id: 1, week: 5, support: true, clarity: 4 },
  { id: 2, week: 4, support: false, clarity: 3 },
];

function ratingTally(
  values: readonly number[],
  corrupt: boolean,
): QuestionTally {
  return {
    ratingAverage:
      corrupt && values.length > 0 ? 'not a number' : pgAverage(values),
    ratingCount: values.length,
    yesCount: 0,
    noCount: 0,
  };
}

function yesNoTally(values: readonly boolean[]): QuestionTally {
  return {
    ratingAverage: null,
    ratingCount: 0,
    yesCount: values.filter(Boolean).length,
    noCount: values.filter((value) => !value).length,
  };
}

export default function SummaryStats() {
  const [responses, setResponses] = useState<Answers[]>(() => [...SEEDED]);
  const [eligible, setEligible] = useState(4);
  const [corrupt, setCorrupt] = useState(false);
  const [draft, setDraft] = useState({ week: 3, support: true, clarity: 3 });
  const [nextId, setNextId] = useState(SEEDED.length + 1);

  const tallies = {
    week: ratingTally(
      responses.map((row) => row.week),
      corrupt,
    ),
    support: yesNoTally(responses.map((row) => row.support)),
    clarity: ratingTally(
      responses.map((row) => row.clarity),
      corrupt,
    ),
  };

  const payload: Summary = {
    survey: {
      id: 'acme-weekly-pulse',
      title: 'Acme weekly pulse',
      status: 'active',
    },
    week: weekOf('2026-09-21'),
    // The eligible count is a separate query in the app; here the reader sets it, and it is
    // never below the number of responses, as the OR branch guarantees.
    completion: completionOf(
      responses.length,
      Math.max(eligible, responses.length),
    ),
    questions: [
      {
        id: 'q1',
        position: 1,
        prompt: 'How was your week?',
        type: 'rating',
        ...ratingOf(tallies.week),
      },
      {
        id: 'q2',
        position: 2,
        prompt: 'Did you get the support you needed?',
        type: 'yes_no',
        ...yesNoOf(tallies.support),
      },
      {
        id: 'q3',
        position: 3,
        prompt: 'How clear were your priorities?',
        type: 'rating',
        ...ratingOf(tallies.clarity),
      },
    ],
  };
  const parsed = summarySchema.safeParse(payload);

  function add() {
    setResponses((current) => [...current, { id: nextId, ...draft }]);
    setNextId((id) => id + 1);
  }

  return (
    <div className="okfw-summary">
      <div className="okfw-columns">
        <section aria-label="Responses this week">
          <h4>1. Responses this week</h4>
          <ul className="okfw-responses">
            {responses.map((row) => (
              <li key={row.id}>
                <span>
                  {row.week}, {row.support ? 'yes' : 'no'}, {row.clarity}
                </span>
                <button
                  type="button"
                  aria-label={`Remove response ${row.week}, ${row.support ? 'yes' : 'no'}, ${row.clarity}`}
                  onClick={() =>
                    setResponses((current) =>
                      current.filter((other) => other.id !== row.id),
                    )
                  }
                >
                  remove
                </button>
              </li>
            ))}
            {responses.length === 0 && <li className="okfw-muted">none yet</li>}
          </ul>
          <div className="okfw-add">
            <label>
              Q1{' '}
              <select
                value={draft.week}
                onChange={(event) =>
                  setDraft({ ...draft, week: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Q2{' '}
              <select
                value={draft.support ? 'yes' : 'no'}
                onChange={(event) =>
                  setDraft({ ...draft, support: event.target.value === 'yes' })
                }
              >
                <option>yes</option>
                <option>no</option>
              </select>
            </label>
            <label>
              Q3{' '}
              <select
                value={draft.clarity}
                onChange={(event) =>
                  setDraft({ ...draft, clarity: Number(event.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <button type="button" data-probe onClick={add}>
              Add response
            </button>
          </div>
          <label className="okfw-row">
            Eligible Members{' '}
            <input
              type="number"
              min={0}
              max={20}
              value={eligible}
              onChange={(event) =>
                setEligible(Math.max(0, Number(event.target.value) || 0))
              }
            />
          </label>
          <label className="okfw-toggle">
            <input
              type="checkbox"
              checked={corrupt}
              onChange={(event) => setCorrupt(event.target.checked)}
            />{' '}
            Make <code>avg()</code> return something unparsable
          </label>
        </section>

        <section aria-label="What PostgreSQL returns">
          <h4>2. What PostgreSQL returns (a model)</h4>
          <pre className="okfw-raw">
            {[
              `completed = ${responses.length}`,
              `eligible  = ${Math.max(eligible, responses.length)}`,
              `Q1 avg    = ${JSON.stringify(tallies.week.ratingAverage)}, count = ${tallies.week.ratingCount}`,
              `Q2 yes    = ${tallies.support.yesCount}, no = ${tallies.support.noCount}`,
              `Q3 avg    = ${JSON.stringify(tallies.clarity.ratingAverage)}, count = ${tallies.clarity.ratingCount}`,
            ].join('\n')}
          </pre>
        </section>

        <section aria-label="What the API sends">
          <h4>3. What the API sends</h4>
          <pre className="okfw-raw" data-testid="summary-json">
            {[
              `completion: ${JSON.stringify(payload.completion)}`,
              ...payload.questions.map((question) =>
                question.type === 'rating'
                  ? `Q${question.position}: ${JSON.stringify({ average: question.average, count: question.count })}`
                  : `Q${question.position}: ${JSON.stringify({ yes: question.yes, no: question.no })}`,
              ),
            ].join('\n')}
          </pre>
        </section>

        <section aria-label="What the Manager sees">
          <h4>4. What the Manager sees</h4>
          {parsed.success ? (
            <div className="okfw-panel">
              <SummaryPanel summary={parsed.data} />
            </div>
          ) : (
            <p className="okfw-warn">
              The shared schema rejected the payload: {parsed.error.message}
            </p>
          )}
        </section>
      </div>
      <p className="okfw-model">
        Steps 3 and 4 are the real code: <code>completionOf</code>,{' '}
        <code>ratingOf</code> and <code>yesNoOf</code> from the API,{' '}
        <code>summarySchema</code> from <code>@pulse/contracts</code>, and the
        web app&apos;s <code>SummaryPanel</code>. Step 2 is a model of the SQL.
        Try: remove every response, set eligible to 0, or corrupt the average.
      </p>
    </div>
  );
}
