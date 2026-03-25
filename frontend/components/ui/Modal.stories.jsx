import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * The `Modal` component is an accessible overlay dialog with backdrop-dismiss
 * and Escape-key support. It prevents body scroll while open and supports
 * three size variants.
 *
 * > **Note:** Use the "Open Modal" button in each story to see the modal in
 * > its open state. The `isOpen` control in the panel also toggles it directly.
 */
export default {
  title: 'UI/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    isOpen: {
      control: 'boolean',
      description: 'Controls whether the modal is visible',
    },
    title: {
      control: 'text',
      description: 'Heading displayed at the top of the modal panel',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Max-width of the modal panel',
      table: { defaultValue: { summary: 'md' } },
    },
    onClose: { action: 'closed' },
  },
  // Modals need a plain background — override the global decorator padding
  decorators: [
    (Story) => (
      <div className="min-h-[300px] bg-gray-900 flex items-center justify-center">
        <Story />
      </div>
    ),
  ],
};

// ── Interactive wrapper ───────────────────────────────────────────────────────

/** Stateful wrapper so the open/close cycle works in the canvas. */
function ModalDemo({ title, size, children, triggerLabel = 'Open Modal' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{triggerLabel}</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={title} size={size}>
        {children}
      </Modal>
    </>
  );
}

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default = {
  render: () => (
    <ModalDemo title="Confirm Action" size="md">
      <p className="text-gray-400 text-sm">
        Are you sure you want to approve this milestone? This will release funds to the freelancer.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary">Cancel</Button>
        <Button variant="primary">Confirm</Button>
      </div>
    </ModalDemo>
  ),
};

export const Small = {
  render: () => (
    <ModalDemo title="Quick Note" size="sm" triggerLabel="Open Small Modal">
      <p className="text-gray-400 text-sm">This is a compact modal for short messages.</p>
    </ModalDemo>
  ),
};

export const Large = {
  render: () => (
    <ModalDemo title="Project Brief" size="lg" triggerLabel="Open Large Modal">
      <p className="text-gray-400 text-sm">
        Large modals are suited for displaying detailed content such as project briefs, milestone
        descriptions, or dispute evidence.
      </p>
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    </ModalDemo>
  ),
};

export const NoTitle = {
  render: () => (
    <ModalDemo triggerLabel="Open Titleless Modal">
      <p className="text-gray-400 text-sm">
        This modal has no title prop — the header only shows the close button.
      </p>
    </ModalDemo>
  ),
};

export const DisputeModal = {
  render: () => (
    <ModalDemo title="Raise Dispute" size="md" triggerLabel="Raise Dispute">
      <p className="text-gray-400 text-sm mb-4">
        Raising a dispute will freeze all funds until the arbiter resolves the issue. Please provide
        a reason below.
      </p>
      <textarea
        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm
                   text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-2
                   focus:ring-indigo-500/50 resize-none"
        rows={4}
        placeholder="Describe the issue…"
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary">Cancel</Button>
        <Button variant="danger">Raise Dispute</Button>
      </div>
    </ModalDemo>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Real-world usage: the dispute modal from the escrow detail page.',
      },
    },
  },
};
