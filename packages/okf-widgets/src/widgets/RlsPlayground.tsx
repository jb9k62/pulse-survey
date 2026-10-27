/**
 * RLS playground: pick a caller, flip the switches the real system does not let you flip, and
 * watch which rows of `responses` come back. The predicate is the model in models/rls.ts.
 */

import { useId, useState } from 'react';
import {
  CALLERS,
  hasFilter,
  RESPONSES,
  runQuery,
  sqlFor,
  type Switches,
} from '../models/rls.ts';

const SWITCHES: readonly {
  key: keyof Switches;
  label: string;
  hint: string;
}[] = [
  {
    key: 'forgetFilter',
    label: 'The query forgets its organisation filter',
    hint: 'The bug every application-only scheme bets will never happen.',
  },
  {
    key: 'asOwner',
    label: 'The API connects as pulse_owner',
    hint: 'A table owner is exempt from its own policies.',
  },
  {
    key: 'withoutNullif',
    label: "Remove nullif(..., '') from the settings",
    hint: 'How migration 0000 first shipped, before the 22P02 bug was found.',
  },
];

function short(uuid: string): string {
  return uuid === '' ? "''" : `'${uuid.slice(0, 8)}…'`;
}

export default function RlsPlayground() {
  // Unique per mount, so two playgrounds on one page keep separate radio groups.
  const radioName = useId();
  const [callerId, setCallerId] = useState(CALLERS[0]!.id);
  const [switches, setSwitches] = useState<Switches>({
    asOwner: false,
    withoutNullif: false,
    forgetFilter: false,
  });

  const caller =
    CALLERS.find((candidate) => candidate.id === callerId) ?? CALLERS[0]!;
  const result = runQuery(caller, switches);
  const leaked =
    result.kind === 'rows' &&
    result.fates.some(
      (fate, index) =>
        fate.kept &&
        (RESPONSES[index]!.organisationId !== caller.org ||
          (caller.role !== 'manager' &&
            RESPONSES[index]!.userId !== caller.user)),
    );

  return (
    <div className="okfw-rls">
      <div className="okfw-columns">
        <section aria-label="Caller">
          <h4>Who is calling</h4>
          <div className="okfw-callers" role="radiogroup" aria-label="Caller">
            {CALLERS.map((candidate) => (
              <label key={candidate.id}>
                <input
                  type="radio"
                  name={radioName}
                  value={candidate.id}
                  checked={candidate.id === callerId}
                  onChange={() => setCallerId(candidate.id)}
                />{' '}
                {candidate.label}
              </label>
            ))}
          </div>
        </section>
        <section aria-label="Switches">
          <h4>Break something</h4>
          {SWITCHES.map((item) => (
            <label key={item.key} className="okfw-toggle">
              <input
                type="checkbox"
                checked={switches[item.key]}
                disabled={item.key === 'forgetFilter' && caller.org === ''}
                data-probe={item.key === 'forgetFilter' || undefined}
                onChange={(event) =>
                  setSwitches({ ...switches, [item.key]: event.target.checked })
                }
              />{' '}
              {item.label}
              <span className="okfw-reason">{item.hint}</span>
            </label>
          ))}
        </section>
      </div>

      <section aria-label="What the database does" className="okfw-db">
        <h4>The transaction</h4>
        <pre className="okfw-raw">
          {[
            `-- connected as ${switches.asOwner ? 'pulse_owner' : 'pulse_app'}`,
            `set_config('app.current_org',  ${short(caller.org)}, true)`,
            `set_config('app.current_user', ${short(caller.user)}, true)`,
            `set_config('app.current_role', '${caller.role}', true)`,
            '',
            sqlFor(caller, switches).replace(
              caller.org,
              short(caller.org).slice(1, -1),
            ),
          ].join('\n')}
        </pre>
        {!hasFilter(caller, switches) && caller.org === '' && (
          <p className="okfw-muted">
            No session, so there is no organisation to filter by.
          </p>
        )}

        {result.kind === 'error' ? (
          <p className="okfw-error" role="alert" data-testid="rls-result">
            {result.message}
          </p>
        ) : (
          <table className="okfw-table" data-testid="rls-result">
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Organisation</th>
                <th scope="col">Answered by</th>
                <th scope="col">Returned?</th>
              </tr>
            </thead>
            <tbody>
              {RESPONSES.map((row, index) => {
                const fate = result.fates[index]!;
                return (
                  <tr key={row.id} data-kept={fate.kept}>
                    <td>
                      <code>{row.id}</code>
                    </td>
                    <td>{row.organisationName}</td>
                    <td>{row.userName}</td>
                    <td>
                      <strong>{fate.kept ? 'returned' : 'hidden'}</strong>
                      <span className="okfw-reason">{fate.reason}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {leaked && (
          <p className="okfw-warn" role="status">
            A leak: this caller got a row they must never see.
          </p>
        )}
      </section>
      <p className="okfw-model">
        A model of <code>responses_select_org</code> and the settings fragments,
        not a live database. Try: forget the filter (nothing leaks, the policy
        holds), then also connect as the owner. Or pick &quot;No session&quot;
        and remove <code>nullif</code>.
      </p>
    </div>
  );
}
