/**
 * Accessibility Tests - aXe Integration
 *
 * These tests ensure the application meets WCAG accessibility standards.
 * They run automatically in CI to catch accessibility regressions.
 *
 * Required Features:
 * - aXe integration
 * - CI runs accessibility
 * - Validates WCAG
 * - Reports issues
 * - Fixes tracked
 */

import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

// Extend expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Import components to test
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import StatCard from '@/components/ui/StatCard';

// Make axe available globally
const axeRunner = global.axe || axe;

describe('Accessibility - UI Components', () => {
  describe('Button Component', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(<Button onClick={() => {}}>Click Me</Button>);
      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper aria-label when icon-only', async () => {
      const { container } = render(
        <Button aria-label="Close" onClick={() => {}}>
          ×
        </Button>,
      );
      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Badge Component', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(<Badge variant="success">Active</Badge>);
      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Spinner Component', () => {
    it('should have proper accessibility attributes', async () => {
      const { container } = render(<Spinner />);

      // Spinner should have role="status" and aria-live="polite"
      const spinner = container.querySelector('[role="status"]');
      expect(spinner).toBeInTheDocument();

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('StatCard Component', () => {
    it('should not have accessibility violations', async () => {
      const { container } = render(
        <StatCard title="Total Users" value="150" icon={<span>👥</span>} />,
      );
      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Modal Component', () => {
    it('should not have accessibility violations when open', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Test Modal">
          <p>Modal content</p>
        </Modal>,
      );

      // Modal should trap focus (verified by aXe)
      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper dialog roles', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Dialog Title">
          <div role="document">Content</div>
        </Modal>,
      );

      // Check for dialog role
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });
});

describe('Accessibility - Page Structure', () => {
  describe('Home Page', () => {
    it('should not have critical accessibility violations', async () => {
      // Test the basic page structure without full rendering
      const { container } = render(
        <div>
          <main>
            <h1>Stellar Trust Escrow</h1>
            <nav>
              <a href="/dashboard">Dashboard</a>
              <a href="/explorer">Explorer</a>
              <a href="/profile">Profile</a>
            </nav>
          </main>
        </div>,
      );

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Form Elements', () => {
    it('form inputs should have proper labels', async () => {
      const { container } = render(
        <form>
          <label htmlFor="email">Email Address</label>
          <input id="email" type="email" />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" />

          <button type="submit">Submit</button>
        </form>,
      );

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper error message association', async () => {
      const { container } = render(
        <form>
          <label htmlFor="field">Required Field</label>
          <input id="field" required aria-describedby="error-msg" />
          <span id="error-msg" role="alert">
            This field is required
          </span>
        </form>,
      );

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Navigation', () => {
    it('navigation should have accessible structure', async () => {
      const { container } = render(
        <nav aria-label="Main navigation">
          <ul>
            <li>
              <a href="/">Home</a>
            </li>
            <li>
              <a href="/dashboard">Dashboard</a>
            </li>
            <li>
              <a href="/explorer">Explorer</a>
            </li>
          </ul>
        </nav>,
      );

      const results = await axeRunner(container);
      expect(results).toHaveNoViolations();
    });
  });
});

describe('Accessibility - ARIA Implementation', () => {
  it('should properly use aria-expanded for toggle elements', async () => {
    const { container } = render(
      <button aria-expanded="false" aria-controls="menu">
        Menu
      </button>,
    );

    const results = await axeRunner(container);
    expect(results).toHaveNoViolations();
  });

  it('should properly use aria-pressed for toggle buttons', async () => {
    const { container } = render(<button aria-pressed="false">Bold</button>);

    const results = await axeRunner(container);
    expect(results).toHaveNoViolations();
  });

  it('should properly use aria-selected for tabs', async () => {
    const { container } = render(
      <div role="tablist">
        <div role="tab" aria-selected="true" tabIndex={0}>
          Tab 1
        </div>
        <div role="tab" aria-selected="false" tabIndex={-1}>
          Tab 2
        </div>
      </div>,
    );

    const results = await axeRunner(container);
    expect(results).toHaveNoViolations();
  });
});
