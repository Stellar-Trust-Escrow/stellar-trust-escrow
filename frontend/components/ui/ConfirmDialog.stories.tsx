import type { Meta, StoryObj } from '@storybook/react';
import { fn, within, userEvent, expect } from '@storybook/test';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * `ConfirmDialog` is a modal confirmation prompt rendered with a backdrop.
 * It uses `role="dialog"` + `aria-modal` and auto-focuses the confirm button.
 *
 * The `DangerVariant` story includes an `@storybook/addon-interactions`
 * `play` function that clicks the confirm button and asserts the supplied
 * `onConfirm` callback was invoked.
 */
const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    open: { control: 'boolean', description: 'Whether the dialog is visible' },
    title: { control: 'text', description: 'Dialog heading' },
    message: { control: 'text', description: 'Dialog body message' },
    confirmLabel: { control: 'text', description: 'Label for the confirm button' },
    cancelLabel: { control: 'text', description: 'Label for the cancel button' },
    danger: {
      control: 'boolean',
      description: 'Renders the confirm button in the destructive (red) style',
    },
    onConfirm: { action: 'confirm', description: 'Called when confirm is clicked' },
    onCancel: { action: 'cancel', description: 'Called when cancel is clicked' },
  },
  args: {
    open: true,
    title: 'Confirm action',
    message: 'Are you sure you want to continue?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    danger: false,
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: 'Release milestone?',
    message: 'This will release the escrow funds for the approved milestone.',
  },
};

export const DangerVariant: Story = {
  args: {
    danger: true,
    title: 'Raise a dispute?',
    message: 'Opening a dispute will lock the escrow until it is resolved.',
    confirmLabel: 'Raise dispute',
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const confirmButton = canvas.getByRole('button', { name: /raise dispute/i });
    await userEvent.click(confirmButton);
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

export const WithLongContent: Story = {
  args: {
    title: 'Review escrow terms before releasing funds',
    message:
      'This escrow releases 1,250 XLM across 4 milestones. Once you confirm, the ' +
      'smart contract will transfer the agreed amount to the counterparty. This ' +
      'action is recorded on-chain and cannot be reversed without mutual consent ' +
      'or a successful dispute resolution. Please make sure every milestone has ' +
      'been completed and verified before proceeding.',
    confirmLabel: 'I understand, release funds',
  },
};
