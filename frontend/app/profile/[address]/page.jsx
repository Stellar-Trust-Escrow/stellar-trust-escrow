/**
 * User Profile Page — /profile/[address]
 *
 * Displays a user's on-chain reputation, completed escrow history,
 * and statistics. Public page — anyone can view any address.
 *
 * TODO (contributor — medium, Issue #35):
 * - Fetch: GET /api/users/:address
 * - Fetch: GET /api/reputation/:address
 * - Fetch: GET /api/users/:address/escrows?page=1&limit=10
 * - Show completed escrows timeline
 * - Show disputed escrows (separate section)
 * - Add share button (copy profile URL)
 */

import ReputationBadge from '../../../components/ui/ReputationBadge';
import Badge from '../../../components/ui/Badge';
import TruncatedAddress from '../../../components/ui/TruncatedAddress';

// TODO (contributor): replace with SWR fetch
const PLACEHOLDER_USER = {
  address: 'GABCD1234EFGH5678IJKL9012MNOP3456QRST7890UVWX1234YZ56',
  reputationScore: 87,
  badge: 'TRUSTED',
  completedEscrows: 12,
  disputedEscrows: 1,
  totalVolume: '18,450 USDC',
  memberSince: 'January 2025',
  completionRate: 92,
};

export default function ProfilePage({ params }) {
  const { address } = params;
  const user = PLACEHOLDER_USER;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Profile Header */}
      <div className="card flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-indigo-400 font-bold text-xl flex-shrink-0">
          {address.slice(1, 3)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white">
              <TruncatedAddress address={address} />
            </h1>
            <Badge status={user.badge} />
          </div>
          <p className="text-gray-500 text-sm mt-1">Member since {user.memberSince}</p>

          {/* Stats Row */}
          <div className="flex gap-6 mt-4 text-sm">
            <div>
              <p className="text-gray-500">Completed</p>
              <p className="text-white font-semibold">{user.completedEscrows}</p>
            </div>
            <div>
              <p className="text-gray-500">Disputed</p>
              <p className="text-white font-semibold">{user.disputedEscrows}</p>
            </div>
            <div>
              <p className="text-gray-500">Volume</p>
              <p className="text-white font-semibold">{user.totalVolume}</p>
            </div>
            <div>
              <p className="text-gray-500">Completion Rate</p>
              <p className="text-white font-semibold">{user.completionRate}%</p>
            </div>
          </div>
        </div>

        <div className="text-center">
          <ReputationBadge score={user.reputationScore} size="lg" />
          <p className="text-xs text-gray-500 mt-1">Reputation Score</p>
        </div>
      </div>

      {/* Reputation Breakdown */}
      {/*
        TODO (contributor — Issue #35):
        Add a visual breakdown showing:
        - Points from completed escrows
        - Points deducted from disputes
        - Volume bonuses
        This helps users understand their score.
      */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Reputation Breakdown</h2>
        <div className="card text-sm text-gray-400 text-center py-8">
          🚧 Reputation breakdown chart — see Issue #35
        </div>
      </section>

      {/* Completed Escrows */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Completed Escrows</h2>
        {/*
          TODO (contributor — Issue #35):
          Fetch and render GET /api/users/:address/escrows?status=Completed
        */}
        <div className="card text-sm text-gray-400 text-center py-8">
          🚧 Escrow history — see Issue #35
        </div>
      </section>
    </div>
  );
}
