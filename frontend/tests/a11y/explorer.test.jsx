import { render, screen, waitFor, act } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import ExplorerPage from '../../app/explorer/page';
import { renderWithAppProviders } from '../test-utils';

expect.extend(toHaveNoViolations);

// Mock the card (heavy / network-touching) and drive the scroll sentinel.
jest.mock(
  '../../components/escrow/EscrowCard',
  () =>
    function EscrowCard({ escrow }) {
      return <div data-testid="escrow-card">Escrow #{escrow.id}</div>;
    },
);

let observerCallback = null;
class MockIntersectionObserver {
  constructor(cb) {
    observerCallback = cb;
    this.observe = jest.fn();
    this.disconnect = jest.fn();
    this.unobserve = jest.fn();
  }
}
beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver;
});
afterAll(() => {
  delete global.IntersectionObserver;
});
afterEach(() => {
  observerCallback = null;
  jest.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

function mockTwoPages() {
  global.fetch = jest.fn(async (url) => {
    const m = String(url).match(/[?&]page=(\d+)/);
    const page = m ? Number(m[1]) : 1;
    const ids = Array.from({ length: 12 }, (_, i) => (page - 1) * 12 + i + 1);
    return {
      ok: true,
      json: async () => ({
        data: ids.map((id) => ({
          id,
          clientAddress: `G${id}A`,
          status: 'Active',
          totalAmount: '1000',
        })),
        page,
        limit: 12,
        total: 24,
        totalPages: 2,
        hasNextPage: page < 2,
        hasPreviousPage: page > 1,
      }),
    };
  });
}

async function renderExplorer() {
  const utils = renderWithAppProviders(<ExplorerPage />);
  await screen.findAllByRole('article');
  return utils;
}

describe('ExplorerPage — accessibility (axe-core, zero violations)', () => {
  beforeEach(() => mockTwoPages());

  it('passes axe-core in light mode', async () => {
    const { container } = await renderExplorer();
    const results = await global.axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe-core in dark mode', async () => {
    // ThemeProvider applies `dark` to <html> after mount; force it for the run.
    document.documentElement.classList.add('dark');
    const { container } = await renderExplorer();
    const results = await global.axe(container);
    expect(results).toHaveNoViolations();
  });

  it('passes axe-core after loading a second page', async () => {
    const { container } = await renderExplorer();
    act(() => observerCallback?.([{ isIntersecting: true }]));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(24));
    const results = await global.axe(container);
    expect(results).toHaveNoViolations();
  });

  it('exposes a labelled feed with article children', async () => {
    await renderExplorer();
    const feed = screen.getByRole('feed', { name: /escrow results/i });
    expect(feed).toBeInTheDocument();
    expect(feed).toHaveAttribute('aria-busy', 'false');
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
  });

  it('announces loading state via aria-busy when fetching more', async () => {
    const { container } = await renderExplorer();
    act(() => observerCallback?.([{ isIntersecting: true }]));
    await waitFor(() =>
      expect(container.querySelector('[role="feed"]')).toHaveAttribute('aria-busy', 'true'),
    );
  });
});
