import { fireEvent, screen, waitFor } from '@testing-library/react';
import CreateEscrowPage from '../../app/escrow/create/page';
import { renderWithAppProviders } from '../test-utils';

describe('CreateEscrowPage integration flow', () => {
  it('preserves entered counterparty details while moving between steps', async () => {
    renderWithAppProviders(<CreateEscrowPage />);

    fireEvent.change(screen.getByPlaceholderText(/GABCD1234/i), {
      target: { value: 'GTESTFREELANCER123' },
    });
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '2500' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByRole('heading', { name: 'Milestones' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(screen.getByDisplayValue('GTESTFREELANCER123')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2500')).toBeInTheDocument();
  });

  it('surfaces submit errors in the signing step', async () => {
    renderWithAppProviders(<CreateEscrowPage />);

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    fireEvent.click(screen.getByRole('button', { name: /Sign & Create Escrow/i }));

    await waitFor(() => {
      expect(screen.getByText(/Not implemented/i)).toBeInTheDocument();
    });
  });
});
