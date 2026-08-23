/**
 * EscrowGanttChart & gantt-utils Tests
 *
 * Tests the critical path algorithm, dependency graph utilities,
 * and the EscrowGanttChart component rendering.
 */

import { screen, fireEvent } from '@testing-library/react';
import {
  topologicalSort,
  hasCycle,
  computeCriticalPath,
  CyclicDependencyError,
  createScale,
  generateTicks,
} from '../../../lib/gantt-utils';
import EscrowGanttChart from '../../../components/escrow/EscrowGanttChart';
import { renderWithAppProviders } from '../../test-utils';

// ── Polyfill ResizeObserver for jsdom ──────────────────────────────────────────
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── Fixtures ───────────────────────────────────────────────────────────────────

const makeMilestone = (overrides) => ({
  milestone_id: 'm1',
  title: 'Milestone 1',
  start_date: '2026-08-01',
  end_date: '2026-08-15',
  status: 'pending',
  progress_pct: 0,
  depends_on: [],
  ...overrides,
});

const linearChain = [
  makeMilestone({ milestone_id: 'm1', start_date: '2026-08-01', end_date: '2026-08-10' }),
  makeMilestone({
    milestone_id: 'm2',
    title: 'Milestone 2',
    start_date: '2026-08-10',
    end_date: '2026-08-20',
    depends_on: ['m1'],
  }),
  makeMilestone({
    milestone_id: 'm3',
    title: 'Milestone 3',
    start_date: '2026-08-20',
    end_date: '2026-08-30',
    depends_on: ['m2'],
  }),
];

const branchingDag = [
  makeMilestone({ milestone_id: 'a', start_date: '2026-08-01', end_date: '2026-08-10' }),
  makeMilestone({
    milestone_id: 'b',
    title: 'B',
    start_date: '2026-08-10',
    end_date: '2026-08-25',
    depends_on: ['a'],
  }),
  makeMilestone({
    milestone_id: 'c',
    title: 'C',
    start_date: '2026-08-10',
    end_date: '2026-08-15',
    depends_on: ['a'],
  }),
  makeMilestone({
    milestone_id: 'd',
    title: 'D',
    start_date: '2026-08-25',
    end_date: '2026-09-05',
    depends_on: ['b', 'c'],
  }),
];

const disconnectedGraph = [
  makeMilestone({ milestone_id: 'x1', start_date: '2026-08-01', end_date: '2026-08-10' }),
  makeMilestone({
    milestone_id: 'x2',
    title: 'X2',
    start_date: '2026-08-05',
    end_date: '2026-08-15',
  }),
];

const cyclicDeps = [
  makeMilestone({ milestone_id: 'c1', depends_on: ['c3'] }),
  makeMilestone({ milestone_id: 'c2', title: 'C2', depends_on: ['c1'] }),
  makeMilestone({ milestone_id: 'c3', title: 'C3', depends_on: ['c2'] }),
];

// ── gantt-utils: topologicalSort ───────────────────────────────────────────────

describe('topologicalSort', () => {
  it('sorts a linear chain correctly', () => {
    const result = topologicalSort(linearChain);
    expect(result).toEqual(['m1', 'm2', 'm3']);
  });

  it('sorts a branching DAG correctly', () => {
    const result = topologicalSort(branchingDag);
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('b'));
    expect(result.indexOf('a')).toBeLessThan(result.indexOf('c'));
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('d'));
    expect(result.indexOf('c')).toBeLessThan(result.indexOf('d'));
  });

  it('handles disconnected graph', () => {
    const result = topologicalSort(disconnectedGraph);
    expect(result).toHaveLength(2);
    expect(result).toContain('x1');
    expect(result).toContain('x2');
  });

  it('throws CyclicDependencyError for cyclic deps', () => {
    expect(() => topologicalSort(cyclicDeps)).toThrow(CyclicDependencyError);
  });

  it('returns all IDs in sorted output', () => {
    const result = topologicalSort(linearChain);
    expect(result.sort()).toEqual(['m1', 'm2', 'm3']);
  });
});

// ── gantt-utils: hasCycle ──────────────────────────────────────────────────────

describe('hasCycle', () => {
  it('returns false for acyclic graph', () => {
    expect(hasCycle(linearChain)).toBe(false);
  });

  it('returns true for cyclic graph', () => {
    expect(hasCycle(cyclicDeps)).toBe(true);
  });

  it('returns false for empty graph', () => {
    expect(hasCycle([])).toBe(false);
  });
});

// ── gantt-utils: computeCriticalPath ───────────────────────────────────────────

describe('computeCriticalPath', () => {
  it('finds critical path in linear chain', () => {
    const result = computeCriticalPath(linearChain);
    expect(result).toEqual(new Set(['m1', 'm2', 'm3']));
  });

  it('finds critical path in branching DAG (longest path)', () => {
    const result = computeCriticalPath(branchingDag);
    // Critical path should be a -> b -> d (10 + 15 + 11 = 36 days)
    // vs a -> c -> d (10 + 5 + 11 = 26 days)
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.has('d')).toBe(true);
    expect(result.has('c')).toBe(false);
  });

  it('returns empty set for empty input', () => {
    const result = computeCriticalPath([]);
    expect(result.size).toBe(0);
  });

  it('returns empty set for cyclic graph', () => {
    const result = computeCriticalPath(cyclicDeps);
    expect(result.size).toBe(0);
  });

  it('handles single milestone', () => {
    const single = [makeMilestone({ milestone_id: 'only' })];
    const result = computeCriticalPath(single);
    expect(result).toEqual(new Set(['only']));
  });
});

