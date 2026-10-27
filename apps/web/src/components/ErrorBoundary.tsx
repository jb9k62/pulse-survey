/**
 * The one error boundary in the app, per `reference/react/Component.md:205-233`
 * and `:935-953`: `static getDerivedStateFromError` and `componentDidCatch` are
 * the only boundary API, and there is no function-component equivalent.
 *
 * API failures are values, not throws, so only a programming error reaches
 * this boundary.
 */

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return (
        <main className="page">
          <h1>Something went wrong</h1>
          <p className="error" role="alert">
            {this.state.error.message}
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
