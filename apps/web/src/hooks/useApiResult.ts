/**
 * Fetch one API result for a key, following `learn/synchronizing-with-effects.md`
 * ("Fetching data") and the custom Hook in `learn/reusing-logic-with-custom-hooks.md`.
 *
 * `request` is `null` to load nothing, or a key plus the call to make. A new key
 * starts a new load. The loading state is derived in render by comparing the
 * key with the key of the last settled result, so no state is set synchronously
 * in the Effect and a stale response never shows under a newer key.
 * `useEffectEvent` reads the latest `load` without making it a dependency.
 */

import { useEffect, useEffectEvent, useState } from 'react';
import type { ApiResult, Failure } from '../api/client.js';

export type ApiState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'failed'; failure: Failure };

export interface ApiRequest<T> {
  key: string;
  load: () => Promise<ApiResult<T>>;
}

export function useApiResult<T>(request: ApiRequest<T> | null): ApiState<T> {
  const key = request?.key ?? null;
  const [settled, setSettled] = useState<{
    key: string;
    result: ApiResult<T>;
  } | null>(null);
  const load = useEffectEvent(() => request?.load() ?? null);

  useEffect(() => {
    if (key === null) {
      return;
    }
    const pending = load();
    if (pending === null) {
      return;
    }
    let ignore = false;
    void pending.then((result) => {
      if (!ignore) {
        setSettled({ key, result });
      }
    });
    return () => {
      ignore = true;
    };
  }, [key]);

  if (key === null) {
    return { status: 'idle' };
  }
  if (settled === null || settled.key !== key) {
    return { status: 'loading' };
  }
  return settled.result.ok
    ? { status: 'ready', value: settled.result.value }
    : { status: 'failed', failure: settled.result.failure };
}
