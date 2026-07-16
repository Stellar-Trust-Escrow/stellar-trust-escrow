import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ExplorerPage from '../../app/explorer/page';
import { renderWithAppProviders } from '../test-utils';
import * as NextNavigation from 'next/navigation';

// EscrowCard uses useI18n which requires I18nProvider — mock it for tests.
jest.mock(
  '../../components/escrow/EscrowCard',
  () =>
    function EscrowCard({ escrow }) {
      return <div data-testid="escrow-card">Escrow #{escrow.id}</div>;
    },
);

// Controllable IntersectionObserver so we can drive the infinite-scroll sentinel.
let observerCallback = null;
class MockIntersectionObserver {
  constructor(cb) {
    observerCallback = cb;
    this.observe = jest.fn();
    this.disconnect = jest.fn();
    this.unobserve = jest.fn();
  }
}
function setIntersecting(value) {
  act(() => {
    observerCallback?.([{ isIntersecting: value }]);
  });
}
beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver;
});
afterAll(() => {
  delete global.IntersectionObserver;
});

// Build a paginated /api/escrows response with `totalPages` pages.
function makeEscrowsPage(page, totalPages) {
  const ids = totalPages === 0 ? [] : Array.from({ length: 12 }, (_, i) => (page - 1) * 12 + i + 1);
  return {
    data: ids.map((id) => ({
      id,
      clientAddress: `G${id}A`,
      status: 'Active',
      totalAmount: '1000',
    })),
    page,
    limit: 12,
    total: totalPages * 12,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

describe('ExplorerPage — infinite scroll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    observerCallback = null;
    window.localStorage.clear();
  });

  it('renders page heading', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByRole('heading', { name: 'Escrow Explorer' })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByPlaceholderText(/Search by/)).toBeInTheDocument();
  });

  it('renders the first page inside an ARIA feed', async () => {
    global.fetch = jest.fn(async (url) => {
      const m = String(url).match(/[?&]page=(\d+)/);
      return { ok: true, json: async () => makeEscrowsPage(m ? Number(m[1]) : 1, 3) };
    });
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByRole('feed', { name: /escrow results/i })).toBeInTheDocument();
    expect(await screen.findAllByRole('article')).toHaveLength(12);
    expect(screen.getByText('Escrow #1')).toBeInTheDocument();
  });

  it('loads the next page when the sentinel scrolls into view', async () => {
    global.fetch = jest.fn(async (url) => {
      const m = String(url).match(/[?&]page=(\d+)/);
      return { ok: true, json: async () => makeEscrowsPage(m ? Number(m[1]) : 1, 3) };
    });
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    setIntersecting(true);

    expect(await screen.findAllByRole('article')).toHaveLength(24);
    expect(screen.getByText('Escrow #13')).toBeInTheDocument();
  });

  it('loads more via the manual "Load more" button (keyboard path)', async () => {
    global.fetch = jest.fn(async (url) => {
      const m = String(url).match(/[?&]page=(\d+)/);
      return { ok: true, json: async () => makeEscrowsPage(m ? Number(m[1]) : 1, 2) };
    });
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    const loadMore = await screen.findByRole('button', { name: /load more escrows/i });
    fireEvent.click(loadMore);

    expect(await screen.findAllByRole('article')).toHaveLength(24);
  });

  it('shows the end-of-list message when no more pages exist', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    expect(await screen.findByText(/reached the end of the list/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more escrows/i })).not.toBeInTheDocument();
  });

  it('shows an error state with a retry button when the API fails', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    renderWithAppProviders(<ExplorerPage />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/failed to load escrows/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retries successfully after an error', async () => {
    let fail = true;
    global.fetch = jest.fn(async () => {
      if (fail) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => makeEscrowsPage(1, 1) };
    });
    renderWithAppProviders(<ExplorerPage />);

    const retry = await screen.findByRole('button', { name: /try again/i });
    fail = false;
    fireEvent.click(retry);

    expect(await screen.findByRole('feed', { name: /escrow results/i })).toBeInTheDocument();
  });

  it('shows an empty state when there are no results', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 0) }));
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByText(/no escrows found/i)).toBeInTheDocument();
  });

  it('shows a loading spinner on the initial load', async () => {
    let resolve;
    global.fetch = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByText(/loading escrows/i)).toBeInTheDocument();
    await act(async () => {
      resolve({ ok: true, json: async () => makeEscrowsPage(1, 1) });
    });
  });

  it('does not regress: renders search and filters controls', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    expect(await screen.findByPlaceholderText(/Search by/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('filters escrows by status', async () => {
    global.fetch = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes('status=Completed')) {
        return { ok: true, json: async () => makeEscrowsPage(1, 1) };
      }
      return { ok: true, json: async () => makeEscrowsPage(1, 3) };
    });
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const completedBtn = await screen.findByRole('button', { name: 'Completed' });
    fireEvent.click(completedBtn);

    await waitFor(() => expect(screen.getAllByRole('article').length).toBeGreaterThan(0));
  });
});

