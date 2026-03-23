import StatCard from './StatCard';

/**
 * The `StatCard` component displays a single metric with a label, value,
 * and an optional emoji icon. Used on the dashboard to surface key numbers
 * like total escrows, volume, and reputation score.
 */
export default {
  title: 'UI/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'Short uppercase label describing the metric',
    },
    value: {
      control: 'text',
      description: 'The primary value to display (string or number)',
    },
    icon: {
      control: 'text',
      description: 'Optional emoji or character shown in the top-right corner',
    },
  },
  args: {
    label: 'Total Escrows',
    value: '24',
    icon: '📋',
  },
};

export const Default = {};

export const WithoutIcon = {
  args: { label: 'Active Escrows', value: '7', icon: undefined },
};

export const LargeNumber = {
  args: { label: 'Total Volume', value: '$1,240,000', icon: '💰' },
};

export const ReputationScore = {
  args: { label: 'Reputation Score', value: '342', icon: '⭐' },
};

export const ZeroState = {
  args: { label: 'Disputes Won', value: '0', icon: '🏆' },
};

// ── Dashboard Grid ────────────────────────────────────────────────────────────

export const DashboardGrid = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
      <StatCard label="Total Escrows" value="24" icon="📋" />
      <StatCard label="Active" value="7" icon="🔒" />
      <StatCard label="Total Volume" value="$84,200" icon="💰" />
      <StatCard label="Reputation" value="342" icon="⭐" />
    </div>
  ),
  parameters: {
    controls: { disable: true },
    docs: {
      description: {
        story: 'Four-card grid as seen on the user dashboard.',
      },
    },
  },
};
