'use client';

import { useCallback, useEffect, useState } from 'react';
import GridLayout from 'react-grid-layout';

const DEFAULT_LAYOUT = [
  { i: 'balance', x: 0, y: 0, w: 4, h: 2 },
  { i: 'escrows', x: 4, y: 0, w: 4, h: 2 },
  { i: 'transactions', x: 8, y: 0, w: 4, h: 2 },
  { i: 'chart', x: 0, y: 2, w: 8, h: 4 },
  { i: 'activity', x: 8, y: 2, w: 4, h: 4 },
];

const WIDGETS = {
  balance: {
    title: 'XLM Balance',
    content: <p className="text-2xl font-bold text-white">1,204.50 XLM</p>,
  },
  escrows: {
    title: 'Active Escrows',
    content: <p className="text-2xl font-bold text-white">7</p>,
  },
  transactions: {
    title: 'Transactions',
    content: <p className="text-2xl font-bold text-white">132</p>,
  },
  chart: {
    title: 'Payout History',
    content: (
      <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-gray-500">
        Chart
      </div>
    ),
  },
  activity: {
    title: 'Recent Activity',
    content: (
      <ul className="space-y-2 text-sm text-gray-300">
        <li>Escrow #44 released</li>
        <li>Milestone approved</li>
        <li>New dispute opened</li>
      </ul>
    ),
  },
};

export default function CustomDashboardPage() {
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const syncWidth = () => setWidth(Math.max(320, window.innerWidth - 48));
    syncWidth();
    window.addEventListener('resize', syncWidth);

    fetch('/api/dashboard/layout')
      .then((response) => (response.ok ? response.json() : null))
      .then((saved) => {
        if (Array.isArray(saved)) setLayout(saved);
      })
      .catch(() => {});

    return () => window.removeEventListener('resize', syncWidth);
  }, []);

  const saveLayout = useCallback(async (nextLayout) => {
    setSaving(true);
    try {
      await fetch('/api/dashboard/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextLayout),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  const handleLayoutChange = (nextLayout) => {
    setLayout(nextLayout);
    saveLayout(nextLayout);
  };

  return (
    <main className="space-y-6 p-6" role="main">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">My Dashboard</h1>
          <p className="text-sm text-gray-400">Reorder and resize your escrow workspace.</p>
        </div>
        {saving && (
          <span className="text-sm text-gray-400" aria-live="polite">
            Saving layout...
          </span>
        )}
      </div>

      <GridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={80}
        width={width}
        onLayoutChange={handleLayoutChange}
        onDragStart={(_, item) => setDragging(item.i)}
        onDragStop={() => setDragging(null)}
        draggableHandle=".drag-handle"
        resizeHandles={['se']}
      >
        {layout.map(({ i }) => {
          const widget = WIDGETS[i];
          if (!widget) return null;

          const isActive = dragging === i;
          return (
            <section
              key={i}
              className={`flex h-full flex-col rounded-lg border border-gray-800 bg-gray-900 p-4 shadow-sm transition ${
                isActive ? 'scale-[1.01] border-indigo-400 ring-2 ring-indigo-500/40' : ''
              }`}
              aria-label={`${widget.title} widget`}
            >
              <div
                className="drag-handle mb-3 flex cursor-grab items-center justify-between active:cursor-grabbing"
                aria-grabbed={isActive}
                aria-label={`Drag to reorder ${widget.title}`}
              >
                <h2 className="text-sm font-medium text-gray-300">{widget.title}</h2>
                <span className="select-none text-gray-500" aria-hidden="true">
                  ::
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">{widget.content}</div>
            </section>
          );
        })}
      </GridLayout>
    </main>
  );
}
