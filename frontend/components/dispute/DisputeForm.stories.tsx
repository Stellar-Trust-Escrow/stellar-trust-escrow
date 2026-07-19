import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import DisputeForm, { type DisputeEvidence } from './DisputeForm';

/**
 * `DisputeForm` collects a dispute reason plus attached evidence. Stories
 * cover an empty form, a populated one, the submitting state, and an error.
 */
const meta: Meta<typeof DisputeForm> = {
  title: 'Dispute/DisputeForm',
  component: DisputeForm,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    submitting: { control: 'boolean', description: 'Shows spinner + disables submit' },
    error: { control: 'text', description: 'Error message to display' },
    evidence: { description: 'Array of attached evidence items' },
    onSubmit: { action: 'submit', description: 'Form submitted' },
    onAddEvidence: { action: 'add-evidence', description: 'Add evidence clicked' },
    onRemoveEvidence: { action: 'remove-evidence', description: 'Remove evidence clicked' },
  },
};

export default meta;
type Story = StoryObj<typeof DisputeForm>;

const SAMPLE_EVIDENCE: DisputeEvidence[] = [
  { id: 'e1', name: 'screenshot-delivery.png', size: 245_000, type: 'image/png' },
  { id: 'e2', name: 'contract-amendment.pdf', size: 1_200_000, type: 'application/pdf' },
];

export const Empty: Story = {
  args: { evidence: [], onSubmit: fn(), onAddEvidence: fn(), onRemoveEvidence: fn() },
};

export const WithEvidence: Story = {
  args: {
    evidence: SAMPLE_EVIDENCE,
    onSubmit: fn(),
    onAddEvidence: fn(),
    onRemoveEvidence: fn(),
  },
};

export const Submitting: Story = {
  args: {
    submitting: true,
    evidence: SAMPLE_EVIDENCE,
    onSubmit: fn(),
    onAddEvidence: fn(),
    onRemoveEvidence: fn(),
  },
};

export const Error: Story = {
  args: {
    error: 'A dispute is already open for this escrow.',
    evidence: SAMPLE_EVIDENCE,
    onSubmit: fn(),
    onAddEvidence: fn(),
    onRemoveEvidence: fn(),
  },
};
