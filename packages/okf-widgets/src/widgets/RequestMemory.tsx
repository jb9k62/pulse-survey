/**
 * Sharing the transaction: pick how the request transaction reaches the repository and how
 * many requests are in flight, and watch what Nest builds, what stays alive and what the pool
 * holds. The numbers come from the model in models/requestMemory.ts.
 */

import { useId, useState } from 'react';
import {
  FORGET,
  graphFor,
  poolSlots,
  POOL_MAX,
  scopesFor,
  STRATEGIES,
  tally,
  type Strategy,
} from '../models/requestMemory.ts';

/** Squares drawn per kind of instance before the widget switches to "+ n more". */
const DRAW_LIMIT = 120;

function Squares({ count, kind }: { count: number; kind: string }) {
  const drawn = Math.min(count, DRAW_LIMIT);
  return (
    <span className="okfw-squares" aria-hidden="true">
      {Array.from({ length: drawn }, (_, index) => (
        <span key={index} data-kind={kind} />
      ))}
      {count > drawn && <em className="okfw-muted"> + {count - drawn} more</em>}
    </span>
  );
}

/** 5000 as '5,000', the same in every browser locale. */
function withCommas(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function RequestMemory() {
  const radioName = useId();
  const [strategy, setStrategy] = useState<Strategy>('argument');
  const [inFlight, setInFlight] = useState(12);
  const [isLocal, setIsLocal] = useState(true);

  const graph = graphFor(strategy);
  const scopes = scopesFor(graph);
  const counts = tally(strategy, inFlight);
  const slots = poolSlots(inFlight, isLocal);
  const perRequest = counts.liveInstances - counts.singletons;

  return (
    <div className="okfw-memory">
      <div className="okfw-columns">
        <section aria-label="How the transaction is shared">
          <h4>How the repository gets the transaction</h4>
          <div role="radiogroup" aria-label="Strategy">
            {STRATEGIES.map((item) => (
              <label key={item.id} className="okfw-toggle">
                <input
                  type="radio"
                  name={radioName}
                  value={item.id}
                  checked={strategy === item.id}
                  data-probe={item.id === 'request-scoped' || undefined}
                  onChange={() => setStrategy(item.id)}
                />{' '}
                {item.label}
                <span className="okfw-reason">{item.hint}</span>
              </label>
            ))}
          </div>
        </section>
        <section aria-label="Load">
          <h4>Load</h4>
          <label className="okfw-row">
            Requests in flight: <strong>{inFlight}</strong>
            <input
              className="okfw-slider"
              type="range"
              min={1}
              max={60}
              value={inFlight}
              aria-label="Requests in flight"
              onChange={(event) => setInFlight(Number(event.target.value))}
            />
          </label>
          <label className="okfw-toggle">
            <input
              type="checkbox"
              checked={!isLocal}
              onChange={(event) => setIsLocal(!event.target.checked)}
            />{' '}
            Set the organisation with is_local = false
            <span className="okfw-reason">
              What the stamp would do if it did not fade.
            </span>
          </label>
        </section>
      </div>

      <section aria-label="What Nest builds">
        <h4>What Nest builds</h4>
        <ul className="okfw-tree">
          {graph.map((node) => {
            const scope = scopes.get(node.name);
            return (
              <li key={node.name} data-scope={scope}>
                <code>{node.name}</code>
                {node.deps.length > 0 && (
                  <span className="okfw-muted">
                    {' '}
                    needs {node.deps.join(', ')}
                  </span>
                )}
                <strong>
                  {scope === 'singleton'
                    ? 'built once at startup'
                    : node.declaredRequest
                      ? 'built for every request (declared)'
                      : 'built for every request (inherited)'}
                </strong>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Alive right now" data-testid="memory-result">
        <h4>Alive right now</h4>
        <dl className="okfw-facts">
          <dt>Singletons</dt>
          <dd>
            {counts.singletons}{' '}
            <Squares count={counts.singletons} kind="once" />
          </dd>
          <dt>Per-request instances</dt>
          <dd>
            {perRequest} ({counts.builtPerRequest} × {inFlight}){' '}
            <Squares count={perRequest} kind="request" />
          </dd>
          {counts.extraPerRequest > 0 && (
            <>
              <dt>ALS stores</dt>
              <dd>
                {inFlight} <Squares count={inFlight} kind="store" />
              </dd>
            </>
          )}
          <dt>Built and thrown away per 1,000 requests</dt>
          <dd>{withCommas(counts.garbagePer1000)}</dd>
        </dl>
        <p className="okfw-muted">
          The same in every strategy, for each request: the request object, one
          transaction handle and one borrowed connection.
        </p>
      </section>

      <section aria-label="The pool">
        <h4>
          The pool: {counts.borrowed} of {POOL_MAX} connections borrowed
          {counts.waiting > 0 && `, ${counts.waiting} requests waiting`}
        </h4>
        <ol className="okfw-pool">
          {slots.map((slot) => (
            <li
              key={slot.index}
              data-busy={slot.holder !== null}
              data-stale={slot.leftover !== null}
            >
              <span>#{slot.index + 1}</span>
              {slot.holder
                ? slot.holder
                : slot.leftover
                  ? `idle, still ${slot.leftover}`
                  : 'idle, clean'}
            </li>
          ))}
        </ol>
        {!isLocal && inFlight < POOL_MAX && (
          <p className="okfw-warn" role="status">
            An idle connection still carries the last caller&apos;s
            organisation. The next request to borrow it starts as that
            organisation until it sets its own.
          </p>
        )}
      </section>

      <section aria-label="If code forgets the transaction">
        <h4>If code forgets the transaction</h4>
        <p className="okfw-note">{FORGET[strategy]}</p>
      </section>

      <p className="okfw-model">
        A model that counts objects, not a heap measurement. The provider graph
        is the surveys path of the API. Try: slide to 60 requests with each
        strategy, then tick is_local = false and bring the load under 10.
      </p>
    </div>
  );
}
