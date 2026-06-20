'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Mock data helpers ─────────────────────────────────────────────────────────

const MOCK_DISPUTES = [
  {
    id: 1,
    escrowId: 'ESC-001',
    client: 'GABCD...1234',
    freelancer: 'GXYZ...5678',
    amount: 5000,
    token: 'USDC',
    raisedAt: '2026-05-20T10:00:00Z',
    status: 'open',
    evidence: [
      {
        id: 'e1',
        author: 'client',
        role: 'Client',
        timestamp: '2026-05-20T10:05:00Z',
        type: 'text',
        content: 'Freelancer did not deliver the agreed scope.',
      },
      {
        id: 'e2',
        author: 'freelancer',
        role: 'Freelancer',
        timestamp: '2026-05-20T11:30:00Z',
        type: 'text',
        content: 'All deliverables were submitted on time per the brief.',
      },
      {
        id: 'e3',
        author: 'client',
        role: 'Client',
        timestamp: '2026-05-21T09:00:00Z',
        type: 'document',
        content: 'Original brief document',
        url: '#',
      },
      {
        id: 'e4',
        author: 'freelancer',
        role: 'Freelancer',
        timestamp: '2026-05-22T14:00:00Z',
        type: 'document',
        content: 'Delivery proof ZIP',
        url: '#',
      },
    ],
  },
  {
    id: 2,
    escrowId: 'ESC-002',
    client: 'GDEF...9012',
    freelancer: 'GABC...3456',
    amount: 1200,
    token: 'XLM',
    raisedAt: '2026-05-24T08:00:00Z',
    status: 'open',
    evidence: [
      {
        id: 'e5',
        author: 'freelancer',
        role: 'Freelancer',
        timestamp: '2026-05-24T08:30:00Z',
        type: 'text',
        content: 'Client has not responded for 14 days.',
      },
    ],
  },
];

