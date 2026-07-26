import { render, screen, act } from '@testing-library/react';
import RelativeTime from '../../../components/ui/RelativeTime';

// Mock Tooltip to simplify testing
jest.mock('../../../components/ui/Tooltip', () => ({
  __esModule: true,
  default: ({ children, content }) => (
    <span data-testid="tooltip-wrapper" data-tooltip-content={content}>
      {children}
    </span>
  ),
}));

describe('RelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-26T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders "5 seconds ago" for timestamps within seconds', () => {
    const ts = new Date('2026-07-26T11:59:55Z').toISOString(); // 5 seconds ago
    render(<RelativeTime timestamp={ts} />);
    const el = screen.getByText(/5 seconds ago/i);
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('TIME');
  });

  it('renders minutes ago', () => {
    const ts = new Date('2026-07-26T11:55:00Z').toISOString(); // 5 minutes ago
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/5 minutes ago/i)).toBeInTheDocument();
  });

  it('renders hours ago', () => {
    const ts = new Date('2026-07-26T09:00:00Z').toISOString(); // 3 hours ago
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/3 hours ago/i)).toBeInTheDocument();
  });

  it('renders "yesterday" for ~1 day ago', () => {
    const ts = new Date('2026-07-25T12:00:00Z').toISOString(); // 1 day ago
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/yesterday/i)).toBeInTheDocument();
  });

  it('falls back to absolute date for timestamps older than 7 days', () => {
    const ts = new Date('2026-07-10T12:00:00Z').toISOString(); // 16 days ago
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/Jul 10, 2026/i)).toBeInTheDocument();
  });

  it('sets the dateTime attribute on the <time> element', () => {
    const ts = '2026-07-26T10:00:00Z';
    render(<RelativeTime timestamp={ts} />);
    const el = screen.getByText(/.+/);
    expect(el).toHaveAttribute('dateTime', ts);
  });

  it('shows absolute date in tooltip content', () => {
    const ts = new Date('2026-07-26T10:30:00Z').toISOString();
    render(<RelativeTime timestamp={ts} />);
    const wrapper = screen.getByTestId('tooltip-wrapper');
    expect(wrapper).toHaveAttribute('data-tooltip-content');
    expect(wrapper.getAttribute('data-tooltip-content')).toContain('2026');
  });

  it('auto-updates after 60 seconds', () => {
    // Initial: 5 min ago
    const ts = new Date('2026-07-26T11:55:00Z').toISOString();
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/5 minutes ago/i)).toBeInTheDocument();

    // Advance 60 seconds — now 6 min ago
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText(/6 minutes ago/i)).toBeInTheDocument();
  });

  it('returns null when timestamp is falsy', () => {
    const { container } = render(<RelativeTime timestamp={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('falls back to absolute for future dates', () => {
    const ts = new Date('2026-07-27T12:00:00Z').toISOString(); // tomorrow
    render(<RelativeTime timestamp={ts} />);
    const el = screen.getByText(/Jul 27, 2026/i);
    expect(el).toBeInTheDocument();
  });
});
