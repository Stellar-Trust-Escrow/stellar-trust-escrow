import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import HashVerificationBadge from './HashVerificationBadge';

const SAMPLE_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

/**
 * `HashVerificationBadge` is a compact indicator of on-chain hash
 * verification. Stories cover the verified, mismatch, and verifying states.
 */
const meta: Meta<typeof HashVerificationBadge> = {
  title: 'Escrow/HashVerificationBadge',
  component: HashVerificationBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    status: {
      control: 'select',
      options: ['verified', 'mismatch', 'verifying'],
      description: 'Verification outcome',
    },
    hash: { control: 'text', description: 'Hash being verified' },
    onVerify: { action: 'verify', description: 'Badge clicked (re-verify)' },
  },
  args: {
    status: 'verified',
    hash: SAMPLE_HASH,
    onVerify: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof HashVerificationBadge>;

export const Verified: Story = {
  args: { status: 'verified', hash: SAMPLE_HASH },
};

export const Mismatch: Story = {
  args: { status: 'mismatch', hash: SAMPLE_HASH },
};

export const Verifying: Story = {
  args: { status: 'verifying', hash: SAMPLE_HASH },
};
