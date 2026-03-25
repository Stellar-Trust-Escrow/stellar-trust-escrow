import { render, screen, fireEvent } from '@testing-library/react';
import TemplateSelector from '../../../components/escrow/TemplateSelector';
import templatesData from '../../../data/templates.json';

const FORM_DATA = {
  freelancerAddress: 'GABCDEF1234567890',
  tokenAddress: 'usdc',
  totalAmount: '950',
  briefDescription: 'Custom drafting support',
  deadline: '',
  milestones: [
    {
      title: 'Kickoff',
      description: 'Share initial project plan',
      amount: '300',
    },
    {
      title: 'Delivery',
      description: 'Submit final files',
      amount: '650',
    },
  ],
};

describe('TemplateSelector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders template cards and a preview panel', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    expect(screen.getByText('Escrow Templates')).toBeInTheDocument();
    expect(screen.getAllByText('Freelance Website Launch').length).toBeGreaterThan(0);
    expect(screen.getByText('Milestone preview')).toBeInTheDocument();
  });

  it('calls onApplyTemplate when Use This Template is clicked', () => {
    const onApplyTemplate = jest.fn();

    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={onApplyTemplate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));

    expect(onApplyTemplate).toHaveBeenCalledTimes(1);
    expect(onApplyTemplate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: templatesData.templates[0].id }),
    );
  });

  it('saves custom templates to localStorage', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Template name'), {
      target: { value: 'My Monthly Template' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));

    expect(screen.getByText(/Saved "My Monthly Template"/)).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem('escrow_custom_templates_v1'));
    expect(stored[0]).toEqual(
      expect.objectContaining({
        name: 'My Monthly Template',
        category: 'Custom',
        milestones: expect.arrayContaining([expect.objectContaining({ title: 'Kickoff' })]),
      }),
    );
  });

  it('stores favorite template ids', () => {
    render(
      <TemplateSelector
        baseTemplates={templatesData.templates}
        formData={FORM_DATA}
        onApplyTemplate={jest.fn()}
      />,
    );

    fireEvent.click(screen.getAllByLabelText('Save as favorite')[0]);

    const favorites = JSON.parse(localStorage.getItem('escrow_template_favorites_v1'));
    expect(favorites).toContain(templatesData.templates[0].id);
  });
});
