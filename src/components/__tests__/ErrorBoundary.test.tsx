import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

// Mock tauri invoke
vi.mock('../../lib/tauri', () => ({
  logCrash: vi.fn().mockResolvedValue(undefined),
}));

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test error');
  return <div>Content works</div>;
}

describe('ErrorBoundary', () => {
  // Suppress React error boundary console.error noise in tests
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('renders fallback on error', () => {
    render(
      <ErrorBoundary fallbackTitle="Oops">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Oops')).toBeDefined();
    expect(screen.getByText('Try again')).toBeDefined();
  });

  it('renders default fallback title when none provided', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('shows error details in expandable section', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Error details')).toBeDefined();
    expect(screen.getByText(/Test error/)).toBeDefined();
  });

  it('recovers on Try again click', () => {
    // Use a flag that can be changed between render cycles
    let shouldThrow = true;
    function ConditionalThrower() {
      if (shouldThrow) throw new Error('Test error');
      return <div>Content works</div>;
    }

    render(
      <ErrorBoundary fallbackTitle="Oops">
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText('Oops')).toBeDefined();

    // Stop throwing before clicking Try again
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try again'));

    expect(screen.getByText('Content works')).toBeDefined();
  });

  it('calls onReset when Try again is clicked', () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary fallbackTitle="Oops" onReset={onReset}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Try again'));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('calls logCrash on error', async () => {
    const { logCrash } = await import('../../lib/tauri');
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(logCrash).toHaveBeenCalledWith(
      'Test error',
      expect.any(String),
      expect.any(String)
    );
  });
});
