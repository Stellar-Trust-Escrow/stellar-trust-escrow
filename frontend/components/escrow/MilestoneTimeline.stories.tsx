import type { Meta, StoryObj } from '@storybook/react';
import MilestoneTimeline, { type Milestone } from './MilestoneTimeline';

/**
 * `MilestoneTimeline` renders an accessible, vertical list of escrow
 * milestones. The four stories below cover every meaningful status
 * combination called out in the component spec.
 */
const meta: Meta<typeof MilestoneTimeline> = {
  title: 'Escrow/MilestoneTimeline',
  component: MilestoneTimeline,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    currentIndex: {
      control: 'number',
      description: 'Index of the milestone awaiting action (highlighted ring)',
    },
    milestones: {
      description: 'Array of milestone objects ({ id, title, description?, amount?, status })',
    },
  },
};

export default meta;
type Story = StoryObj<typeof MilestoneTimeline>;

const BASE: Milestone[] = [
  {
    id: 'm1',
    title: 'Kickoff & specs',
    amount: '250 XLM',
    status: 'approved',
    description: 'Align on requirements',
  },
  {
    id: 'm2',
    title: 'Design deliverable',
    amount: '250 XLM',
    status: 'pending',
    description: 'Review mockups',
  },
  {
    id: 'm3',
    title: 'Development',
    amount: '500 XLM',
    status: 'pending',
    description: 'Implement the feature',
  },
  {
    id: 'm4',
    title: 'Final handoff',
    amount: '250 XLM',
    status: 'pending',
    description: 'Deploy & sign off',
  },
];

export const AllPending: Story = {
  args: { milestones: BASE.map((m) => ({ ...m, status: 'pending' })), currentIndex: 0 },
};

export const PartiallyApproved: Story = {
  args: {
    milestones: [
      { ...BASE[0], status: 'approved' },
      { ...BASE[1], status: 'approved' },
      { ...BASE[2], status: 'pending' },
      { ...BASE[3], status: 'pending' },
    ],
    currentIndex: 2,
  },
};

export const AllApproved: Story = {
  args: {
    milestones: BASE.map((m) => ({ ...m, status: 'approved' })),
    currentIndex: 3,
  },
};

export const WithDispute: Story = {
  args: {
    milestones: [
      { ...BASE[0], status: 'approved' },
      { ...BASE[1], status: 'disputed', description: 'Client disputes the mockups' },
      { ...BASE[2], status: 'pending' },
      { ...BASE[3], status: 'pending' },
    ],
    currentIndex: 1,
  },
};
