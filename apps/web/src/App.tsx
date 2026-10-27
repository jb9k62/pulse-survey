/**
 * The app shell: it composes the one Context provider and derives exactly one
 * of the five screen states in render, from the session state alone. There is
 * no router and no URL for a screen. Every state shares one `Layout`, which
 * owns the top bar and the page's `<main>`.
 */

import { useState, useTransition, type ReactNode } from 'react';
import MemberScreen from './screens/MemberScreen.js';
import ManagerScreen from './screens/ManagerScreen.js';
import SignInScreen from './screens/SignInScreen.js';
import SessionProvider from './session/SessionProvider.js';
import ThemeToggle from './theme/ThemeToggle.js';
import { useSession } from './session/session-context.js';
import type { SignedInSession } from '@pulse/contracts';

export default function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

function AppShell() {
  const { bootstrap } = useSession();

  if (bootstrap.status === 'loading') {
    return (
      <Layout>
        <p className="muted">Loading your session</p>
      </Layout>
    );
  }

  if (bootstrap.status === 'failed') {
    return (
      <Layout>
        <p className="error" role="alert">
          {bootstrap.failure.message}
        </p>
      </Layout>
    );
  }

  const { session } = bootstrap;

  if (!session.signedIn) {
    return (
      <Layout>
        <SignInScreen devSignIn={session.devSignIn} />
      </Layout>
    );
  }

  if (session.role === 'member') {
    return (
      <SignedInShell session={session}>
        <MemberScreen />
      </SignedInShell>
    );
  }

  return (
    <SignedInShell session={session}>
      <ManagerScreen />
    </SignedInShell>
  );
}

/**
 * The frame every screen sits in: a top bar with the brand, the optional
 * account controls and the theme toggle, then the page's one `<main>`.
 */
function Layout({
  account,
  children,
}: {
  account?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">&#9635; Pulse</span>
          <div className="topbar-actions">
            {account}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

function SignedInShell({
  session,
  children,
}: {
  session: SignedInSession;
  children: ReactNode;
}) {
  const { signOut } = useSession();
  const [isPending, startTransition] = useTransition();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  function handleSignOut(): void {
    startTransition(async () => {
      const result = await signOut();
      if (!result.ok) {
        // An update after an `await` needs its own transition (useTransition.md).
        startTransition(() => {
          setSignOutError(result.failure.message);
        });
      }
    });
  }

  const account = (
    <>
      <span className="account">
        <span>
          {session.user.name} at {session.organisation.name}
        </span>
        <span className="badge">
          {session.role === 'manager' ? 'Manager' : 'Member'}
        </span>
      </span>
      <button
        className="button button-ghost"
        type="button"
        disabled={isPending}
        onClick={handleSignOut}
      >
        Sign out
      </button>
    </>
  );

  return (
    <Layout account={account}>
      {signOutError !== null && (
        <p className="error messages" role="alert">
          {signOutError}
        </p>
      )}
      {children}
    </Layout>
  );
}
