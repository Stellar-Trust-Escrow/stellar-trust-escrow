import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithAppProviders } from '../../test-utils';
import SaveTemplateModal from '../../../components/templates/SaveTemplateModal';

jest.mock('../../../hooks/useEscrowTemplates', () => ({
  __esModule: true,
  createTemplate: jest.fn().mockResolvedValue({ name: 'My Tpl' }),
  useTemplates: jest.fn(),
  useTemplate: jest.fn(),
  getTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
}));

const formData = {
  freelancerAddress: 'GABC',
  tokenAddress: 'usdc',
  totalAmount: '1000',
  briefDescription: 'A reusable draft',
  deadline: '',
  milestones: [{ title: 'Milestone 1', description: '', amount: '1000' }],
};

describe('SaveTemplateModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires a name before saving', async () => {
    const { createTemplate: mockCreateTemplate } = await import('../../../hooks/useEscrowTemplates');
    renderWithAppProviders(<SaveTemplateModal isOpen onClose={jest.fn()} formData={formData} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    expect(await screen.findByText('Please enter a template name.')).toBeInTheDocument();
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it('saves the template and closes', async () => {
    const { createTemplate: mockCreateTemplate } = await import('../../../hooks/useEscrowTemplates');
    const onClose = jest.fn();
    renderWithAppProviders(<SaveTemplateModal isOpen onClose={onClose} formData={formData} />);

    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'My Tpl' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(mockCreateTemplate).toHaveBeenCalledTimes(1);
    const payload = mockCreateTemplate.mock.calls[0][0];
    expect(payload.name).toBe('My Tpl');
    expect(payload.isPublic).toBe(false);
    expect(payload.templateData.version).toBe(1);
    expect(payload.templateData.escrow.tokenAddress).toBe('usdc');
    expect(payload.templateData.escrow.totalAmount).toBe('1000');
    expect(payload.templateData.milestones).toEqual([{ title: 'Milestone 1', amount: '1000' }]);
  });

  it('marks the template public when the checkbox is toggled', async () => {
    const { createTemplate: mockCreateTemplate } = await import('../../../hooks/useEscrowTemplates');
    const user = userEvent.setup();
    const onClose = jest.fn();
    renderWithAppProviders(<SaveTemplateModal isOpen onClose={onClose} formData={formData} />);

    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Pub' } });
    await user.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockCreateTemplate.mock.calls[0][0].isPublic).toBe(true);
  });
});
