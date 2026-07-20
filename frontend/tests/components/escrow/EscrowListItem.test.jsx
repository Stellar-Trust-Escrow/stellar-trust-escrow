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
import EscrowListItem from '../../../components/escrow/EscrowListItem';
import { renderWithAppProviders } from '../../test-utils';

const baseEscrow = {
  id: 7,
  title: 'Logo Design Project',
  status: 'Active',
  totalAmount: '5000000000',
  milestoneProgress: '2 / 4',
  counterparty: 'GBXYZ...1234',
  role: 'client',
};

function withSize(el, { width = 300, height = 200 } = {}) {
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

describe('EscrowListItem (swipe-to-action)', () => {
  it('renders the underlying card', () => {
    renderWithAppProviders(<EscrowListItem escrow={baseEscrow} />);
    expect(screen.getByText('Logo Design Project')).toBeInTheDocument();
  });

  it('reveals a Dispute action button on swipe-left past threshold, and tapping it calls onDispute', () => {
    const onDispute = jest.fn();
    renderWithAppProviders(<EscrowListItem escrow={baseEscrow} onDispute={onDispute} />);

    const card = withSize(screen.getByTestId('escrow-swipe-row'));

    fireEvent.pointerDown(card, { clientX: 150, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 10, clientY: 0 }); // -140px (> 40% of 300)
    fireEvent.pointerUp(card, { clientX: 10, clientY: 0 });

    // The card stays open (translated left) revealing the Dispute button.
    expect(card.style.transform).toContain('translateX(-');
    const disputeButton = screen.getByRole('button', { name: /Dispute/i });
    fireEvent.click(disputeButton);

    expect(onDispute).toHaveBeenCalledTimes(1);
    expect(onDispute).toHaveBeenCalledWith(baseEscrow);
  });

  it('snaps back (no reveal) when the swipe is below threshold', () => {
    const onDispute = jest.fn();
    renderWithAppProviders(<EscrowListItem escrow={baseEscrow} onDispute={onDispute} />);

    const card = withSize(screen.getByTestId('escrow-swipe-row'));

    fireEvent.pointerDown(card, { clientX: 150, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 120, clientY: 0 }); // -30px (< 40%)
    fireEvent.pointerUp(card, { clientX: 120, clientY: 0 });

    // Snapped back — no translation, onDispute not triggered.
    expect(card.style.transform).toBe('');
    expect(onDispute).not.toHaveBeenCalled();
  });

  it('reveals Release all when canReleaseAll is true and swipe-right triggers onReleaseAll', () => {
    const onReleaseAll = jest.fn();
    renderWithAppProviders(
      <EscrowListItem escrow={baseEscrow} canReleaseAll onReleaseAll={onReleaseAll} />,
    );

    const card = withSize(screen.getByTestId('escrow-swipe-row'));

    fireEvent.pointerDown(card, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { clientX: 160, clientY: 0 }); // +160px
    fireEvent.pointerUp(card, { clientX: 160, clientY: 0 });

    expect(card.style.transform).toContain('translateX(');
    const releaseButton = screen.getByRole('button', { name: /Release all/i });
    fireEvent.click(releaseButton);

    expect(onReleaseAll).toHaveBeenCalledTimes(1);
    expect(onReleaseAll).toHaveBeenCalledWith(baseEscrow);
  });

  it('does not reveal Release all when canReleaseAll is false', () => {
    renderWithAppProviders(<EscrowListItem escrow={baseEscrow} onReleaseAll={jest.fn()} />);
    // No "Release all" button should be rendered without canReleaseAll.
    expect(screen.queryByRole('button', { name: /Release all/i })).not.toBeInTheDocument();
  });
});
