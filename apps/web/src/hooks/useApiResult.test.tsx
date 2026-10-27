import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ApiResult } from '../api/client.js';
import { useApiResult, type ApiRequest } from './useApiResult.js';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('useApiResult', () => {
  it('is idle and loads nothing for a null request', () => {
    const { result } = renderHook(() => useApiResult<string>(null));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('goes from loading to ready, and to failed for a failure', async () => {
    const ok = renderHook(() =>
      useApiResult({ key: 'a', load: async () => ({ ok: true, value: 1 }) }),
    );
    expect(ok.result.current).toEqual({ status: 'loading' });
    await waitFor(() => {
      expect(ok.result.current).toEqual({ status: 'ready', value: 1 });
    });

    const failure = { kind: 'network', message: 'down' } as const;
    const failed = renderHook(() =>
      useApiResult<number>({
        key: 'b',
        load: async () => ({ ok: false, failure }),
      }),
    );
    await waitFor(() => {
      expect(failed.result.current).toEqual({ status: 'failed', failure });
    });
  });

  it('never shows a stale response under a newer key', async () => {
    const first = deferred<ApiResult<string>>();
    const second = deferred<ApiResult<string>>();
    const requests: Record<string, ApiRequest<string>> = {
      first: { key: 'first', load: () => first.promise },
      second: { key: 'second', load: () => second.promise },
    };
    const { result, rerender } = renderHook(
      ({ name }: { name: string }) => useApiResult(requests[name] ?? null),
      { initialProps: { name: 'first' } },
    );

    rerender({ name: 'second' });
    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => {
      first.resolve({ ok: true, value: 'stale' });
      await first.promise;
    });
    expect(result.current).toEqual({ status: 'loading' });

    await act(async () => {
      second.resolve({ ok: true, value: 'fresh' });
      await second.promise;
    });
    expect(result.current).toEqual({ status: 'ready', value: 'fresh' });
  });
});
