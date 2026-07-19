import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import EscrowListItem from './EscrowListItem';

/**
 * `EscrowListItem` is a single row in the escrow dashboard list. Each status
 * variant shows a different badge colour, milestone progress, and (for
 * `active`) a "Raise dispute" action.
 */
const meta: Meta<typeof EscrowListItem> = {
  title: 'Escrow/EscrowListItem',
  component: EscrowListItem,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    status: {
      control: 'select',
      options: ['active', 'disputed', 'completed', 'cancelled'],
      description: 'Lifecycle status of the escrow',
    },
    title: { control: 'text', description: 'Escrow title' },
    counterparty: { control: 'text', description: 'Other party in the escrow' },
    amount: { control: 'text', description: 'Formatted amount held' },
    createdAt: { control: 'text', description: 'ISO creation date' },
    milestonesApproved: { control: 'number', description: 'Approved milestone count' },
    milestonesTotal: { control: 'number', description: 'Total milestone count' },
    onView: { action: 'view', description: 'Open detail view' },
    onDispute: { action: 'dispute', description: 'Raise a dispute' },
  },
  args: {
    id: 'escrow-4821',
    title: 'Website redesign — milestone based',
    counterparty: 'Acme Studio',
    amount: '1,250 XLM',
    createdAt: '2026-06-01',
    milestonesApproved: 2,
    milestonesTotal: 4,
    onView: fn(),
    onDispute: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof EscrowListItem>;

export const Active: Story = {
  args: {
    status: 'active',
    milestonesApproved: 2,
    milestonesTotal: 4,
  },
};

export const Disputed: Story = {
  args: {
    status: 'disputed',
    milestonesApproved: 1,
    milestonesTotal: 3,
  },
};

export const Completed: Story = {
  args: {
    status: 'completed',
    milestonesApproved: 4,
    milestonesTotal: 4,
  },
};

export const Cancelled: Story = {
  args: {
    status: 'cancelled',
    milestonesApproved: 0,
    milestonesTotal: 4,
  },
};
