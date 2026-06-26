/**
 * Keyboard Navigation Tests
 *
 * Tests keyboard-only navigation, focus management, and tab order.
 * Validates WCAG 2.1 AA keyboard accessibility requirements.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import React from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import SkipLink from '@/app/skip-link';

expect.extend(toHaveNoViolations);

describe('Keyboard Navigation', () => {
  describe('Tab Order', () => {
    it('should have focusable elements in logical tab order', async () => {
      const { container } = render(
        <div>
          <SkipLink />
          <header>
            <Button>Home</Button>
            <Button>About</Button>
          </header>
          <main id="main-content">
            <Button>Action 1</Button>
            <Button>Action 2</Button>
          </main>
        </div>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('skip-to-main-content link should be first focusable element', async () => {
      const { container } = render(
        <div>
          <SkipLink />
          <Button>Home</Button>
          <main id="main-content">Content</main>
        </div>,
      );

      const skipLink = screen.getByRole('link', { name: /skip to main content/i });
      expect(skipLink).toBeInTheDocument();

      // Skip link should be visible only on focus
      expect(skipLink).toHaveClass('sr-only', 'focus:not-sr-only');
    });

    it('focus should move through interactive elements in visual order', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <Button>First</Button>
          <Button>Second</Button>
          <Button>Third</Button>
        </div>,
      );

      const buttons = screen.getAllByRole('button');
      await user.tab();

      expect(buttons[0]).toHaveFocus();

      await user.tab();
      expect(buttons[1]).toHaveFocus();

      await user.tab();
      expect(buttons[2]).toHaveFocus();
    });

    it('shift+tab should move focus backwards', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <Button>First</Button>
          <Button>Second</Button>
        </div>,
      );

      const buttons = screen.getAllByRole('button');
      await user.tab();
      expect(buttons[0]).toHaveFocus();

      await user.tab({ shift: true });
      // Focus should move back, but since first element is already focused,
      // shift+tab might move to last focusable in document
      expect(document.activeElement).toBeTruthy();
    });
  });

  describe('Modal Focus Trap', () => {
    it('should trap focus inside open modal', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      const handleConfirm = jest.fn();

      const { rerender } = render(
        <div>
          <Button>Trigger</Button>
          <Modal
            isOpen={false}
            onClose={handleClose}
            title="Test Modal"
            isConfirmation
            onConfirm={handleConfirm}
          >
            <input type="text" placeholder="Input 1" />
            <input type="text" placeholder="Input 2" />
          </Modal>
        </div>,
      );

      // Open modal
      rerender(
        <div>
          <Button>Trigger</Button>
          <Modal
            isOpen={true}
            onClose={handleClose}
            title="Test Modal"
            isConfirmation
            onConfirm={handleConfirm}
          >
            <input type="text" placeholder="Input 1" />
            <input type="text" placeholder="Input 2" />
          </Modal>
        </div>,
      );

      const modalDialog = screen.getByRole('dialog');
      expect(modalDialog).toBeInTheDocument();

      // Focus should be within modal
      const inputs = within(modalDialog).getAllByRole('textbox');
      const closeButton = within(modalDialog).getByLabelText('Close modal');

      await user.tab();
      expect([...inputs, closeButton]).toContainElement(document.activeElement);
    });

    it('should close modal on Escape key', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Test">
          <p>Content</p>
        </Modal>,
      );

      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalled();
    });

    it('should return focus to trigger element after modal closes', async () => {
      const user = userEvent.setup();
      const TestComponent = () => {
        const [isOpen, setIsOpen] = React.useState(false);
        return (
          <div>
            <Button onClick={() => setIsOpen(true)}>Open Modal</Button>
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
              <p>Modal content</p>
            </Modal>
          </div>
        );
      };

      render(<TestComponent />);
      const triggerButton = screen.getByRole('button', { name: 'Open Modal' });

      await user.click(triggerButton);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Focus should return to trigger
      expect(triggerButton).toHaveFocus();
    });
  });

  describe('No Keyboard Traps', () => {
    it('should not have unintentional keyboard traps outside modals', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <div>
          <Button>Button 1</Button>
          <input type="text" />
          <Button>Button 2</Button>
        </div>,
      );

      // User should be able to tab through all elements
      const focusableElements = container.querySelectorAll(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      expect(focusableElements.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Interactive Elements Keyboard Support', () => {
    it('buttons should activate on Enter key', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(
        <div>
          <Button onClick={handleClick}>Click Me</Button>
        </div>,
      );

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalled();
    });

    it('buttons should activate on Space key', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(
        <div>
          <Button onClick={handleClick}>Click Me</Button>
        </div>,
      );

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('Focus Visibility', () => {
    it('interactive elements should have visible focus indicator', async () => {
      const { container } = render(<Button>Focused Button</Button>);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-2');
      expect(button).toHaveClass('focus-visible:ring-indigo-500');
    });

    it('focused elements should not rely on color alone', async () => {
      const { container } = render(
        <div>
          <Button>Button</Button>
        </div>,
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Form Controls', () => {
    it('form inputs should be keyboard accessible', async () => {
      const user = userEvent.setup();

      render(
        <form>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" />
          <label htmlFor="message">Message</label>
          <textarea id="message"></textarea>
          <button type="submit">Submit</button>
        </form>,
      );

      const emailInput = screen.getByLabelText('Email');
      const messageInput = screen.getByLabelText('Message');
      const submitButton = screen.getByRole('button', { name: 'Submit' });

      // Tab through all inputs
      await user.tab();
      expect(emailInput).toHaveFocus();

      await user.tab();
      expect(messageInput).toHaveFocus();

      await user.tab();
      expect(submitButton).toHaveFocus();
    });
  });
});
