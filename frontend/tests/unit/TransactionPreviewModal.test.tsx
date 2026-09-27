import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TransactionPreviewModal } from '../../components/escrow/TransactionPreviewModal';
import { SimulationResult } from '../../lib/soroban-simulator';

describe('TransactionPreviewModal', () => {
  const mockSimulationResult: SimulationResult = {
    success: true,
    fee_estimate: {
      resource_fee: 1000000,
      base_fee: 100,
      total_fee_stroops: 1000100,
      total_fee_xlm: '0.1000100',
      total_fee_usd: '0.01',
    },
    state_diff: [
      {
        key: 'EscrowEntry',
        key_type: 'ContractData',
        old_value: 'Active',
        new_value: 'Released',
      },
    ],
    risk_indicators: [
      {
        level: 'low',
        type: 'fee',
        message: 'Transaction parameters and storage footprint are within safe standard limits.',
      },
    ],
    action_summary: {
      method: 'release_milestone',
      args: { milestone_id: 1 },
      description: 'Approves deliverable and releases escrow funds for milestone #1.',
    },
  };

  it('renders loading state when isLoading is true', () => {
    render(
      <TransactionPreviewModal
        isOpen={true}
        isLoading={true}
        simulationResult={null}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Simulating transaction...')).toBeInTheDocument();
  });

  it('renders action description, fee breakdown, and risk assessment', () => {
    render(
      <TransactionPreviewModal
        isOpen={true}
        isLoading={false}
        simulationResult={mockSimulationResult}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText('Approves deliverable and releases escrow funds for milestone #1.')).toBeInTheDocument();
    expect(screen.getByText(/0.1000100 XLM/)).toBeInTheDocument();
    expect(screen.getByText('Transaction parameters and storage footprint are within safe standard limits.')).toBeInTheDocument();
  });

  it('calls onConfirm when user clicks Sign & Submit', () => {
    const onConfirm = jest.fn();
    render(
      <TransactionPreviewModal
        isOpen={true}
        isLoading={false}
        simulationResult={mockSimulationResult}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    const signButton = screen.getByRole('button', { name: /Sign & Submit/i });
    fireEvent.click(signButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when user clicks Cancel', () => {
    const onCancel = jest.fn();
    render(
      <TransactionPreviewModal
        isOpen={true}
        isLoading={false}
        simulationResult={mockSimulationResult}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables Sign & Submit button when simulation fails', () => {
    const failedResult: SimulationResult = {
      ...mockSimulationResult,
      success: false,
      error: 'Invalid escrow state for requested transition (Contract Error #137)',
    };

    render(
      <TransactionPreviewModal
        isOpen={true}
        isLoading={false}
        simulationResult={failedResult}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText(/Invalid escrow state for requested transition/)).toBeInTheDocument();
    const signButton = screen.getByRole('button', { name: /Sign & Submit/i });
    expect(signButton).toBeDisabled();
  });
});
