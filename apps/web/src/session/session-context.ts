/**
 * The session Context and its hook, in their own module so
 * `SessionProvider.tsx` exports a component and nothing else. That is what the
 * `react/only-export-components` rule wants for Fast Refresh, and it keeps the
 * provider file about the one `GET /api/me` call it owns.
 *
 * The front end concept names `SessionProvider` as the only Context in the app;
 * this file is the Context itself, and the provider is the component beside it.
 */

import { createContext, useContext } from 'react';
import type { ApiResult, Failure } from '../api/client.js';
import type { SessionState } from '@pulse/contracts';

export type SessionBootstrap =
  | { status: 'loading' }
  | { status: 'failed'; failure: Failure }
  | { status: 'ready'; session: SessionState };

export interface SessionContextValue {
  bootstrap: SessionBootstrap;
  signIn: (userId: string) => Promise<ApiResult<SessionState>>;
  signOut: () => Promise<ApiResult<void>>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
