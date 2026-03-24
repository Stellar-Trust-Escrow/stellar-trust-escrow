import Spinner from './Spinner';

/**
 * The `Spinner` component is an animated loading indicator with three size
 * variants. It includes a visually-hidden `aria-label` for screen readers.
 */
export default {
  title: 'UI/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Controls the diameter and border width of the spinner',
      table: { defaultValue: { summary: 'md' } },
    },
    label: {
      control: 'text',
      description: 'Screen-reader accessible label (visually hidden)',
      table: { defaultValue: { summary: 'Loading…' } },
    },
  },
  args: {
    size: 'md',
    label: 'Loading…',
  },
};

export const Default = {};

export const Small = { args: { size: 'sm' } };
export const Medium = { args: { size: 'md' } };
export const Large = { args: { size: 'lg' } };

export const CustomLabel = {
  args: { label: 'Fetching escrow data…' },
  parameters: {
    docs: {
      description: {
        story: 'The `label` prop is read by screen readers but not visible on screen.',
      },
    },
  },
};

export const AllSizes = {
  render: () => (
    <div className="flex items-center gap-6">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
  parameters: { controls: { disable: true } },
};