const MOCK_ACTIVITY = [
  {
    id: 'a1',
    action: 'Resolved ESC-099',
    outcome: '70% client / 30% freelancer',
    at: '2026-05-18T16:00:00Z',
  },
  { id: 'a2', action: 'Resolved ESC-087', outcome: '100% freelancer', at: '2026-05-15T11:00:00Z' },
  { id: 'a3', action: 'Resolved ESC-074', outcome: '50% / 50%', at: '2026-05-10T09:30:00Z' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function DisputeQueueItem({ dispute, selected, onSelect }) {
  const age = Math.floor((Date.now() - new Date(dispute.raisedAt)) / 86_400_000);
  return (
    <button
      onClick={() => onSelect(dispute)}
      aria-pressed={selected}
      className={`w-full text-left p-4 rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        selected
          ? 'border-indigo-500 bg-indigo-900/30'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-white text-sm">{dispute.escrowId}</span>
        <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
          {age}d old
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">
        {dispute.client} ↔ {dispute.freelancer}
      </p>
      <p className="text-sm font-medium text-indigo-300 mt-1">
        {dispute.amount.toLocaleString()} {dispute.token}
      </p>
    </button>
  );
}

function EvidenceTimeline({ evidence }) {
  return (
    <ol aria-label="Evidence timeline" className="relative border-l border-gray-700 space-y-6 pl-6">
      {evidence.map((item) => (
        <li key={item.id} className="relative">
          {/* Timeline dot */}
          <span
            aria-hidden="true"
            className={`absolute -left-[1.65rem] top-1 w-3 h-3 rounded-full border-2 border-gray-900 ${
              item.author === 'client' ? 'bg-blue-400' : 'bg-emerald-400'
            }`}
          />
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="flex items-center justify-between mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  item.author === 'client'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {item.role}
              </span>
              <time className="text-xs text-gray-500" dateTime={item.timestamp}>
                {new Date(item.timestamp).toLocaleString()}
              </time>
            </div>
            {item.type === 'document' ? (
              <a
                href={item.url}
                className="text-sm text-indigo-400 underline hover:text-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              >
                📎 {item.content}
              </a>
            ) : (
              <p className="text-sm text-gray-200">{item.content}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PayoutSplitConfigurator({ totalAmount, token, onSubmit, submitting }) {
  const [clientPct, setClientPct] = useState(50);
  const freelancerPct = 100 - clientPct;
  const sliderRef = useRef(null);

  const clientAmount = ((totalAmount * clientPct) / 100).toFixed(2);
  const freelancerAmount = ((totalAmount * freelancerPct) / 100).toFixed(2);

  const handleKey = useCallback((e) => {
    if (e.key === 'ArrowLeft') setClientPct((p) => Math.max(0, p - 1));
    if (e.key === 'ArrowRight') setClientPct((p) => Math.min(100, p + 1));
    if (e.key === 'Home') setClientPct(0);
    if (e.key === 'End') setClientPct(100);
  }, []);

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
        Payout Split Configurator
      </h3>

      {/* Visual split bar */}
      <div
        role="img"
        aria-label={`Client ${clientPct}%, Freelancer ${freelancerPct}%`}
        className="flex h-6 rounded-full overflow-hidden"
      >
        <div
          className="bg-blue-500 transition-all duration-150"
          style={{ width: `${clientPct}%` }}
        />
        <div
          className="bg-emerald-500 transition-all duration-150"
          style={{ width: `${freelancerPct}%` }}
        />
      </div>

      {/* Slider */}
      <div>
        <label htmlFor="split-slider" className="sr-only">
          Client percentage (0–100)
        </label>
        <input
          id="split-slider"
          ref={sliderRef}
          type="range"
          min={0}
          max={100}
          value={clientPct}
          onChange={(e) => setClientPct(Number(e.target.value))}
          onKeyDown={handleKey}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clientPct}
          aria-valuetext={`Client ${clientPct}%, Freelancer ${freelancerPct}%`}
          className="w-full accent-indigo-500 cursor-pointer"
        />
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <p className="text-blue-300 font-medium">Client</p>
          <p className="text-white font-bold text-lg">{clientPct}%</p>
          <p className="text-gray-400">
            {clientAmount} {token}
          </p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
          <p className="text-emerald-300 font-medium">Freelancer</p>
          <p className="text-white font-bold text-lg">{freelancerPct}%</p>
          <p className="text-gray-400">
            {freelancerAmount} {token}
          </p>
        </div>
      </div>

      {/* Preset buttons */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Preset splits">
        {[
          { label: '100/0', value: 100 },
          { label: '75/25', value: 75 },
          { label: '50/50', value: 50 },
          { label: '25/75', value: 25 },
          { label: '0/100', value: 0 },
        ].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => setClientPct(value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              clientPct === value
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={() => onSubmit(clientPct, freelancerPct)}
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        aria-busy={submitting}
      >
        {submitting ? 'Signing & Submitting…' : 'Submit Decision to Contract'}
      </button>
    </div>
  );
}

function ActivityLog({ entries }) {
  return (
    <section aria-labelledby="activity-heading">
      <h2
        id="activity-heading"
        className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3"
      >
        Mediator Activity Log
      </h2>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 text-sm">
              <span className="text-gray-500 shrink-0 tabular-nums">
                {new Date(entry.at).toLocaleDateString()}
              </span>
              <span className="text-gray-200">{entry.action}</span>
              <span className="ml-auto text-indigo-300 shrink-0">{entry.outcome}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ArbitratorDashboard() {
  const [disputes, setDisputes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activity, setActivity] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const mainRef = useRef(null);

  useEffect(() => {
    // Replace with real API call when backend is ready
    setDisputes(MOCK_DISPUTES);
    setActivity(MOCK_ACTIVITY);
    if (MOCK_DISPUTES.length > 0) setSelected(MOCK_DISPUTES[0]);
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSubmitDecision = useCallback(
    async (clientPct, freelancerPct) => {
      if (!selected) return;
      setSubmitting(true);
      try {
        // Wallet signature + contract call would go here
        // e.g. await signAndSubmitResolveDispute(selected.escrowId, clientPct, freelancerPct)
        await new Promise((r) => setTimeout(r, 1200)); // simulate async
        showToast(`Decision submitted: ${clientPct}% client / ${freelancerPct}% freelancer`);
        setDisputes((prev) => prev.filter((d) => d.id !== selected.id));
        setActivity((prev) => [
          {
            id: `a${Date.now()}`,
            action: `Resolved ${selected.escrowId}`,
            outcome: `${clientPct}% client / ${freelancerPct}% freelancer`,
            at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setSelected(null);
      } catch {
        showToast('Transaction failed. Please try again.', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    [selected, showToast],
  );

  return (
    <>
      {/* Skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg"
      >
        Skip to main content
      </a>

      <div className="min-h-screen bg-gray-950 text-white">
        {/* Header */}
        <header className="border-b border-gray-800 px-6 py-4">
          <h1 className="text-xl font-bold text-white">Arbitrator Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {disputes.length} open dispute{disputes.length !== 1 ? 's' : ''}
          </p>
        </header>

        <main
          id="main-content"
          ref={mainRef}
          className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-0 h-[calc(100vh-73px)]"
        >
          {/* ── Column 1: Dispute Queue ── */}
          <aside
            aria-label="Active disputes queue"
            className="border-r border-gray-800 overflow-y-auto p-4 space-y-3"
          >
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
              Active Disputes
            </h2>
            {disputes.length === 0 ? (
              <p className="text-gray-500 text-sm px-1">No open disputes.</p>
            ) : (
              disputes.map((d) => (
                <DisputeQueueItem
                  key={d.id}
                  dispute={d}
                  selected={selected?.id === d.id}
                  onSelect={setSelected}
                />
              ))
            )}
          </aside>

          {/* ── Column 2: Evidence Timeline ── */}
          <section
            aria-label="Evidence timeline"
            className="overflow-y-auto p-6 border-r border-gray-800"
          >
            {selected ? (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-bold text-white">{selected.escrowId}</h2>
                    <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full">
                      Disputed
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {selected.client} ↔ {selected.freelancer}
                  </p>
                  <p className="text-sm text-indigo-300 font-medium mt-1">
                    {selected.amount.toLocaleString()} {selected.token} at stake
                  </p>
                </div>

                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
                  Chronological Evidence
                </h3>
                <EvidenceTimeline evidence={selected.evidence} />
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">Select a dispute to review evidence.</p>
              </div>
            )}
          </section>

          {/* ── Column 3: Payout Configurator + Activity ── */}
          <aside className="overflow-y-auto p-6 space-y-8" aria-label="Decision panel">
            {selected ? (
              <PayoutSplitConfigurator
                totalAmount={selected.amount}
                token={selected.token}
                onSubmit={handleSubmitDecision}
                submitting={submitting}
              />
            ) : (
              <p className="text-gray-500 text-sm">Select a dispute to configure payout.</p>
            )}

            <hr className="border-gray-800" />
            <ActivityLog entries={activity} />
          </aside>
        </main>

        {/* Toast notification */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </>
  );
}
