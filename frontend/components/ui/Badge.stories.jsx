import Badge from './Badge';

/**
 * The `Badge` component renders a colored status pill for escrow statuses,
 * milestone statuses, and reputation tiers. Each status maps to a distinct
 * color scheme so users can identify state at a glance.
 */
export default {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: [
        // Escrow
        'Active',
        'Completed',
        'Disputed',
        'Cancelled',
        // Milestone
        'Pending',
        'Submitted',
        'Approved',
        'Rejected',
        // Reputation
        'NEW',
        'TRUSTED',
        'VERIFIED',
        'EXPERT',
        'ELITE',
      ],
      description: 'The status value to display. Drives both color and icon.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md'],
      description: 'Size variant of the badge',
      table: { defaultValue: { summary: 'md' } },
    },
  },
  args: {
    status: 'Active',
    size: 'md',
  },
};

// ── Escrow Statuses ───────────────────────────────────────────────────────────

export const EscrowActive = { args: { status: 'Active' } };
export const EscrowCompleted = { args: { status: 'Completed' } };
export const EscrowDisputed = { args: { status: 'Disputed' } };
export const EscrowCancelled = { args: { status: 'Cancelled' } };

// ── Milestone Statuses ────────────────────────────────────────────────────────

export const MilestonePending = { args: { status: 'Pending' } };
export const MilestoneSubmitted = { args: { status: 'Submitted' } };
export const MilestoneApproved = { args: { status: 'Approved' } };
export const MilestoneRejected = { args: { status: 'Rejected' } };

// ── Reputation Tiers ──────────────────────────────────────────────────────────

export const ReputationNew = { args: { status: 'NEW' } };
export const ReputationTrusted = { args: { status: 'TRUSTED' } };
export const ReputationVerified = { args: { status: 'VERIFIED' } };
export const ReputationExpert = { args: { status: 'EXPERT' } };
export const ReputationElite = { args: { status: 'ELITE' } };

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const SizeSmall = { args: { status: 'Active', size: 'sm' } };
export const SizeMedium = { args: { status: 'Active', size: 'md' } };

// ── All Statuses Overview ─────────────────────────────────────────────────────

export const AllEscrowStatuses = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['Active', 'Completed', 'Disputed', 'Cancelled'].map((s) => (
        <Badge key={s} status={s} />
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const AllMilestoneStatuses = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['Pending', 'Submitted', 'Approved', 'Rejected'].map((s) => (
        <Badge key={s} status={s} />
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const AllReputationTiers = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {['NEW', 'TRUSTED', 'VERIFIED', 'EXPERT', 'ELITE'].map((s) => (
        <Badge key={s} status={s} />
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};
