import { render, screen } from '@testing-library/react';
import MilestoneList from '../../../components/escrow/MilestoneList';

const milestones = [
  {
    id: 0,
    title: 'Design Mockups',
    amount: '500 USDC',
    status: 'Approved',
    submittedAt: '2025-03-01',
  },
  {
    id: 1,
    title: 'Development',
    amount: '1000 USDC',
    status: 'Submitted',
    submittedAt: '2025-03-10',
  },
  { id: 2, title: 'Testing', amount: '500 USDC', status: 'Pending', submittedAt: null },
];

describe('MilestoneList', () => {
  it('renders empty state for client when no milestones', () => {
    render(
      <MilestoneList
        milestones={[]}
        role="client"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('No milestones yet')).toBeInTheDocument();
    expect(screen.getByText(/Add milestones/)).toBeInTheDocument();
  });

  it('renders empty state for freelancer when no milestones', () => {
    render(
      <MilestoneList
        milestones={[]}
        role="freelancer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText(/client has not added/i)).toBeInTheDocument();
  });

  it('renders all milestones', () => {
    render(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('Design Mockups')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('shows progress summary', () => {
    render(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText(/1 of 3 milestones complete/)).toBeInTheDocument();
  });

  it('shows percentage', () => {
    render(
      <MilestoneList
        milestones={milestones}
        role="observer"
        onApprove={jest.fn()}
        onReject={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByText('33%')).toBeInTheDocument();
  });
});
