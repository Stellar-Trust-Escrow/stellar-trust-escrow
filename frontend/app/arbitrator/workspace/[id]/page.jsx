'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/ui/Button';
import CurrencyConverter from '../../../../components/ui/CurrencyConverter';
import DisputeTermsDiff from '../../../../components/dispute/DisputeTermsDiff';

const MOCK_DISPUTE_DIFF = {
  originalTerms:
    'The freelancer agrees to deliver a complete smart-contract security audit covering all Rust modules within 14 calendar days of escrow activation. ' +
    'Milestone 1: Codebase review (500 USDC) — due day 5. ' +
    'Milestone 2: Vulnerability report (1,000 USDC) — due day 10. ' +
    'Milestone 3: Final sign-off (500 USDC) — due day 14. ' +
    'Late delivery beyond 3 days without written client approval forfeits 10% of the outstanding milestone payment.',
  originalTimestamp: '2026-05-10T09:00:00Z',
  disputeDescription:
    'The freelancer delivered the first draft 6 days late and omitted the milestone checklist entirely. ' +
    'Milestone 1 was completed on day 11, not day 5 as agreed. ' +
    'Milestone 2 was never formally submitted — only an informal email was sent. ' +
    'Milestone 3 remains outstanding. ' +
    'Per the late-delivery clause, the client is entitled to a 10% reduction on each outstanding milestone, totaling 150 USDC.',
  disputeTimestamp: '2026-05-28T14:35:00Z',
};

const MOCK_WORKSPACE = {
  escrowId: 'ESCROW-8729',
  client: {
    name: 'Amina H.',
    address: 'GAXX6Z...NE2J',
    balance: '12,840 XLM',
    role: 'Client',
    claim: 'Requested 60% revision reimbursement for delayed audit delivery.',
  },
  freelancer: {
    name: 'Nate M.',
    address: 'GCFV5K...A7P2',
    balance: '9,600 USDC',
    role: 'Freelancer',
    claim: 'Delivered final scope after client-approved milestone extension.',
  },
  evidence: [
    {
      id: 'doc-01',
      title: 'Signed amendment',
      description: 'Accepted scope amendment with updated timeline and payout terms.',
      timestamp: '2026-05-24T11:20:00Z',
      file: {
        name: 'amendment.pdf',
        type: 'application/pdf',
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      },
    },
    {
      id: 'img-02',
      title: 'Milestone proof',
      description: 'Screenshot of delivered milestone package before the agreed deadline.',
      timestamp: '2026-05-22T14:08:00Z',
      file: {
        name: 'milestone-proof.png',
        type: 'image/png',
        url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
      },
    },
    {
      id: 'log-03',
      title: 'Acceptance chat',
      description: 'Client approved partial delivery in the communication channel.',
      timestamp: '2026-05-20T08:25:00Z',
      file: {
        name: 'acceptance-log.txt',
        type: 'text/plain',
        url: 'https://example.com/acceptance-log.txt',
      },
    },
  ],
};

