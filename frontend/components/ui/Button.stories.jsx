import Button from './Button';

/**
 * The `Button` component supports four visual variants, three sizes,
 * loading state, disabled state, and can render as a Next.js `Link`
 * when an `href` prop is provided.
 */
export default {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost'],
      description: 'Visual style of the button',
      table: { defaultValue: { summary: 'primary' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the button',
      table: { defaultValue: { summary: 'md' } },
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the button and prevents interaction',
    },
    isLoading: {
      control: 'boolean',
      description: 'Shows a loading indicator and disables the button',
    },
    href: {
      control: 'text',
      description: 'When provided, renders as a Next.js Link instead of a <button>',
    },
    onClick: { action: 'clicked' },
    children: { control: 'text' },
  },
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'md',
    disabled: false,
    isLoading: false,
  },
};

// ── Default ──────────────────────────────────────────────────────────────────

export const Primary = {
  args: { variant: 'primary', children: 'Approve Milestone' },
};

export const Secondary = {
  args: { variant: 'secondary', children: 'View Details' },
};

export const Danger = {
  args: { variant: 'danger', children: 'Raise Dispute' },
};

export const Ghost = {
  args: { variant: 'ghost', children: 'Cancel' },
};

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const Small = {
  args: { size: 'sm', children: 'Small' },
};

export const Medium = {
  args: { size: 'md', children: 'Medium' },
};

export const Large = {
  args: { size: 'lg', children: 'Large' },
};

// ── States ────────────────────────────────────────────────────────────────────

export const Disabled = {
  args: { disabled: true, children: 'Disabled' },
};

export const Loading = {
  args: { isLoading: true, children: 'Submitting…' },
};

export const AsLink = {
  args: { href: '/escrow/create', children: 'Create Escrow' },
  parameters: {
    docs: {
      description: {
        story: 'When `href` is provided the button renders as a Next.js `<Link>`.',
      },
    },
  },
};

// ── All Variants Side-by-Side ─────────────────────────────────────────────────

export const AllVariants = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const AllSizes = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
