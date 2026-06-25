import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import DataTable from '../../../components/ui/DataTable';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
];

const ROWS = [
  { id: '1', status: 'Active', amount: '1000' },
  { id: '2', status: 'Completed', amount: '2000' },
];

describe('DataTable', () => {
  let mockPush;

  beforeEach(() => {
    mockPush = jest.fn();
    useRouter.mockReturnValue({ push: mockPush });
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => jest.clearAllMocks());

  // --- Rendering ---

  it('renders column headers', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(screen.getAllByText('ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Amount').length).toBeGreaterThan(0);
  });

  it('renders row data', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2000').length).toBeGreaterThan(0);
  });

  it('renders empty message when data is empty', () => {
    render(<DataTable columns={COLUMNS} data={[]} emptyMessage="Nothing here." />);
    expect(screen.getAllByText('Nothing here.').length).toBeGreaterThan(0);
  });

  it('renders custom cell via render prop', () => {
    const columns = [
      { key: 'status', label: 'Status', render: (v) => <span data-testid="badge">{v}!</span> },
    ];
    render(<DataTable columns={columns} data={[{ id: '1', status: 'Active' }]} />);
    expect(screen.getAllByTestId('badge')[0]).toHaveTextContent('Active!');
  });

  // --- Sorting ---

  it('renders sort buttons only for sortable columns', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    // "ID" is not sortable — no button for it in the thead
    const buttons = screen.getAllByRole('button').filter(
      (b) => b.tagName === 'BUTTON' && b.textContent.includes('ID'),
    );
    expect(buttons).toHaveLength(0);
    // "Status" and "Amount" are sortable
    expect(screen.getAllByRole('button', { name: /Sort by Status/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Sort by Amount/ }).length).toBeGreaterThan(0);
  });

  it('sets sortKey and sortDir=asc in URL when clicking an unsorted column', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sort by Amount/ })[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sortKey=amount'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sortDir=asc'));
  });

  it('toggles sortDir to desc when clicking the active sort column', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('sortKey=amount&sortDir=asc'));
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sort by Amount/ })[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sortDir=desc'));
  });

  it('toggles sortDir back to asc on a second click', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('sortKey=amount&sortDir=desc'));
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sort by Amount/ })[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sortDir=asc'));
  });

  it('removes cursor param when sort changes', () => {
    useSearchParams.mockReturnValue(new URLSearchParams('cursor=abc123'));
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sort by Amount/ })[0]);
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('cursor='));
  });

  // --- Pagination ---

  it('does not render Load more when nextCursor is absent', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('renders Load more button when nextCursor is provided', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} nextCursor="cursor_xyz" onLoadMore={() => {}} />);
    expect(screen.getByRole('button', { name: 'Load more' })).toBeInTheDocument();
  });

  it('calls onLoadMore when Load more is clicked', () => {
    const onLoadMore = jest.fn();
    render(<DataTable columns={COLUMNS} data={ROWS} nextCursor="cursor_xyz" onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows spinner and hides Load more button while loading', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        nextCursor="cursor_xyz"
        loadingMore
        onLoadMore={() => {}}
      />,
    );
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument(); // Spinner role="status"
  });

  // --- Mobile card list ---

  it('renders an accessible list for the mobile card layout', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    expect(screen.getByRole('list', { name: 'Data rows' })).toBeInTheDocument();
  });

  it('renders every column label in the mobile card for each row', () => {
    render(<DataTable columns={COLUMNS} data={ROWS} />);
    // Each label should appear once in thead + once per row in mobile cards
    const idLabels = screen.getAllByText('ID');
    // 1 thead th + 2 mobile card entries
    expect(idLabels.length).toBe(3);
  });
});
