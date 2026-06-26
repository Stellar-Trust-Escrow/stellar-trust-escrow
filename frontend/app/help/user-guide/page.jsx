import Link from 'next/link';

export default function HelpUserGuidePage() {
  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8 shadow-lg shadow-black/30">
        <h1 className="text-4xl font-bold text-white">Stellar Trust Escrow Guide</h1>
        <p className="mt-4 text-lg text-slate-300">
          This guide explains the escrow flow step by step for buyers and sellers, in plain language with no assumed blockchain knowledge.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">Connect a wallet</h2>
          <p className="mt-3 text-slate-300">
            Start by connecting a wallet so the app can ask your wallet to approve actions. This is the secure way to use the escrow without a password.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">Create an escrow</h2>
          <p className="mt-3 text-slate-300">
            Set the payment amount, the work to deliver, and the deadline. Clear terms help both buyer and seller avoid confusion.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">Fund the escrow</h2>
          <p className="mt-3 text-slate-300">
            The buyer deposits the funds into escrow. The seller cannot claim the money until it is released.
          </p>
        </article>

        <article className="rounded-3xl border border-gray-800 bg-slate-950 p-6">
          <h2 className="text-2xl font-semibold text-white">Request release</h2>
          <p className="mt-3 text-slate-300">
            The seller requests payment when the work is done. The buyer reviews before approving, so nothing is paid early.
          </p>
        </article>
      </section>

      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8">
        <h2 className="text-2xl font-semibold text-white">Disputes</h2>
        <p className="mt-3 text-slate-300">
          If buyer and seller disagree, the funds remain in escrow. An arbitrator reviews the dispute and decides how the money is handled.
        </p>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8">
        <h2 className="text-2xl font-semibold text-white">What signing means</h2>
        <p className="mt-3 text-slate-300">
          Signing a transaction means your wallet is confirming the action. You approve it in your wallet app, and the action happens only after you confirm.
        </p>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-slate-950 p-8">
        <h2 className="text-2xl font-semibold text-white">Read the full guide</h2>
        <p className="mt-3 text-slate-300">
          The complete guide is stored in the repository under <code>docs/user-guide/getting-started.md</code>.
        </p>
        <Link
          href="https://github.com/Devdave-0x/stellar-trust-escrow/blob/develop/docs/user-guide/getting-started.md"
          className="inline-flex items-center rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400"
          target="_blank"
          rel="noreferrer"
        >
          Open the full guide
        </Link>
      </div>
    </div>
  );
}
