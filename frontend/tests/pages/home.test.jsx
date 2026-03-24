import { render, screen } from '@testing-library/react';
import HomePage from '../../app/page';

describe('HomePage', () => {
  it('renders hero heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders Create Escrow CTA link', () => {
    render(<HomePage />);
    const links = screen.getAllByRole('link', { name: /Create Escrow/i });
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders Browse Escrows link', () => {
    render(<HomePage />);
    expect(screen.getByRole('link', { name: /Browse Escrows/i })).toBeInTheDocument();
  });

  it('renders How It Works section', () => {
    render(<HomePage />);
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('renders all 3 how-it-works steps', () => {
    render(<HomePage />);
    // 'Create Escrow' appears as both a link and an h3 step title
    expect(screen.getAllByText('Create Escrow').length).toBeGreaterThan(0);
    expect(screen.getByText('Deliver Work')).toBeInTheDocument();
    expect(screen.getByText('Release Funds')).toBeInTheDocument();
  });

  it('renders features section', () => {
    render(<HomePage />);
    expect(screen.getByText('Milestone-Based Locking')).toBeInTheDocument();
    expect(screen.getByText('On-Chain Reputation')).toBeInTheDocument();
    expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
    expect(screen.getByText('Fully Decentralized')).toBeInTheDocument();
  });

  it('renders CTA section', () => {
    render(<HomePage />);
    expect(screen.getByText('Ready to Build Trust On-Chain?')).toBeInTheDocument();
  });

  it('renders platform stats placeholders', () => {
    render(<HomePage />);
    expect(screen.getByText('Escrows Created')).toBeInTheDocument();
    expect(screen.getByText('Total Value Locked')).toBeInTheDocument();
  });
});
