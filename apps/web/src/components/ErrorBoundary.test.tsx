import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.js';

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows the alert fallback when a child throws during render', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    function Boom(): never {
      throw new Error('Boom went the render');
    }

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Boom went the render');

    consoleError.mockRestore();
  });
});
