import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import WalletConnectModal from './WalletConnectModal';

const SAMPLE_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ5678';

/**
 * `WalletConnectModal` guides the user through connecting a Stellar wallet.
 * The stories cover every connection state required by the spec. The modal is
 * `open` in all stories so the panel is visible; it is rendered above the
 * themed backdrop provided by the global decorator.
 */
const meta: Meta<typeof WalletConnectModal> = {
  title: 'Wallet/WalletConnectModal',
  component: WalletConnectModal,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: {
      control: 'select',
      options: ['disconnected', 'connecting', 'connected'],
      description: 'Connection lifecycle state',
    },
    walletType: {
      control: 'select',
      options: ['freighter', 'ledger'],
      description: 'Wallet integration in use',
    },
    address: { control: 'text', description: 'Connected public key' },
    error: { control: 'text', description: 'Error message' },
    ledgerStep: { control: 'number', description: 'Active ledger step (0-based)' },
    onConnect: { action: 'connect', description: 'Wallet chosen' },
    onDisconnect: { action: 'disconnect', description: 'Disconnect requested' },
    onClose: { action: 'close', description: 'Dialog dismissed' },
  },
  args: {
    open: true,
    status: 'disconnected',
    walletType: 'freighter',
    onConnect: fn(),
    onDisconnect: fn(),
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WalletConnectModal>;

export const Disconnected: Story = {
  args: { status: 'disconnected' },
};

export const Connecting: Story = {
  args: { status: 'connecting', walletType: 'freighter' },
};

export const ConnectedFreighter: Story = {
  args: { status: 'connected', walletType: 'freighter', address: SAMPLE_ADDRESS },
};

export const LedgerStep: Story = {
  args: { status: 'connecting', walletType: 'ledger', ledgerStep: 1 },
};
