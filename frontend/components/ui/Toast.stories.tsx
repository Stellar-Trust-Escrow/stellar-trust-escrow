import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Toast, ToastContainer } from './Toast';

/**
 * `Toast` renders a single transient notification; `ToastContainer` stacks a
 * list of them in the bottom-right corner. Stories below exercise every
 * supported `type` plus a multi-toast container.
 */
const meta: Meta<typeof Toast> = {
  title: 'UI/Toast',
  component: Toast,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'],
      description: 'Severity / colour of the toast',
    },
    message: { control: 'text', description: 'Toast body text' },
    duration: {
      control: 'number',
      description: 'Auto-dismiss delay in ms (set very high in stories to keep them visible)',
    },
    onClose: { action: 'close', description: 'Called when the toast is dismissed' },
  },
  args: {
    type: 'info',
    message: 'Heads up — something happened.',
    duration: 100000,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: { type: 'success', message: 'Milestone approved and funds released.' },
};

export const Error: Story = {
  args: { type: 'error', message: 'Transaction failed. Please try again.' },
};

export const Warning: Story = {
  args: { type: 'warning', message: 'Your session will expire in 2 minutes.' },
};

export const Info: Story = {
  args: { type: 'info', message: 'A new dispute was opened on escrow #4821.' },
};

export const MultipleToasts: StoryObj = {
  render: () => (
    <ToastContainer
      onRemove={fn()}
      toasts={[
        { id: 1, type: 'success', message: 'Milestone 1 approved.' },
        { id: 2, type: 'info', message: 'Counterparty signed the agreement.' },
        { id: 3, type: 'warning', message: 'Milestone 3 is awaiting review.' },
      ]}
    />
  ),
  parameters: { layout: 'centered' },
};
