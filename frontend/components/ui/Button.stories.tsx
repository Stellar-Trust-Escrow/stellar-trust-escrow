import type { Meta, StoryObj } from '@storybook/react';
import Button from './Button';

/**
 * The `Button` component supports four visual variants, three sizes, loading
 * and disabled states, and can render as a Next.js `Link` when `href` is set.
 *
 * All props are documented in `argTypes` below so they are editable via the
 * Storybook Controls panel. The component is wrapped by the global
 * Wallet/Theme mock decorators defined in `.storybook/preview.tsx`.
 */
const meta: Meta<typeof Button> = {
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
    asChild: {
      control: 'boolean',
      description: 'Wraps a single child element with button styles',
    },
  },
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    isLoading: false,
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Approve Milestone' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'View Details' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Raise Dispute' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Disabled' },
};

export const Loading: Story = {
  args: { isLoading: true, children: 'Submitting…' },
};
