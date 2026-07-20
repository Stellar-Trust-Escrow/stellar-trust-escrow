import { screen, fireEvent, waitFor } from '@testing-library/react';
import ExportReceiptButton from '../../../components/escrow/ExportReceiptButton';
import { renderWithAppProviders } from '../../test-utils';
import { generateEscrowReceiptPdf, downloadReceiptPdf } from '../../../lib/pdfExport';

jest.mock('../../../lib/pdfExport', () => ({
  generateEscrowReceiptPdf: jest.fn(),
  downloadReceiptPdf: jest.fn(),
}));

const BASE_ESCROW = {
  id: 7,
  clientAddress: 'GCLIENT',
  freelancerAddress: 'GFREELANCER',
  milestones: [],
};

describe('ExportReceiptButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    generateEscrowReceiptPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it('renders for a Completed escrow', () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Completed' }} />);
    expect(screen.getByRole('button', { name: 'Export escrow receipt as PDF' })).toBeInTheDocument();
  });

  it('renders for a Resolved escrow', () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Resolved' }} />);
    expect(screen.getByRole('button', { name: 'Export escrow receipt as PDF' })).toBeInTheDocument();
  });

  it('is absent for an Active escrow', () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Active' }} />);
    expect(screen.queryByRole('button', { name: 'Export escrow receipt as PDF' })).not.toBeInTheDocument();
  });

  it('is absent for a Disputed escrow', () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Disputed' }} />);
    expect(screen.queryByRole('button', { name: 'Export escrow receipt as PDF' })).not.toBeInTheDocument();
  });

  it('has the required aria-label', () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Completed' }} />);
    expect(screen.getByLabelText('Export escrow receipt as PDF')).toBeInTheDocument();
  });

  it('generates and downloads the PDF when clicked', async () => {
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Completed' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export escrow receipt as PDF' }));

    await waitFor(() => {
      expect(generateEscrowReceiptPdf).toHaveBeenCalledTimes(1);
    });
    expect(downloadReceiptPdf).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 7);
  });

  it('announces the loading state via aria-live', async () => {
    let resolveGenerate;
    generateEscrowReceiptPdf.mockReturnValue(
      new Promise((resolve) => {
        resolveGenerate = resolve;
      }),
    );

    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Completed' }} />);
    const button = screen.getByRole('button', { name: 'Export escrow receipt as PDF' });
    fireEvent.click(button);

    expect(await screen.findByText('Generating receipt…')).toBeInTheDocument();
    expect(screen.getByText('Generating receipt…').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(button).toHaveAttribute('aria-busy', 'true');

    resolveGenerate(new Uint8Array([1, 2, 3]));
    await waitFor(() => expect(screen.getByText('Receipt downloaded')).toBeInTheDocument());
  });

  it('announces a failure message when PDF generation throws', async () => {
    generateEscrowReceiptPdf.mockRejectedValue(new Error('boom'));
    renderWithAppProviders(<ExportReceiptButton escrow={{ ...BASE_ESCROW, status: 'Completed' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export escrow receipt as PDF' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to generate receipt')).toBeInTheDocument();
    });
    expect(downloadReceiptPdf).not.toHaveBeenCalled();
  });
});
