import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import Button from './Button';

type ButtonStoryProps = {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  disabled?: boolean;
  href?: string;
  asChild?: boolean;
  className?: string;
  onClick?: () => void;
};

/**
 * The `Button` component supports four visual variants, three sizes, loading
 * and disabled states, and can render as a Next.js `Link` when `href` is set.
 *
 * All props are documented in `argTypes` below so they are editable via the
 * Storybook Controls panel. The component is wrapped by the global
 * Wallet/Theme mock decorators defined in `.storybook/preview.tsx`.
 */
const meta: Meta<ButtonStoryProps> = {
  title: 'UI/Button',
  component: Button as React.ComponentType<ButtonStoryProps>,
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
type Story = StoryObj<ButtonStoryProps>;

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

// NOTE: Explicitly typed rather than Meta<typeof Button> because Button.jsx
// (upstream, untyped) can't be inferred reliably for TS — see build failures
// in CI history. Update ButtonStoryProps manually if Button's prop surface changes.