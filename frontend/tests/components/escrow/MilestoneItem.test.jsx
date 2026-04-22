import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import MilestoneItem from '../../../components/escrow/MilestoneItem';
import { renderWithAppProviders } from '../../test-utils';

const baseMilestone = {
  id: 1,
  title: 'Design Mockups',
  amount: '5000000000',
  status: 'Pending',
  submittedAt: null,
};

const defaultProps = {
  milestone: baseMilestone,
  index: 0,
  role: 'observer',
  onApprove: jest.fn(),
  onReject: jest.fn(),
  onSubmit: jest.fn(),
  isLast: false,
};

describe('MilestoneItem', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders milestone title', () => {
    renderWithAppProviders(<MilestoneItem {...defaultProps} />);
    expect(screen.getByText('Design Mockups')).toBeInTheDocument();
  });

  it('renders milestone amount', () => {
    renderWithAppProviders(<MilestoneItem {...defaultProps} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('renders milestone index number', () => {
    renderWithAppProviders(<MilestoneItem {...defaultProps} index={2} />);
    expect(screen.getByText('#03')).toBeInTheDocument();
  });

  it('renders submittedAt when present', () => {
    renderWithAppProviders(
      <MilestoneItem
        {...defaultProps}
        milestone={{ ...baseMilestone, submittedAt: '2025-03-10' }}
      />,
    );
    expect(screen.getByText(/Submitted:\s*Mar 10, 2025/)).toBeInTheDocument();
  });

  it('shows Submit Work button for freelancer with Pending status', () => {
    renderWithAppProviders(<MilestoneItem {...defaultProps} role="freelancer" />);
    expect(screen.getByText(/Submit Work/)).toBeInTheDocument();
  });

  it('shows Submit Work button for freelancer with Rejected status', () => {
    renderWithAppProviders(
      <MilestoneItem
        {...defaultProps}
        role="freelancer"
        milestone={{ ...baseMilestone, status: 'Rejected' }}
      />,
    );
    expect(screen.getByText(/Submit Work/)).toBeInTheDocument();
  });

  it('shows Approve and Reject buttons for client with Submitted status', () => {
    renderWithAppProviders(
      <MilestoneItem
        {...defaultProps}
        role="client"
        milestone={{ ...baseMilestone, status: 'Submitted' }}
      />,
    );
    expect(screen.getByText(/Approve/)).toBeInTheDocument();
    expect(screen.getByText(/Reject/)).toBeInTheDocument();
  });

  it('shows funds released message for Approved status', () => {
    renderWithAppProviders(
      <MilestoneItem {...defaultProps} milestone={{ ...baseMilestone, status: 'Approved' }} />,
    );
    expect(
      screen.getByText((_, element) =>
        element?.tagName === 'P' &&
        element.textContent?.includes('Approve & Release Funds'),
      ),
    ).toBeInTheDocument();
  });

  it('calls onSubmit when freelancer clicks Submit Work', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderWithAppProviders(<MilestoneItem {...defaultProps} role="freelancer" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/Submit Work/));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(1));
  });

  it('calls onApprove when client clicks Approve', async () => {
    const onApprove = jest.fn().mockResolvedValue(undefined);
    renderWithAppProviders(
      <MilestoneItem
        {...defaultProps}
        role="client"
        milestone={{ ...baseMilestone, status: 'Submitted' }}
        onApprove={onApprove}
      />,
    );
    fireEvent.click(screen.getByText(/Approve/));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith(1));
  });

  it('calls onReject when client clicks Reject', async () => {
    const onReject = jest.fn().mockResolvedValue(undefined);
    renderWithAppProviders(
      <MilestoneItem
        {...defaultProps}
        role="client"
        milestone={{ ...baseMilestone, status: 'Submitted' }}
        onReject={onReject}
      />,
    );
    fireEvent.click(screen.getByText(/Reject/));
    await waitFor(() => expect(onReject).toHaveBeenCalledWith(1));
  });

  it('shows waiting message while action is in progress', async () => {
    let resolveAction;
    const onSubmit = jest.fn(
      () =>
        new Promise((res) => {
          resolveAction = res;
        }),
    );
    renderWithAppProviders(<MilestoneItem {...defaultProps} role="freelancer" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/Submit Work/));
    expect(await screen.findByText(/Loading\.\.\./)).toBeInTheDocument();
    await act(async () => {
      resolveAction();
    });
  });

  it('renders connector line when not last', () => {
    const { container } = renderWithAppProviders(<MilestoneItem {...defaultProps} isLast={false} />);
    expect(container.querySelector('.w-px')).toBeInTheDocument();
  });

  it('does not render connector line when last', () => {
    const { container } = renderWithAppProviders(<MilestoneItem {...defaultProps} isLast={true} />);
    expect(container.querySelector('.w-px')).not.toBeInTheDocument();
  });
});
