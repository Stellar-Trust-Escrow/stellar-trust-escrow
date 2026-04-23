import { screen } from '@testing-library/react';
import HomePage from '../../app/page';
import { renderWithAppProviders } from '../test-utils';

describe('HomePage', () => {
  it('renders hero heading', () => {
    renderWithAppProviders(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders Create Escrow CTA link', () => {
    renderWithAppProviders(<HomePage />);
    const links = screen.getAllByRole('link', { name: /Create Escrow/i });
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders Browse Escrows link', () => {
    renderWithAppProviders(<HomePage />);
    expect(screen.getByRole('link', { name: /Explorer/i })).toBeInTheDocument();
  });

  it('renders How It Works section', () => {
    renderWithAppProviders(<HomePage />);
    expect(screen.getByText('How It Works')).toBeInTheDocument();
  });

  it('renders all 3 how-it-works steps', () => {
    renderWithAppProviders(<HomePage />);
    // 'Create Escrow' appears as both a link and an h3 step title
    expect(screen.getAllByText('Create Escrow').length).toBeGreaterThan(0);
    expect(screen.getByText('Deliver Work')).toBeInTheDocument();
    expect(screen.getByText('Release Funds')).toBeInTheDocument();
  });

  it('renders features section', () => {
    renderWithAppProviders(<HomePage />);
    expect(screen.getByText('Trustless Milestone Escrow')).toBeInTheDocument();
    expect(screen.getByText('On-chain Reputation')).toBeInTheDocument();
    expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
    expect(screen.getByText('Global and Fast')).toBeInTheDocument();
  });

  it('renders CTA section', () => {
    renderWithAppProviders(<HomePage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Trustless Escrow for the Decentralized Economy/i,
      })
    ).toBeInTheDocument();
  });

  it('renders platform stats placeholders', () => {
    renderWithAppProviders(<HomePage />);
    expect(screen.getByText('Built for Freelancers & Clients')).toBeInTheDocument();
    expect(screen.getByText('Lock funds in milestone-based smart contracts and build on-chain reputation.')).toBeInTheDocument();
  });
});
