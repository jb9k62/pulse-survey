/**
 * Eligibility micro-world: the five Acme Members on a timeline. The reader changes who joined,
 * who left and who answered, and the rate is computed by the API's own `completionOf`.
 */

import { useState } from 'react';
import { completionOf } from '@api/surveys/summary.math.ts';
import {
  ACME_MEMBERS,
  PROMOTION_BUG,
  countCompleted,
  countEligible,
  verdictFor,
  type Person,
} from '../models/eligibility.ts';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const JOIN_OPTIONS = [
  { value: -30, label: 'long ago' },
  ...DAYS.map((day, index) => ({ value: index, label: day })),
  { value: 7, label: 'after the week' },
];

const LEAVE_OPTIONS = [
  { value: 'never', label: 'never' },
  { value: '-1', label: 'Sun before' },
  ...DAYS.map((day, index) => ({ value: String(index), label: day })),
];

const percentFormat = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 0,
});

export default function Eligibility() {
  const [people, setPeople] = useState<Person[]>(() => [...ACME_MEMBERS]);
  const [countRespondents, setCountRespondents] = useState(true);

  const eligible = countEligible(people, countRespondents);
  const completed = countCompleted(people);
  const completion = completionOf(completed, eligible);

  function update(id: string, change: Partial<Person>) {
    setPeople((current) =>
      current.map((person) =>
        person.id === id ? { ...person, ...change } : person,
      ),
    );
  }

  return (
    <div className="okfw-eligibility">
      <div className="okfw-presets" role="group" aria-label="Scenarios">
        <button
          type="button"
          onClick={() => {
            setPeople([...ACME_MEMBERS]);
            setCountRespondents(true);
          }}
        >
          The seed
        </button>
        <button
          type="button"
          data-probe
          onClick={() => {
            setPeople([...PROMOTION_BUG]);
            setCountRespondents(false);
          }}
        >
          Both respondents promoted, branch off
        </button>
      </div>
      <ul className="okfw-people">
        {people.map((person) => {
          const verdict = verdictFor(person, countRespondents);
          return (
            <li key={person.id} data-eligible={verdict.eligible}>
              <div className="okfw-person-head">
                <strong>{person.name}</strong>
                <span className="okfw-days" aria-hidden="true">
                  {DAYS.map((day, index) => {
                    const present =
                      person.joinDay <= index &&
                      (person.leaveDay === null || person.leaveDay > index);
                    return (
                      <span key={day} data-present={present}>
                        {day.charAt(0)}
                      </span>
                    );
                  })}
                </span>
                <span className="okfw-verdict">
                  {verdict.eligible ? 'eligible' : 'not eligible'}
                  <span className="okfw-reason">{verdict.reason}</span>
                </span>
              </div>
              <div className="okfw-person-controls">
                <label>
                  joined{' '}
                  <select
                    aria-label={`${person.name} joined`}
                    value={person.joinDay}
                    onChange={(event) =>
                      update(person.id, { joinDay: Number(event.target.value) })
                    }
                  >
                    {JOIN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  deactivated{' '}
                  <select
                    aria-label={`${person.name} deactivated`}
                    value={
                      person.leaveDay === null
                        ? 'never'
                        : String(person.leaveDay)
                    }
                    onChange={(event) =>
                      update(person.id, {
                        leaveDay:
                          event.target.value === 'never'
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  >
                    {LEAVE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  role now{' '}
                  <select
                    aria-label={`${person.name} role`}
                    value={person.role}
                    onChange={(event) =>
                      update(person.id, {
                        role:
                          event.target.value === 'manager'
                            ? 'manager'
                            : 'member',
                      })
                    }
                  >
                    <option value="member">Member</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${person.name} answered`}
                    checked={person.answered}
                    onChange={(event) =>
                      update(person.id, { answered: event.target.checked })
                    }
                  />{' '}
                  answered
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      <label className="okfw-toggle">
        <input
          type="checkbox"
          checked={countRespondents}
          onChange={(event) => setCountRespondents(event.target.checked)}
        />{' '}
        Also count anyone who responded this week (the <code>OR</code> branch in{' '}
        <code>countEligible</code>)
      </label>

      <div className="okfw-result" data-testid="eligibility-result">
        <span
          className="okfw-big"
          data-over={completion.rate !== null && completion.rate > 1}
        >
          {completion.rate === null
            ? 'no eligible members'
            : percentFormat.format(completion.rate)}
        </span>
        <span>
          {completed} of {eligible} members completed
        </span>
      </div>
      {completion.rate !== null && completion.rate > 1 && (
        <p className="okfw-warn" role="status">
          A rate above 100%: someone is in <code>completed</code> but not in{' '}
          <code>eligible</code>. Turn the <code>OR</code> branch back on and
          every respondent is counted, so this cannot happen.
        </p>
      )}
      <p className="okfw-model">
        Try the second scenario, then tick the branch back on. The rate is the
        API&apos;s own <code>completionOf</code>, never clamped, so the bug
        shows instead of hiding. The eligibility rule is a whole-day model of
        the SQL in <code>surveys.repository.ts</code>.
      </p>
    </div>
  );
}
