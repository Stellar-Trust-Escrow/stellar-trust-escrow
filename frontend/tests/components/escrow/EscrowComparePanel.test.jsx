import { render, screen, fireEvent, within } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import EscrowComparePanel, {
  buildCompareRows,
} from '../../../components/escrow/EscrowComparePanel';
import { renderWithAppProviders } from '../../test-utils';

const escrows = [
  {
    id: '1',
    title: 'Escrow #1',
    status: 'Active',
    totalAmount: '5,000 USDC',
    currency: 'USDC',
    counterparty: 'client…addr',
    clientAddress: 'client…addr',
    milestoneProgress: '2 / 4',
    arbiterAddress: 'GARBITER1234567890ABCDEF',
    createdAt: '2026-01-10',
    deadline: null,
    disputeCount: 0,
  },
  {
    id: '2',
    title: 'Escrow #2',
    status: 'Disputed',
    totalAmount: '5,000 USDC',
    currency: 'USDC',
    counterparty: 'client…addr',
    clientAddress: 'client…addr',
    milestoneProgress: '1 / 4',
    arbiterAddress: null,
    createdAt: '2026-01-11',
    deadline: '2026-05-01',
    disputeCount: 1,
  },
  {
    id: '3',
    title: 'Escrow #3',
    status: 'Active',
    totalAmount: '1,200 USDC',
    currency: 'USDC',
    counterparty: 'other…addr',
    clientAddress: 'other…addr',
    milestoneProgress: '0 / 2',
    arbiterAddress: 'GARBITER1234567890ABCDEF',
    createdAt: '2026-02-01',
    deadline: null,
    disputeCount: 0,
  },
];

const defaultProps = {
  escrows,
  compareIds: ['1', '2'],
  onToggleCompare: jest.fn(),
  onRemoveCompare: jest.fn(),
  onClearCompare: jest.fn(),
};

describe('EscrowComparePanel', () => {
  it('renders an empty state (not an error) when no escrows are selected', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} compareIds={[]} />);
    expect(screen.getByTestId('compare-panel')).toBeInTheDocument();
    expect(screen.getByText('No escrows selected')).toBeInTheDocument();
  });

  it('renders one column per selected escrow and the attribute rows', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    // Column headers for selected escrows
    expect(screen.getAllByText('Escrow #1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Escrow #2').length).toBeGreaterThan(0);
    // Attribute label column
    expect(screen.getByText('Attribute')).toBeInTheDocument();
    // A few attribute labels
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Arbiter')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    // Cell values
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Disputed').length).toBeGreaterThan(0);
  });

  it('mutes identical cells and highlights differing cells for a diff row', () => {
    const { container } = renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    // Amount row: both are '5,000 USDC' → no diff → no amber bg
    const amountCell1 = screen.getByTestId('compare-cell-amount-1');
    const amountCell2 = screen.getByTestId('compare-cell-amount-2');
    expect(amountCell1.className).not.toContain('bg-amber-500/10');
    expect(amountCell2.className).not.toContain('bg-amber-500/10');

    // Status row: Active vs Disputed → diff → the differing cell gets amber bg
    const statusCell2 = screen.getByTestId('compare-cell-status-2');
    expect(statusCell2.className).toContain('bg-amber-500/10');
    // And the matching cell (col 1) is muted (opacity-45)
    const statusCell1 = screen.getByTestId('compare-cell-status-1');
    expect(statusCell1.className).toContain('opacity-45');
  });

  it('treats null/undefined vs a value as a diff', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    // Arbiter row: escrow 1 has an arbiter, escrow 2 has null → diff on col 2
    const arbiterCol2 = screen.getByTestId('compare-cell-arbiter-2');
    expect(arbiterCol2.className).toContain('bg-amber-500/10');
    // Deadline row: escrow 1 null, escrow 2 has a date → diff on col 2
    const deadlineCol2 = screen.getByTestId('compare-cell-deadline-2');
    expect(deadlineCol2.className).toContain('bg-amber-500/10');
  });

  it('shows the max-hint when 4 escrows are selected', () => {
    const four = [
      ...escrows,
      {
        id: '4',
        title: 'Escrow #4',
        status: 'Active',
        totalAmount: '9 USDC',
        currency: 'USDC',
        counterparty: 'x',
        clientAddress: 'x',
        milestoneProgress: '0 / 1',
        arbiterAddress: null,
        createdAt: null,
        deadline: null,
        disputeCount: 0,
      },
    ];
    renderWithAppProviders(
      <EscrowComparePanel {...defaultProps} compareIds={['1', '2', '3', '4']} escrows={four} />,
    );
    expect(screen.getByText(/Maximum 4 escrows/)).toBeInTheDocument();
  });

  it('expands milestone rows when the expand button is clicked', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    // Milestone rows are collapsed by default
    expect(screen.queryByTestId('compare-row-milestone-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Expand milestones/i }));

    // 4 milestone sub-rows (max total across escrows 1 & 2)
    expect(screen.getByTestId('compare-row-milestone-1')).toBeInTheDocument();
    expect(screen.getByTestId('compare-row-milestone-4')).toBeInTheDocument();
    // escrow 1 has 2/4 done → its first 2 milestone cells show ✓
    expect(screen.getByTestId('compare-cell-milestone-1-1').textContent).toContain('✓');
  });

  it('removes a column when the × button on its header is clicked', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Escrow #2' }));
    expect(defaultProps.onRemoveCompare).toHaveBeenCalledWith('2');
  });

  it('exports CSV for the visible rows', () => {
    // Mock the CSV export module so no real download happens in jsdom.
    const exportSpy = jest
      .spyOn(require('../../../lib/csvExport'), 'exportToCSV')
      .mockImplementation(() => {});
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(exportSpy).toHaveBeenCalled();
    // data rows = header + 11 attributes
    const [rows, filename] = exportSpy.mock.calls[0];
    expect(rows[0]).toEqual(['Attribute', 'Escrow #1', 'Escrow #2']);
    expect(filename).toBe('escrow-comparison');
    exportSpy.mockRestore();
  });

  it('moves focus between column headers with Arrow keys and removes with Delete', () => {
    renderWithAppProviders(<EscrowComparePanel {...defaultProps} />);
    const header1 = screen.getByTestId('compare-colheader-1');
    const header2 = screen.getByTestId('compare-colheader-2');
    header2.focus = jest.fn();

    // Focus on col 1 header, press ArrowRight → focuses col 2 header
    header1.focus();
    fireEvent.keyDown(header1, { key: 'ArrowRight' });
    expect(header2.focus).toHaveBeenCalled();

    // Delete on focused header removes the escrow
    fireEvent.keyDown(header2, { key: 'Delete' });
    expect(defaultProps.onRemoveCompare).toHaveBeenCalledWith('2');
  });
});

describe('buildCompareRows (attribute extraction helper)', () => {
  it('flattens each escrow into an attribute→value row set', () => {
    const rows = buildCompareRows([escrows[0]]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'status', values: ['Active'] }),
        expect.objectContaining({ key: 'amount', values: ['5,000 USDC'] }),
        expect.objectContaining({ key: 'arbiter', values: ['GARBIT…CDEF'] }),
        expect.objectContaining({ key: 'deadline', values: ['—'] }),
      ]),
    );
  });
});
