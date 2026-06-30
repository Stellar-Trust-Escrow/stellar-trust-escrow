import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../components/error/ErrorBoundary';

// Suppress console.error noise from intentional throws in tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  console.error.mockRestore();
});

// Component that throws on render when the `shouldThrow` prop is true
function Bomb({ shouldThrow = false }) {
  if (shouldThrow) throw new Error('Test render error');
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows the error message in the fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Test render error/)).toBeInTheDocument();
  });

  it('renders a Try Again button in the fallback', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
  });

  it('remounts children when Try Again is clicked', () => {
    // After retry the Bomb no longer throws (we swap the prop via a wrapper)
    let throwError = true;
    function ControlledBomb() {
      if (throwError) throw new Error('boom');
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <ControlledBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Stop throwing before retry
    throwError = false;
    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('does not affect sibling sections when one throws', () => {
    render(
      <div>
        <ErrorBoundary>
          <Bomb shouldThrow />
        </ErrorBoundary>
        <div>Sibling content</div>
      </div>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Sibling content')).toBeInTheDocument();
  });

  it('calls onError callback when provided', () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });
});