describe('ExplorerPage — primary user interactions', () => {
  // Spy on router.replace so we can assert the shareable-URL sync behaviour.
  let routerReplace;
  beforeEach(() => {
    jest.clearAllMocks();
    observerCallback = null;
    window.localStorage.clear();
    routerReplace = jest.fn();
    NextNavigation.useRouter.mockReturnValue({
      push: jest.fn(),
      replace: routerReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    });
  });

  // Collects every /api/escrows URL the page requests so we can assert that
  // typing/selecting filters actually drives a new (reset) fetch.
  function recordFetch(totalPages = 3) {
    const urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(String(url));
      const m = String(url).match(/[?&]page=(\d+)/);
      return { ok: true, json: async () => makeEscrowsPage(m ? Number(m[1]) : 1, totalPages) };
    });
    return urls;
  }

  it('refetches the list when the user types a search term (after the debounce)', async () => {
    const urls = recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.change(screen.getByPlaceholderText(/Search by/), { target: { value: 'abc' } });

    await waitFor(() => expect(urls.some((u) => /[?&]search=abc\b/.test(u))).toBe(true));
  });

  it('clears the search when the clear (X) button is clicked', async () => {
    const urls = recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    const input = screen.getByPlaceholderText(/Search by/);
    fireEvent.change(input, { target: { value: 'xyz' } });
    await waitFor(() => expect(urls.some((u) => /[?&]search=xyz\b/.test(u))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    // A fresh (search-free) fetch is issued and the input is emptied.
    await waitFor(() =>
      expect(urls.filter((u) => !/[?&]search=/.test(u)).length).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByPlaceholderText(/Search by/)).toHaveValue('');
  });

  it('keeps the URL in sync with the search term (shareable URL)', async () => {
    recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.change(screen.getByPlaceholderText(/Search by/), { target: { value: 'hello' } });

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        expect.stringContaining('search=hello'),
        expect.objectContaining({ scroll: false }),
      ),
    );
  });

  it('toggles the filters panel and reflects state via aria-expanded', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    const toggle = screen.getByRole('button', { name: 'Filters' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: 'Filters' })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('heading', { name: 'Filters' })).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Filters' })).not.toBeInTheDocument(),
    );
  });

  it('shows an active-filter count badge on the Filters button', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => makeEscrowsPage(1, 1) }));
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    // No badge before any filter is chosen.
    expect(screen.queryByRole('button', { name: 'Filters 1' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Active' }));
    expect(await screen.findByRole('button', { name: 'Filters 1' })).toBeInTheDocument();

    // Selecting a second status bumps the count.
    fireEvent.click(screen.getByRole('button', { name: 'Disputed' }));
    expect(await screen.findByRole('button', { name: 'Filters 2' })).toBeInTheDocument();
  });

  it('resets all filters via the panel "Clear all" control', async () => {
    const urls = recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Active' }));
    expect(await screen.findByRole('button', { name: 'Filters 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    // Badge is removed and the query is re-run without the status filter.
    expect(await screen.findByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filters 1' })).not.toBeInTheDocument();
    await waitFor(() => expect(urls.some((u) => !/[?&]status=/.test(u))).toBe(true));
  });

  it('refetches when the user changes the sort option', async () => {
    const urls = recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const sort = await screen.findByRole('combobox');
    fireEvent.change(sort, { target: { value: 'totalAmount:desc' } });

    await waitFor(() => expect(urls.some((u) => /[?&]sortBy=totalAmount\b/.test(u))).toBe(true));
  });

  it('refetches when a min-amount filter is applied', async () => {
    const urls = recordFetch();
    renderWithAppProviders(<ExplorerPage />);
    await screen.findAllByRole('article');

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const min = await screen.findByPlaceholderText('Min');
    fireEvent.change(min, { target: { value: '500' } });

    await waitFor(() => expect(urls.some((u) => /[?&]minAmount=500\b/.test(u))).toBe(true));
  });
});
