import Link from 'next/link';

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8 shadow-lg shadow-black/30">
        <h1 className="text-4xl font-bold text-white">Help for Buyers and Sellers</h1>
        <p className="mt-4 text-lg text-slate-300">
          This page explains the steps for using escrow safely: connect your wallet, set clear terms, fund the escrow, request release, and what happens if a dispute starts.
        </p>
        <p className="mt-4 text-slate-400">
          For the full user guide, see <code>docs/user-guide/getting-started.md</code> in the repository.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">1. Connect your wallet</h2>
          <p className="mt-3 text-slate-300">
            Click “Connect Wallet” and approve the request in your wallet app. This lets the site ask your wallet to confirm actions without needing a password.
          </p>
          <p className="mt-3 text-slate-400">
            If your wallet is not installed or unlocked, the connect step will not complete.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">2. Create an escrow</h2>
          <p className="mt-3 text-slate-300">
            Enter the payment amount, describe what work will be delivered, and choose a deadline. Clear terms help both sides avoid confusion.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">3. Fund the escrow</h2>
          <p className="mt-3 text-slate-300">
            The buyer places the agreed funds into escrow. The money is held securely while the seller completes the work.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">4. Release or dispute</h2>
          <p className="mt-3 text-slate-300">
            When the seller finishes, the buyer can approve release. If there is a disagreement, the buyer can start a dispute and the funds stay in escrow until resolved.
          </p>
        </article>
      </section>

      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8">
        <h2 className="text-2xl font-semibold text-white">Sign a transaction</h2>
        <p className="mt-3 text-slate-300">
          Signing a transaction simply means your wallet is confirming the action. Your wallet shows the request, and you approve it with a click, fingerprint, or password inside the wallet.
        </p>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8">
        <h2 className="text-2xl font-semibold text-white">Open the full guide</h2>
        <p className="mt-3 text-slate-300">
          Learn the complete escrow flow with annotated screenshots and plain language instructions.
        </p>
        <Link href="/help/user-guide" className="inline-flex items-center rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400">
          Full user guide
        </Link>
      </div>
    </div>
  );
}
