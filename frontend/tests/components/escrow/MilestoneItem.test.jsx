import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MilestoneItem from '../../../components/escrow/MilestoneItem';

const baseMilestone = {
  id: 1,
  title: 'Design Mockups',
  amount: '500 USDC',
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
    render(<MilestoneItem {...defaultProps} />);
    expect(screen.getByText('Design Mockups')).toBeInTheDocument();
  });

  it('renders milestone amount', () => {
    render(<MilestoneItem {...defaultProps} />);
    expect(screen.getByText('500 USDC')).toBeInTheDocument();
  });

  it('renders milestone index number', () => {
    render(<MilestoneItem {...defaultProps} index={2} />);
    expect(screen.getByText('#03')).toBeInTheDocument();
  });

  it('renders submittedAt when present', () => {
    render(
      <MilestoneItem
        {...defaultProps}
        milestone={{ ...baseMilestone, submittedAt: '2025-03-10' }}
      />,
    );
    expect(screen.getByText(/Submitted: 2025-03-10/)).toBeInTheDocument();
  });

  it('shows Submit Work button for freelancer with Pending status', () => {
    render(<MilestoneItem {...defaultProps} role="freelancer" />);
    expect(screen.getByText(/Submit Work/)).toBeInTheDocument();
  });

  it('shows Submit Work button for freelancer with Rejected status', () => {
    render(
      <MilestoneItem
        {...defaultProps}
        role="freelancer"
        milestone={{ ...baseMilestone, status: 'Rejected' }}
      />,
    );
    expect(screen.getByText(/Submit Work/)).toBeInTheDocument();
  });

  it('shows Approve and Reject buttons for client with Submitted status', () => {
    render(
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
    render(
      <MilestoneItem {...defaultProps} milestone={{ ...baseMilestone, status: 'Approved' }} />,
    );
    expect(screen.getByText(/Funds released/)).toBeInTheDocument();
  });

  it('calls onSubmit when freelancer clicks Submit Work', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<MilestoneItem {...defaultProps} role="freelancer" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/Submit Work/));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(1));
  });

  it('calls onApprove when client clicks Approve', async () => {
    const onApprove = jest.fn().mockResolvedValue(undefined);
    render(
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
    render(
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
    render(<MilestoneItem {...defaultProps} role="freelancer" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText(/Submit Work/));
    expect(await screen.findByText(/Waiting for wallet/)).toBeInTheDocument();
    resolveAction();
  });

  it('renders connector line when not last', () => {
    const { container } = render(<MilestoneItem {...defaultProps} isLast={false} />);
    expect(container.querySelector('.w-px')).toBeInTheDocument();
  });

  it('does not render connector line when last', () => {
    const { container } = render(<MilestoneItem {...defaultProps} isLast={true} />);
    expect(container.querySelector('.w-px')).not.toBeInTheDocument();
  });
});
