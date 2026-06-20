import { render, screen } from '@testing-library/react';
import Footer from '../../../components/layout/Footer';

describe('Footer', () => {
  it('renders copyright text', () => {
    render(<Footer />);
    expect(screen.getByText(/StellarTrustEscrow/)).toBeInTheDocument();
  });

  it('renders GitHub link', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeInTheDocument();
  });

  it('renders Docs link', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
  });
});
