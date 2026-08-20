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

import { createElement } from 'react';
import { render, renderHook, fireEvent, screen, act } from '@testing-library/react';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';

// Helper: force an element to report a known size (jsdom returns 0 by default).
function withSize(el, { width = 200, height = 200 } = {}) {
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

function Harness(props) {
  const { offset, bind } = useSwipeGesture(props);
  return createElement(
    'div',
    { 'data-testid': 'box', style: { width: 200, height: 200 }, ...bind },
    'offset:' + offset,
  );
}

const h = createElement;

describe('useSwipeGesture', () => {
  it('returns an offset of 0 and no handlers initially', () => {
    const { result } = renderHook(() => useSwipeGesture());
    expect(result.current.offset).toBe(0);
    expect(result.current.swiping).toBe(false);
    expect(typeof result.current.bind.onPointerDown).toBe('function');
  });

  it('fires onSwipeLeft when swiped past threshold (axis x)', () => {
    const onSwipeLeft = jest.fn();
    render(h(Harness, { axis: 'x', threshold: 0.4, onSwipeLeft }));
    const box = withSize(screen.getByTestId('box'));

    fireEvent.pointerDown(box, { clientX: 100, clientY: 0 });
    fireEvent.pointerMove(box, { clientX: 20, clientY: 0 }); // -80px
    fireEvent.pointerUp(box, { clientX: 20, clientY: 0 });

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
  });

  it('snaps back (no callback) when swipe is below threshold', () => {
    const onSwipeLeft = jest.fn();
    render(h(Harness, { axis: 'x', threshold: 0.4, onSwipeLeft }));
    const box = withSize(screen.getByTestId('box'));

    fireEvent.pointerDown(box, { clientX: 100, clientY: 0 });
    fireEvent.pointerMove(box, { clientX: 70, clientY: 0 }); // -30px (< 40% of 200 = 80)
    fireEvent.pointerUp(box, { clientX: 70, clientY: 0 });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('fires onSwipeRight when swiped right past threshold', () => {
    const onSwipeRight = jest.fn();
    render(h(Harness, { axis: 'x', threshold: 0.4, onSwipeRight }));
    const box = withSize(screen.getByTestId('box'));

    fireEvent.pointerDown(box, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(box, { clientX: 100, clientY: 0 }); // +100px
    fireEvent.pointerUp(box, { clientX: 100, clientY: 0 });

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('fires onSwipeDown only for downward movement (axis y)', () => {
    const onSwipeDown = jest.fn();
    render(h(Harness, { axis: 'y', threshold: 0.4, onSwipeDown }));
    const box = withSize(screen.getByTestId('box'), { height: 200 });

    fireEvent.pointerDown(box, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(box, { clientX: 0, clientY: 120 }); // +120px down
    fireEvent.pointerUp(box, { clientX: 0, clientY: 120 });

    expect(onSwipeDown).toHaveBeenCalledTimes(1);
  });

  it('ignores upward movement on the y axis (does not dismiss)', () => {
    const onSwipeDown = jest.fn();
    render(h(Harness, { axis: 'y', threshold: 0.4, onSwipeDown }));
    const box = withSize(screen.getByTestId('box'), { height: 200 });

    fireEvent.pointerDown(box, { clientX: 0, clientY: 120 });
    fireEvent.pointerMove(box, { clientX: 0, clientY: 20 }); // upward
    fireEvent.pointerUp(box, { clientX: 0, clientY: 20 });

    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it('resets offset when the gesture is cancelled', () => {
    const { result } = renderHook(() => useSwipeGesture());
    const { bind } = result.current;

    act(() => {
      bind.onPointerDown({
        currentTarget: { getBoundingClientRect: () => ({ width: 200, height: 200 }) },
        clientX: 100,
        clientY: 0,
      });
      bind.onPointerMove({ clientX: 40, clientY: 0 });
    });
    expect(result.current.offset).toBe(-60);

    act(() => {
      bind.onPointerCancel({ clientX: 40, clientY: 0 });
    });
    expect(result.current.offset).toBe(0);
    expect(result.current.swiping).toBe(false);
  });
});
