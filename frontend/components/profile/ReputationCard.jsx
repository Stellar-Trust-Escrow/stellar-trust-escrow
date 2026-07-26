import ReputationBadge from '../ui/ReputationBadge';
import { calculateTrustScore, calculateWinRate } from '../../lib/stellar';

export default function ReputationCard({ reputation, isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <section className="card" aria-labelledby="reputation-heading" aria-busy="true">
        <h2 id="reputation-heading" className="text-xl font-semibold text-white">
          Reputation
        </h2>
        <p className="text-gray-400 mt-3">Loading reputation…</p>
      </section>
    );
  }

  if (error || !reputation) {
    return (
      <section className="card" aria-labelledby="reputation-heading">
        <h2 id="reputation-heading" className="text-xl font-semibold text-white">
          Reputation
        </h2>
        <p className="text-amber-300 mt-3" role="status">
          {error || 'Reputation data is currently unavailable.'}
        </p>
      </section>
    );
  }

  const completedEscrows = reputation.completedEscrows ?? 0;
  const disputedEscrows = reputation.disputedEscrows ?? 0;
  const disputesWon = reputation.disputesWon ?? 0;
  const trustScore = calculateTrustScore(completedEscrows, disputedEscrows, disputesWon);
  const winRate = calculateWinRate(disputedEscrows, disputesWon);
  const hasHistory = completedEscrows > 0 || disputedEscrows > 0;

  return (
    <section className="card" aria-labelledby="reputation-heading">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
        <div>
          <h2 id="reputation-heading" className="text-xl font-semibold text-white">
            Reputation
          </h2>
          {!hasHistory && <p className="text-gray-400 mt-3">No history yet</p>}
        </div>
        <div className="text-center">
          <ReputationBadge score={reputation.totalScore ?? 0} size="lg" />
          <p className="text-xs text-gray-500 mt-1">On-chain score</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Completed</dt>
          <dd className="text-2xl font-bold text-white mt-1">{completedEscrows}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Disputed</dt>
          <dd className="text-2xl font-bold text-white mt-1">{disputedEscrows}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Win rate</dt>
          <dd className="text-2xl font-bold text-white mt-1">{winRate.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Trust score</dt>
          <dd
            className="text-2xl font-bold text-white mt-1"
            aria-describedby="trust-score-formula"
          >
            {trustScore}
          </dd>
        </div>
      </dl>

      <p id="trust-score-formula" className="text-xs text-gray-500 mt-4">
        Trust score = completed escrows − (lost disputes × 2).
      </p>
    </section>
  );
}
