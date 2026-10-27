/**
 * The Manager flow: the survey list, then the summary of the selected survey.
 *
 * The screen returns the list and the summary side by side, not a `<main>`,
 * because `SignedInShell` already owns the page's `<main>`. It does not read
 * `useSession`, so it stays standalone-testable like `MemberScreen`.
 *
 * The selected survey is stored as an id and the item is derived in render, so
 * the list cannot go stale against the selection. The week label always comes
 * from the server; the client never computes or formats a date.
 */

import { useState } from 'react';
import { getSummary, listSurveys } from '../api/client.js';
import SummaryPanel from '../components/SummaryPanel.js';
import { useApiResult } from '../hooks/useApiResult.js';

export default function ManagerScreen() {
  const listState = useApiResult({ key: 'surveys', load: listSurveys });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    listState.status === 'ready'
      ? (listState.value.find((survey) => survey.id === selectedId) ?? null)
      : null;
  // The summary key names the survey and the week the list reported for it, so
  // a new selection is a new load and its loading state is derived, not set.
  const summaryState = useApiResult(
    selected === null
      ? null
      : {
          key: `${selected.id}:${selected.weekStart}`,
          load: () => getSummary(selected.id, selected.weekStart),
        },
  );

  return (
    <div className="manager">
      <section className="card">
        <h1>Surveys</h1>

        {listState.status === 'loading' && (
          <p className="muted">Loading surveys</p>
        )}
        {listState.status === 'failed' && (
          <p className="error" role="alert">
            {listState.failure.message}
          </p>
        )}
        {listState.status === 'ready' && listState.value.length === 0 && (
          <p className="muted">No surveys yet.</p>
        )}
        {listState.status === 'ready' && listState.value.length > 0 && (
          <section className="picker">
            <ul className="list">
              {listState.value.map((survey) => (
                <li key={survey.id}>
                  <button
                    className="list-button"
                    type="button"
                    aria-pressed={survey.id === selectedId}
                    onClick={() => {
                      setSelectedId(survey.id);
                    }}
                  >
                    {survey.title}{' '}
                    <span className="badge">{survey.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <section className="card" aria-live="polite">
        {summaryState.status === 'idle' && (
          <p className="detail-empty">
            Pick a survey to see this week&apos;s summary.
          </p>
        )}
        {summaryState.status === 'loading' && (
          <p className="muted">Loading the summary</p>
        )}
        {summaryState.status === 'failed' && (
          <p className="error" role="alert">
            {summaryState.failure.message}
          </p>
        )}
        {summaryState.status === 'ready' && (
          <>
            <header className="card-header">
              <p className="eyebrow">Weekly summary</p>
              <h2>{summaryState.value.survey.title}</h2>
              <p className="week">{summaryState.value.week.label}</p>
            </header>
            <SummaryPanel summary={summaryState.value} />
          </>
        )}
      </section>
    </div>
  );
}
