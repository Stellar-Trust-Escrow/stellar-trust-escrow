'use client';

import { useMemo, useState } from 'react';
import Button from '../../../../../components/ui/Button';

const CLIENT_CASE = {
  name: 'Client submission',
  role: 'Client',
  summary:
    'The freelancer delivered the first draft late and skipped the milestone checklist. We have screenshots, the timeline log, and a signed scope amendment that caps the final payment at 40%.',
  highlights: [
    'Missed two milestone checkpoints after the agreed review window.',
    'Required rework on the final audit package and delayed release.',
    'Evidence includes timestamped screenshots and delivery notes.',
  ],
  evidence: [
    {
      name: 'Client-briefing-notes.pdf',
      type: 'application/pdf',
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      note: 'Scope amendment and milestone review notes.',
    },
    {
      name: 'Delivery-timeline.png',
      type: 'image/png',
      url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
      note: 'Screenshot of the delivery timeline showing missed checkpoints.',
    },
  ],
};

const FREELANCER_CASE = {
  name: 'Freelancer submission',
  role: 'Freelancer',
  summary:
    'All work was submitted on time, but the client changed the acceptance criteria after the final review. We are requesting the remaining payout because the deliverables were completed and approved.',
  highlights: [
    'Final audit package was accepted in the approval channel.',
    'Client requested additional scope after the agreed deadline.',
    'Evidence includes commit references and milestone sign-off.',
  ],
  evidence: [
    {
      name: 'Approval-log.pdf',
      type: 'application/pdf',
      url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      note: 'Signed approval log and milestone confirmation.',
    },
    {
      name: 'Commit-history.png',
      type: 'image/png',
      url: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=900&q=80',
      note: 'Commit history confirming the final submission date.',
    },
  ],
};

function PreviewModal({ file, onClose }) {
  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-3xl border border-white/10 bg-gray-950/95 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-sm text-gray-200">
          <div>
            <p className="font-semibold text-white">{file.name}</p>
            <p className="text-xs text-gray-400">{file.note}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-gray-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Close preview"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-auto p-4">
          {file.type.startsWith('image/') ? (
            <img
              src={file.url}
              alt={file.name}
              className="mx-auto max-h-[70vh] rounded-2xl object-contain"
            />
          ) : (
            <iframe
              src={file.url}
              title={file.name}
              className="mx-auto min-h-[70vh] w-full rounded-2xl border border-white/10 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ArbitrationSplitPage() {
  const [clientShare, setClientShare] = useState(55);
  const [vote, setVote] = useState('split');
  const [previewFile, setPreviewFile] = useState(null);

  const freelancerShare = useMemo(() => 100 - clientShare, [clientShare]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_transparent_25%),linear-gradient(135deg,#020617_0%,#111827_50%,#020617_100%)] text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 lg:px-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-indigo-200">
                Arbitration workspace
              </p>
              <h1 className="text-3xl font-semibold text-white">Advanced immersive case panel</h1>
              <p className="max-w-3xl text-sm text-gray-300 lg:text-base">
                Compare client and freelancer case materials side-by-side, review evidence in-place,
                and resolve payout split decisions from a pinned center control rail.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Live case status: Open for arbitration
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1fr_340px_1fr]">
          <article className="card rounded-3xl border border-white/10 bg-white/6 p-0 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-t-3xl border-b border-white/10 bg-gradient-to-r from-indigo-500/12 via-transparent to-transparent p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-indigo-200">Left panel</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Client arguments</h2>
              <p className="mt-1 text-sm text-gray-300">
                Review the client’s claims, evidence files, and supporting notes.
              </p>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-gray-300">{CLIENT_CASE.summary}</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-200">
                {CLIENT_CASE.highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-rose-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Evidence files</p>
                <div className="mt-3 space-y-3">
                  {CLIENT_CASE.evidence.map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-indigo-400/50 hover:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label={`Preview ${file.name}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{file.name}</p>
                          <p className="text-xs text-gray-400">{file.note}</p>
                        </div>
                        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.25em] text-indigo-200">
                          Preview
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <aside className="card rounded-3xl border border-white/10 bg-white/8 p-0 shadow-2xl shadow-black/30 backdrop-blur-xl xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-t-3xl border-b border-white/10 bg-gradient-to-r from-emerald-500/15 via-transparent to-indigo-500/15 p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-100">Center rail</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Resolution controls</h2>
              <p className="mt-1 text-sm text-gray-300">
                Set the payout split and confirm the preferred resolution path.
              </p>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
                      Payout split
                    </p>
                    <p className="mt-1 text-sm text-gray-200">Client share: {clientShare}%</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                    {freelancerShare}% freelancer
                  </span>
                </div>
                <input
                  aria-label="Adjust client payout percentage"
                  type="range"
                  min="10"
                  max="90"
                  step="1"
                  value={clientShare}
                  onChange={(event) => setClientShare(Number(event.target.value))}
                  className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-400"
                />
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>10%</span>
                  <span>50%</span>
                  <span>90%</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Voting panel</p>
                <div className="mt-3 space-y-2">
                  {[
                    {
                      id: 'client',
                      label: 'Client-favored split',
                      note: 'Award the client the current share.',
                    },
                    {
                      id: 'split',
                      label: 'Balanced split',
                      note: 'Use the slider above as the final allocation.',
                    },
                    {
                      id: 'freelancer',
                      label: 'Freelancer-favored split',
                      note: 'Prioritize the freelancer payout path.',
                    },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setVote(option.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        vote === option.id
                          ? 'border-indigo-400/60 bg-indigo-500/10'
                          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      }`}
                      aria-pressed={vote === option.id}
                    >
                      <p className="text-sm font-semibold text-white">{option.label}</p>
                      <p className="text-xs text-gray-300">{option.note}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-200">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">
                  Decision summary
                </p>
                <p className="mt-2">
                  Current recommendation:{' '}
                  <strong>
                    {vote === 'split'
                      ? 'balanced split'
                      : vote === 'client'
                        ? 'client-favored'
                        : 'freelancer-favored'}
                  </strong>
                  .
                </p>
                <p className="mt-1 text-gray-300">
                  Client payout: <strong>{clientShare}%</strong>. Freelancer payout:{' '}
                  <strong>{freelancerShare}%</strong>.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm">
                  Save draft
                </Button>
                <Button variant="secondary" size="sm">
                  Share notes
                </Button>
                <Button variant="danger" size="sm">
                  Escalate
                </Button>
              </div>
            </div>
          </aside>

          <article className="card rounded-3xl border border-white/10 bg-white/6 p-0 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="rounded-t-3xl border-b border-white/10 bg-gradient-to-r from-emerald-500/12 via-transparent to-transparent p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-100">Right panel</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Freelancer arguments</h2>
              <p className="mt-1 text-sm text-gray-300">
                Review the freelancer’s counter-claim and supporting evidence.
              </p>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-gray-300">{FREELANCER_CASE.summary}</p>
              </div>
              <ul className="space-y-2 text-sm text-gray-200">
                {FREELANCER_CASE.highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2"
                  >
                    <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-gray-400">Evidence files</p>
                <div className="mt-3 space-y-3">
                  {FREELANCER_CASE.evidence.map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-400/50 hover:bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label={`Preview ${file.name}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{file.name}</p>
                          <p className="text-xs text-gray-400">{file.note}</p>
                        </div>
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.25em] text-emerald-100">
                          Preview
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>

      <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </main>
  );
}
