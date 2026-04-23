import ReputationBadge from '../../../components/ui/ReputationBadge';
import Badge from '../../../components/ui/Badge';
import TruncatedAddress from '../../../components/ui/TruncatedAddress';
import Button from '../../../components/ui/Button';

const PLACEHOLDER_USER = {
  reputationScore: 87,
  badge: 'TRUSTED',
  completedEscrows: 12,
  disputedEscrows: 1,
  totalVolume: '18,450 USDC',
  memberSince: 'January 2025',
  completionRate: 92,
};

async function getProfile(address) {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${base}/api/users/${address}`, { next: { revalidate: 10 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ProfilePage({ params }) {
  const { address } = params;
  const dbUser = (await getProfile(address)) || {};
  const user = { ...PLACEHOLDER_USER, ...dbUser };

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="card flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xl flex-shrink-0">
          {address.slice(1, 3)}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white font-mono">
              <TruncatedAddress address={address} />
            </h1>
            <Badge status={user.badge} />
          </div>

          {user.bio && <p className="text-gray-300 mt-2">{user.bio}</p>}
          <p className="text-gray-500 text-sm mt-1">Member since {user.memberSince}</p>

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
          <div className="mt-3">
            <Button variant="secondary" size="sm">Share Profile</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
