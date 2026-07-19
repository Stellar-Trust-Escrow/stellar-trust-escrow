import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithAppProviders } from '../../test-utils';
import TemplatePickerModal from '../../../components/templates/TemplatePickerModal';

const templates = [
  {
    id: 't1',
    name: 'Tpl A',
    description: 'My first template',
    isPublic: false,
    usageCount: 3,
    milestoneCount: 2,
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 't2',
    name: 'Tpl B',
    description: '',
    isPublic: true,
    usageCount: 0,
    milestoneCount: 1,
    updatedAt: '2026-02-01T00:00:00Z',
  },
];

jest.mock('../../../hooks/useEscrowTemplates', () => ({
  __esModule: true,
  useTemplates: jest.fn(() => ({ templates, loading: false, error: null, reload: jest.fn() })),
  useTemplate: jest.fn().mockResolvedValue({}),
  getTemplate: jest.fn(),
  createTemplate: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
}));

describe('TemplatePickerModal', () => {
  it('renders the two source tabs and the templates when open', () => {
    renderWithAppProviders(
      <TemplatePickerModal isOpen onClose={jest.fn()} onSelect={jest.fn()} />,
    );

    expect(screen.getByRole('tab', { name: 'My Templates' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Public Library' })).toBeInTheDocument();
    expect(screen.getByText('Tpl A')).toBeInTheDocument();
    expect(screen.getByText('Tpl B')).toBeInTheDocument();
  });

  it('does not render template list while closed', () => {
    renderWithAppProviders(
      <TemplatePickerModal isOpen={false} onClose={jest.fn()} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText('Tpl A')).not.toBeInTheDocument();
  });

  it('selecting a template increments usage and calls onSelect', async () => {
    const onSelect = jest.fn();
    renderWithAppProviders(
      <TemplatePickerModal isOpen onClose={jest.fn()} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load template Tpl A' }));

    await Promise.resolve();
    const { useTemplate: mockUseTemplate } = await import('../../../hooks/useEscrowTemplates');
    expect(mockUseTemplate).toHaveBeenCalledWith('t1');
    expect(onSelect).toHaveBeenCalledWith(templates[0]);
  });
});
