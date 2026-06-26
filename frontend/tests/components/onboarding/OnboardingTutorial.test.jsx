import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingTutorial, { useOnboardingTutorial } from '../../../components/onboarding/OnboardingTutorial';

describe('OnboardingTutorial', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('shows on first visit when not completed', () => {
    render(<OnboardingTutorial force={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Stellar Escrow')).toBeInTheDocument();
  });

  it('does not show when tutorial is completed', () => {
    localStorage.setItem('ste_tutorial_completed', 'true');
    render(<OnboardingTutorial />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows when force prop is true', () => {
    localStorage.setItem('ste_tutorial_completed', 'true');
    render(<OnboardingTutorial force={true} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('advances to next step on Next button click', () => {
    render(<OnboardingTutorial force={true} />);
    expect(screen.getByText('Welcome to Stellar Escrow')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
  });

  it('closes tutorial and saves completion on Skip button click', async () => {
    render(<OnboardingTutorial force={true} />);
    fireEvent.click(screen.getByText('Skip'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('ste_tutorial_completed')).toBe('true');
  });

  it('shows Finish button on last step', () => {
    render(<OnboardingTutorial force={true} />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('Next →'));
    }
    expect(screen.getByText('Finish')).toBeInTheDocument();
  });

  it('closes and saves completion on Finish click', async () => {
    render(<OnboardingTutorial force={true} />);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('Next →'));
    }
    fireEvent.click(screen.getByText('Finish'));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(localStorage.getItem('ste_tutorial_completed')).toBe('true');
  });

  it('closes on Escape key press', async () => {
    render(<OnboardingTutorial force={true} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('renders all step titles correctly', () => {
    render(<OnboardingTutorial force={true} />);
    expect(screen.getByText('Welcome to Stellar Escrow')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('View Your Dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next →'));
    expect(screen.getByText('Create Your First Escrow')).toBeInTheDocument();
  });
});