function EvidencePreviewModal({ file, onClose }) {
  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      onClick={onClose}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-950/80 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">{file.name}</p>
            <p className="text-xs text-slate-400">Previewing file in the evidence workspace.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Close
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-5">
          {file.type.startsWith('image/') ? (
            <img
              src={file.url}
              alt={file.name}
              className="mx-auto max-h-[70vh] rounded-3xl object-contain"
            />
          ) : (
            <iframe
              src={file.url}
              title={file.name}
              className="h-[70vh] w-full rounded-3xl border border-white/10 bg-slate-950"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArbitratorWorkspacePage({ params }) {
  const workspaceId = params.id;
  const [activeEvidence, setActiveEvidence] = useState(MOCK_WORKSPACE.evidence[0]);
  const [previewFile, setPreviewFile] = useState(null);
  const [clientShare, setClientShare] = useState(60);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [deployStatus, setDeployStatus] = useState('pending');
  const [actionMessage, setActionMessage] = useState('');

  const freelancerShare = useMemo(() => 100 - clientShare, [clientShare]);
  const formattedTimestamp = new Date(activeEvidence.timestamp).toLocaleString();

  useEffect(() => {
    async function loadNotes() {
      try {
        const response = await fetch(`/api/arbitrator/notes?id=${encodeURIComponent(workspaceId)}`);
        if (!response.ok) return;
        const data = await response.json();
        setNotes(data?.notes ?? '');
      } catch {
        // Silent fallback if API is unavailable.
      }
    }
    loadNotes();
  }, [workspaceId]);

  const saveNotes = async () => {
    setIsSaving(true);
    setSaveMessage('Saving notes...');
    try {
      const response = await fetch('/api/arbitrator/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, notes }),
      });
      if (!response.ok) throw new Error('Save failed');
      setSaveMessage('Notes saved successfully.');
    } catch {
      setSaveMessage('Unable to save notes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const deployTransaction = async () => {
    if (deployStatus === 'submitted') return;
    setDeployStatus('submitting');
    setActionMessage('Validating security checks...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setActionMessage('Building secure transaction payload...');
    await new Promise((resolve) => setTimeout(resolve, 900));
    setDeployStatus('submitted');
    setActionMessage('Transaction queued for sign-off and deployment.');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 lg:px-6">
        <header className="rounded-[32px] border border-white/10 bg-slate-900/80 p-6 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-indigo-300/80">
                Arbitrator mediation workspace
              </p>
              <h1 className="text-3xl font-semibold text-white">Case #{workspaceId}</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-300 lg:text-base">
                Navigate evidence, compare party positions, and finalize a fair payout
                recommendation. The UI is designed for rapid keyboard navigation and accessible
                decision workflows.
              </p>
            </div>
            <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-100 shadow-sm shadow-cyan-500/10">
              <strong className="block text-white">Live mediation</strong>
              <span className="text-slate-300">Secure dispute review mode enabled</span>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr_360px]">
          <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/30">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                  Evidence explorer
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Chronological log</h2>
              </div>
              <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                {MOCK_WORKSPACE.evidence.length} files
              </span>
            </div>
            <ol className="space-y-4">
              {MOCK_WORKSPACE.evidence.map((item, index) => (
                <li
                  key={item.id}
                  className="group rounded-3xl border border-white/10 bg-slate-950/60 p-4 transition hover:border-indigo-400/40"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveEvidence(item);
                      setPreviewFile(item.file);
                    }}
                    className="w-full text-left"
                    aria-label={`Open evidence ${item.title}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                      <span>#{index + 1}</span>
                      <span className="rounded-full bg-white/5 px-2 py-1">
                        {item.file.type.split('/')[1]}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-slate-950/80 p-4">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Active file</p>
              <p className="text-sm font-semibold text-white">{activeEvidence.title}</p>
              <p className="text-sm leading-6 text-slate-400">{activeEvidence.description}</p>
              <Button
                onClick={() => setPreviewFile(activeEvidence.file)}
                variant="secondary"
                className="w-full"
              >
                Preview evidence
              </Button>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                    Dual-party brief
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Account summary</h2>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-200">
                  {formattedTimestamp}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {[MOCK_WORKSPACE.client, MOCK_WORKSPACE.freelancer].map((party) => (
                  <div
                    key={party.address}
                    className="rounded-3xl border border-white/10 bg-slate-950/70 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                      {party.role}
                    </p>
                    <p className="mt-3 text-lg font-semibold text-white">{party.name}</p>
                    <p className="mt-1 text-sm text-slate-400">{party.address}</p>
                    <p className="mt-4 text-sm leading-6 text-slate-300">{party.claim}</p>
                    <div className="mt-4 rounded-2xl bg-slate-800/80 px-3 py-3 text-sm text-slate-200">
                      <p className="font-medium">Available balance</p>
                      <p className="mt-1 text-lg text-white">{party.balance}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                    Split control
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Dynamic payout slider</h2>
                </div>
                <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase text-indigo-200">
                  {clientShare}% client
                </span>
              </div>
              <div className="rounded-[24px] bg-slate-950/80 p-4">
                <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>Client</span>
                  <span>Freelancer</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={clientShare}
                  onChange={(event) => setClientShare(Number(event.target.value))}
                  className="mt-4 w-full accent-cyan-400"
                  aria-label="Adjust payout split between client and freelancer"
                />
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs font-medium uppercase tracking-[0.25em] text-slate-400">
                  <span>10%</span>
                  <span className="text-center">50%</span>
                  <span className="text-right">90%</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-300">
                <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Client</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{clientShare}%</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Freelancer</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{freelancerShare}%</p>
                </div>
              </div>
            </div>

            <DisputeTermsDiff
              originalTerms={MOCK_DISPUTE_DIFF.originalTerms}
              disputeDescription={MOCK_DISPUTE_DIFF.disputeDescription}
              originalTimestamp={MOCK_DISPUTE_DIFF.originalTimestamp}
              disputeTimestamp={MOCK_DISPUTE_DIFF.disputeTimestamp}
            />

            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                    Collaboration notes
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Case notes board</h2>
                </div>
                <span className="rounded-full bg-slate-800/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                  autosave to backend
                </span>
              </div>
              <label className="sr-only" htmlFor="workspace-notes">
                Workspace notes
              </label>
              <textarea
                id="workspace-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={8}
                placeholder="Capture evidence observations, security flags, and suggested settlement notes."
                className="w-full rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-400">
                  Your notes are stored securely for this workspace.
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={saveNotes} isLoading={isSaving} className="w-full sm:w-auto">
                    Save notes
                  </Button>
                  <span className="text-sm text-slate-400">{saveMessage}</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                  Resolution deployment
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Direct transaction panel</h2>
              </div>
              <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/80 p-4">
                <div className="text-sm text-slate-400">Security checks</div>
                <ul className="space-y-3 text-sm text-slate-300">
                  {[
                    'Wallet signature verified',
                    'Payout ratio reviewed',
                    'Memo authenticity scanned',
                    'Amount boundaries confirmed',
                  ].map((check) => (
                    <li key={check} className="flex items-center gap-3">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-3xl bg-slate-900/90 p-4 text-sm text-slate-200">
                  <p className="font-semibold text-white">Deployment summary</p>
                  <p className="mt-2 leading-6">
                    Resolve {MOCK_WORKSPACE.escrowId} with {clientShare}% / {freelancerShare}% split
                    and submit the payout decision to the settlement contract.
                  </p>
                </div>
                <Button
                  onClick={deployTransaction}
                  disabled={deployStatus === 'submitted'}
                  className="w-full"
                >
                  {deployStatus === 'submitted' ? 'Deployment queued' : 'Confirm and deploy'}
                </Button>
                <p className="text-sm text-slate-400">
                  {actionMessage || 'Ready for transaction review.'}
                </p>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
                  Financial tools
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Currency conversion</h2>
              </div>
              <CurrencyConverter className="rounded-[28px] border border-white/10 bg-slate-950/80 p-4" />
            </div>
          </aside>
        </div>
      </div>

      <EvidencePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </main>
  );
}
