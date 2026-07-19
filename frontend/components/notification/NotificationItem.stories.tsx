import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import NotificationItem from './NotificationItem';

/**
 * `NotificationItem` renders a single notification. Stories cover the unread
 * (emphasised) state, the read (muted) state, and a notification that links
 * through to its related escrow.
 */
const meta: Meta<typeof NotificationItem> = {
  title: 'Notifications/NotificationItem',
  component: NotificationItem,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    read: { control: 'boolean', description: 'Whether the notification has been read' },
    title: { control: 'text', description: 'Notification title' },
    message: { control: 'text', description: 'Notification body' },
    createdAt: { control: 'text', description: 'ISO timestamp' },
    escrowLink: { control: 'text', description: 'When set, shows a "View escrow" link' },
    onMarkRead: { action: 'mark-read', description: 'Mark as read clicked' },
    onClick: { action: 'open', description: 'Escrow link clicked' },
  },
  args: {
    id: 'n1',
    title: 'Milestone approved',
    message: 'Milestone 2 of escrow #4821 was approved and funds released.',
    createdAt: '2026-07-12',
    onMarkRead: fn(),
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof NotificationItem>;

export const Unread: Story = {
  args: { read: false },
};

export const Read: Story = {
  args: { read: true },
};

export const WithEscrowLink: Story = {
  args: { read: false, escrowLink: '/escrow/4821' },
};
