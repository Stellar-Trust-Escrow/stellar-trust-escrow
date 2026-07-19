// Polyfill PointerEvent for jsdom so @testing-library can dispatch pointer events.
if (typeof global.PointerEvent === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  global.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
    }
  };
}

import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../../components/ui/BottomSheet';

function withSize(el, { width = 400, height = 600 } = {}) {
  el.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return el;
}

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <BottomSheet isOpen={false} onClose={() => {}} title="Sheet">
        <p>content</p>
      </BottomSheet>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders a dialog with the provided title when open', () => {
    render(
      <BottomSheet isOpen onClose={() => {}} title="My Sheet">
        <p>content</p>
      </BottomSheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('My Sheet')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('closes when the backdrop is tapped', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Sheet">
        <p>content</p>
      </BottomSheet>,
    );
    const backdrop = screen.getByRole('dialog').previousSibling;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when swiped down past threshold on the drag handle', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Sheet">
        <p>content</p>
      </BottomSheet>,
    );
    const handle = withSize(screen.getByTestId('bottom-sheet-handle'), { height: 600 });

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 250 }); // > 35% of 600
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 250 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on a small downward drag (snap back)', () => {
    const onClose = jest.fn();
    render(
      <BottomSheet isOpen onClose={onClose} title="Sheet">
        <p>content</p>
      </BottomSheet>,
    );
    const handle = withSize(screen.getByTestId('bottom-sheet-handle'), { height: 600 });

    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: 0, clientY: 50 }); // < 35% of 600
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 50 });

    expect(onClose).not.toHaveBeenCalled();
  });
});
