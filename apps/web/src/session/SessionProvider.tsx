/**
 * The only Context in the app, as the front end concept names it. It owns the
 * single `GET /api/me` call and exposes `signIn`, `signOut` and the bootstrap
 * state. Every other value is derived in render, not synced by an effect.
 *
 * The bootstrap fetch lives here so the whole app reads one copy of the
 * session. A sign-in or sign-out answer replaces the fetched session from then
 * on, without a second `GET /api/me`. The session is display state only: the
 * API derives the user and organisation from the cookie on every request.
 */

import { useState, type ReactNode } from 'react';
import type { SessionState } from '@pulse/contracts';
import {
  getSessionState,
  signInWithDevUser,
  signOut as signOutRequest,
} from '../api/client.js';
import type { ApiResult } from '../api/client.js';
import { useApiResult } from '../hooks/useApiResult.js';
import { SessionContext, type SessionBootstrap } from './session-context.js';

export default function SessionProvider({ children }: { children: ReactNode }) {
  const fetched = useApiResult({ key: 'me', load: getSessionState });
  const [replaced, setReplaced] = useState<SessionState | null>(null);

  let bootstrap: SessionBootstrap;
  if (replaced !== null) {
    bootstrap = { status: 'ready', session: replaced };
  } else if (fetched.status === 'ready') {
    bootstrap = { status: 'ready', session: fetched.value };
  } else if (fetched.status === 'failed') {
    bootstrap = { status: 'failed', failure: fetched.failure };
  } else {
    bootstrap = { status: 'loading' };
  }

  async function signIn(userId: string): Promise<ApiResult<SessionState>> {
    const result = await signInWithDevUser(userId);
    if (result.ok) {
      setReplaced(result.value);
    }
    return result;
  }

  async function signOut(): Promise<ApiResult<void>> {
    const result = await signOutRequest();
    if (result.ok) {
      const devSignIn =
        bootstrap.status === 'ready' ? bootstrap.session.devSignIn : false;
      setReplaced({
        signedIn: false,
        user: null,
        organisation: null,
        role: null,
        devSignIn,
      });
    }
    return result;
  }

  return (
    <SessionContext.Provider value={{ bootstrap, signIn, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
