import { screen, fireEvent } from '@testing-library/react';
import CreateEscrowPage from '../../app/escrow/create/page';
import { useSearchParams } from 'next/navigation';
import { renderWithAppProviders } from '../test-utils';

describe('CreateEscrowPage', () => {
  beforeEach(() => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    localStorage.clear();
  });

  it('renders page heading', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    expect(screen.getByRole('heading', { name: 'Create New Escrow' })).toBeInTheDocument();
  });

  it('renders step indicators', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    expect(screen.getByText('Counterparty')).toBeInTheDocument();
    // 'Milestones' appears in both the step indicator and the step heading
    expect(screen.getAllByText('Milestones').length).toBeGreaterThan(0);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Sign')).toBeInTheDocument();
  });

  it('starts on step 1 (Counterparty)', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    expect(screen.getByText('Counterparty & Funds')).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('advances to step 2 when Next is clicked', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    // 'Milestones' appears in both the step indicator span and the section h2
    expect(screen.getAllByText('Milestones').length).toBeGreaterThan(0);
    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
  });

  it('goes back to step 1 from step 2', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Counterparty & Funds')).toBeInTheDocument();
  });

  it('advances to step 3 (Review)', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Review Details')).toBeInTheDocument();
  });

  it('advances to step 4 (Sign)', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText('Sign & Submit')).toBeInTheDocument();
  });

  it('updates freelancer address input', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    const input = screen.getByPlaceholderText('GABCD1234...');
    fireEvent.change(input, { target: { value: 'GABCDEF123' } });
    expect(input).toHaveValue('GABCDEF123');
  });

  it('shows Sign & Create Escrow button on step 4', () => {
    renderWithAppProviders(<CreateEscrowPage />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    }
    expect(screen.getByRole('button', { name: /Sign & Create Escrow/ })).toBeInTheDocument();
  });

  it('applies a selected template to pre-fill form fields', () => {
    renderWithAppProviders(<CreateEscrowPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));

    expect(screen.getByDisplayValue('4800')).toBeInTheDocument();
    expect(screen.getByText('Applied template: Freelance Website Launch')).toBeInTheDocument();
  });

  it('auto-applies quick-start template from query params', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('template=retainer-monthly-support'));

    renderWithAppProviders(<CreateEscrowPage />);

    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    expect(screen.getByText('Applied template: Monthly Retainer Support')).toBeInTheDocument();
  });
});
