import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from '../../../components/layout/Sidebar';
import { Home, Compass } from 'lucide-react';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, onClick, ...props }) => (
    <a href={href} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

const mockNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: <Home size={18} data-testid="icon-dashboard" /> },
  { href: '/explorer', label: 'Explorer', icon: <Compass size={18} data-testid="icon-explorer" /> },
];

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear();
    // Default to desktop viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event('resize'));
  });

  it('renders nav items with labels when expanded', () => {
    render(<Sidebar navItems={mockNavItems} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('collapses to icon-only mode on toggle', async () => {
    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} />);

    const collapseBtn = screen.getByLabelText('Collapse sidebar');
    await user.click(collapseBtn);

    // Sidebar should be collapsed (icon-only width)
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('w-[56px]');

    // Icons should still be present
    expect(screen.getByTestId('icon-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('icon-explorer')).toBeInTheDocument();

    // Expand button should appear
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('persists collapse state to localStorage', async () => {
    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} storageKey="test-sidebar" />);

    const collapseBtn = screen.getByLabelText('Collapse sidebar');
    await user.click(collapseBtn);

    expect(JSON.parse(localStorage.getItem('test-sidebar'))).toBe(true);
  });

  it('restores collapsed state from localStorage', () => {
    localStorage.setItem('test-sidebar', 'true');
    render(<Sidebar navItems={mockNavItems} storageKey="test-sidebar" />);

    // Sidebar should be collapsed on load
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('w-[56px]');
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('shows mobile overlay when hamburger is clicked', async () => {
    // Set mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} />);

    // Desktop sidebar should not be rendered
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    // Click hamburger
    const hamburger = screen.getByLabelText('Open sidebar navigation');
    await user.click(hamburger);

    // Sidebar should now be visible in the overlay
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides mobile overlay on backdrop click', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} />);

    const hamburger = screen.getByLabelText('Open sidebar navigation');
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    // Click backdrop
    const backdrop = document.querySelector('[aria-hidden="true"]');
    await user.click(backdrop);

    // Hamburger should reflect closed state
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides mobile overlay on Escape', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} />);

    const hamburger = screen.getByLabelText('Open sidebar navigation');
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('highlights active nav item', () => {
    render(<Sidebar navItems={mockNavItems} />);
    const dashboardLink = screen.getByText('Dashboard').closest('a');
    expect(dashboardLink?.className).toContain('bg-indigo-600/20');

    const explorerLink = screen.getByText('Explorer').closest('a');
    expect(explorerLink?.className).not.toContain('bg-indigo-600/20');
  });

  it('closes mobile overlay when a nav link is clicked', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const user = userEvent.setup();
    render(<Sidebar navItems={mockNavItems} />);

    const hamburger = screen.getByLabelText('Open sidebar navigation');
    await user.click(hamburger);
    expect(hamburger).toHaveAttribute('aria-expanded', 'true');

    const dashboardLink = screen.getByText('Dashboard');
    await user.click(dashboardLink);

    // Hamburger should reflect closed state after link click
    expect(hamburger).toHaveAttribute('aria-expanded', 'false');
  });

  it('has aria-expanded on hamburger button', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    render(<Sidebar navItems={mockNavItems} />);
    const btn = screen.getByLabelText('Open sidebar navigation');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});