// ── gantt-utils: createScale ───────────────────────────────────────────────────

describe('createScale', () => {
  it('maps domain start to range start', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-10');
    const scale = createScale(start, end, 0, 100);
    expect(scale(start)).toBe(0);
  });

  it('maps domain end to range end', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-10');
    const scale = createScale(start, end, 0, 100);
    expect(scale(end)).toBe(100);
  });

  it('maps midpoint correctly', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-11');
    const scale = createScale(start, end, 0, 100);
    const mid = new Date('2026-08-06');
    expect(scale(mid)).toBe(50);
  });
});

// ── gantt-utils: generateTicks ─────────────────────────────────────────────────

describe('generateTicks', () => {
  it('generates daily ticks', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-08-04');
    const ticks = generateTicks(start, end, 'Day');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });

  it('generates weekly ticks', () => {
    const start = new Date('2026-08-01');
    const end = new Date('2026-09-01');
    const ticks = generateTicks(start, end, 'Week');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});

// ── EscrowGanttChart Component ─────────────────────────────────────────────────

describe('EscrowGanttChart', () => {
  it('renders empty state with 0 milestones', () => {
    renderWithAppProviders(<EscrowGanttChart milestones={[]} />);
    expect(screen.getByText('No milestones to display')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-empty')).toBeInTheDocument();
  });

  it('renders chart with milestones', () => {
    renderWithAppProviders(
      <EscrowGanttChart
        milestones={[
          makeMilestone({ milestone_id: 'm1', title: 'Design Phase', status: 'completed', progress_pct: 100 }),
          makeMilestone({
            milestone_id: 'm2',
            title: 'Development',
            status: 'in_progress',
            progress_pct: 50,
            depends_on: ['m1'],
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('escrow-gantt-chart')).toBeInTheDocument();
    expect(screen.getByTestId('gantt-svg')).toBeInTheDocument();
    expect(screen.getByText('Design Phase')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    renderWithAppProviders(
      <EscrowGanttChart milestones={[makeMilestone({ milestone_id: 'm1' })]} />,
    );
    expect(screen.getByTestId('zoom-day')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-week')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-month')).toBeInTheDocument();
    expect(screen.getByTestId('zoom-quarter')).toBeInTheDocument();
  });

  it('renders export PNG button', () => {
    renderWithAppProviders(
      <EscrowGanttChart milestones={[makeMilestone({ milestone_id: 'm1' })]} />,
    );
    expect(screen.getByTestId('export-png')).toBeInTheDocument();
  });

  it('renders milestone bars with data-testid', () => {
    renderWithAppProviders(
      <EscrowGanttChart milestones={[makeMilestone({ milestone_id: 'm1' })]} />,
    );
    expect(screen.getByTestId('milestone-bar-m1')).toBeInTheDocument();
  });

  it('shows cycle error for cyclic dependencies', () => {
    renderWithAppProviders(<EscrowGanttChart milestones={cyclicDeps} />);
    expect(screen.getByTestId('gantt-cycle-error')).toBeInTheDocument();
    expect(screen.getByText('Cyclic Dependency Detected')).toBeInTheDocument();
  });

  it('zoom controls are clickable', () => {
    renderWithAppProviders(
      <EscrowGanttChart milestones={[makeMilestone({ milestone_id: 'm1' })]} />,
    );
    const dayBtn = screen.getByTestId('zoom-day');
    fireEvent.click(dayBtn);
    expect(dayBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('renders status legend', () => {
    renderWithAppProviders(
      <EscrowGanttChart milestones={[makeMilestone({ milestone_id: 'm1' })]} />,
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Critical Path')).toBeInTheDocument();
  });

  it('calls onMilestoneClick when bar is clicked', () => {
    const handleClick = jest.fn();
    const milestone = makeMilestone({ milestone_id: 'm1', title: 'Click Me' });
    renderWithAppProviders(
      <EscrowGanttChart milestones={[milestone]} onMilestoneClick={handleClick} />,
    );
    fireEvent.click(screen.getByTestId('milestone-bar-m1'));
    expect(handleClick).toHaveBeenCalledWith(milestone);
  });

  it('renders 100+ milestones without crashing', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      makeMilestone({
        milestone_id: `m${i}`,
        title: `Milestone ${i}`,
        start_date: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
        end_date: `2026-0${(i % 9) + 1}-${String(Math.min((i % 28) + 5, 28)).padStart(2, '0')}`,
      }),
    );
    renderWithAppProviders(<EscrowGanttChart milestones={many} />);
    expect(screen.getByTestId('escrow-gantt-chart')).toBeInTheDocument();
  });
});
