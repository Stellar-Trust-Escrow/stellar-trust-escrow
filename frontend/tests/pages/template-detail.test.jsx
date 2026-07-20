import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithAppProviders } from '../test-utils';
import { useParams } from 'next/navigation';
import TemplateDetailPage from '../../app/escrow/templates/[id]/page';

const template = {
  id: 't1',
  name: 'Shared Tpl',
  description: 'A shareable template',
  isPublic: true,
  usageCount: 7,
  milestoneCount: 2,
  templateData: {
    version: 1,
    escrow: { tokenAddress: 'usdc', totalAmount: '2000', deadline: null },
    milestones: [{ title: 'Kickoff', amount: '1000' }, { title: 'Final', amount: '1000' }],
  },
};

jest.mock('../../hooks/useEscrowTemplates', () => ({
  __esModule: true,
  getTemplate: jest.fn().mockResolvedValue(template),
  useTemplate: jest.fn().mockResolvedValue({}),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  useTemplates: jest.fn(),
}));

describe('TemplateDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useParams.mockReturnValue({ id: 't1' });
  });

  it('shows a 403 message for a private template', async () => {
    const { getTemplate: mockGetTemplate } = await import('../../hooks/useEscrowTemplates');
    const error = { response: { status: 403 } };
    mockGetTemplate.mockRejectedValueOnce(error);
    renderWithAppProviders(<TemplateDetailPage />);
    expect(await screen.findByText('This template is private.')).toBeInTheDocument();
  });

  it('renders the template and uses it (increment + navigate)', async () => {
    const { useTemplate: mockUseTemplate } = await import('../../hooks/useEscrowTemplates');
    const push = jest.fn();
    const useRouter = require('next/navigation').useRouter;
    useRouter.mockReturnValue({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() });

    renderWithAppProviders(<TemplateDetailPage />);

    expect(await screen.findByText('Shared Tpl')).toBeInTheDocument();
    expect(screen.getByText('USDC')).toBeInTheDocument();
    expect(screen.getByText('2000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use this template' }));

    await waitFor(() => expect(mockUseTemplate).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/escrow/create?templateId=t1'));
  });
});
