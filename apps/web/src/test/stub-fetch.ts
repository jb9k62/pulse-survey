/**
 * A tiny fetch stub for the component tests. It matches on the method and
 * pathname, records the calls, and answers `500` for a route that no test
 * stubbed so a forgotten stub shows up in the rendered text instead of hanging.
 *
 * Only test files import this helper, so it never reaches the bundle.
 */

import { vi } from 'vitest';

export interface StubRoute {
  method: string;
  path: string;
  search?: string;
  status?: number;
  body?: unknown;
}

export interface StubCall {
  method: string;
  path: string;
  body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  // A 204 must have no body; the Response constructor throws on one.
  if (status === 204) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function stubApi(routes: StubRoute[]): { calls: StubCall[] } {
  const calls: StubCall[] = [];

  const mock = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const path = url.pathname;
    const method = (init?.method ?? 'GET').toUpperCase();

    let body: unknown = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    calls.push({ method, path, body });

    const route = routes.find(
      (candidate) =>
        candidate.method.toUpperCase() === method &&
        candidate.path === path &&
        (candidate.search === undefined || candidate.search === url.search),
    );
    if (route === undefined) {
      return jsonResponse({ message: [`No stub for ${method} ${path}`] }, 500);
    }
    return jsonResponse(route.body ?? null, route.status ?? 200);
  };

  vi.stubGlobal('fetch', mock);
  return { calls };
}
