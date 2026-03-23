import ReputationBadge from './ReputationBadge';

/**
 * The `ReputationBadge` component displays a numerical reputation score
 * inside a color-coded ring. The ring color shifts through four tiers:
 *
 * | Score     | Tier     | Color  |
 * |-----------|----------|--------|
 * | 0 – 99    | New      | Gray   |
 * | 100 – 249 | Trusted  | Indigo |
 * | 250 – 499 | Expert   | Purple |
 * | 500+      | Elite    | Amber  |
 */
export default {
  title: 'UI/ReputationBadge',
  component: ReputationBadge,
  tags: ['autodocs'],
  argTypes: {
    score: {
      control: { type: 'number', min: 0, max: 1000, step: 10 },
      description: 'Reputation score (0–1000+). Drives the ring color tier.',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Physical size of the badge circle',
      table: { defaultValue: { summary: 'md' } },
    },
  },
  args: {
    score: 120,
    size: 'md',
  },
};

export const Default = {};

// ── Tiers ─────────────────────────────────────────────────────────────────────

export const NewUser = {
  args: { score: 0 },
  name: 'Tier: New (0)',
};

export const Trusted = {
  args: { score: 150 },
  name: 'Tier: Trusted (100–249)',
};

export const Expert = {
  args: { score: 300 },
  name: 'Tier: Expert (250–499)',
};

export const Elite = {
  args: { score: 750 },
  name: 'Tier: Elite (500+)',
};

// ── Sizes ─────────────────────────────────────────────────────────────────────

export const Small = { args: { score: 200, size: 'sm' } };
export const Medium = { args: { score: 200, size: 'md' } };
export const Large = { args: { score: 200, size: 'lg' } };

// ── All Tiers Side-by-Side ────────────────────────────────────────────────────

export const AllTiers = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="flex flex-col items-center gap-1">
        <ReputationBadge score={0} size="lg" />
        <span className="text-xs text-gray-500">New</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <ReputationBadge score={150} size="lg" />
        <span className="text-xs text-gray-500">Trusted</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <ReputationBadge score={300} size="lg" />
        <span className="text-xs text-gray-500">Expert</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <ReputationBadge score={750} size="lg" />
        <span className="text-xs text-gray-500">Elite</span>
      </div>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
