import React from 'react';

const TIER_COLORS = {
  Diamond: { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  Platinum: { bg: '#f3e8ff', text: '#6b21a8', border: '#c084fc' },
  Gold: { bg: '#fef9c3', text: '#854d0e', border: '#fbbf24' },
  Silver: { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' },
  Bronze: { bg: '#fff7ed', text: '#9a3412', border: '#fb923c' },
};

export function ReputationBadge({ tier, badge, score, compact = false }) {
  const colors = TIER_COLORS[tier] || TIER_COLORS.Bronze;
  if (compact) {
    return (
      <span title={`${tier} — ${score} pts`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, backgroundColor: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
        {badge} {tier}
      </span>
    );
  }
  return (
    <div style={{ padding: '0.75rem 1rem', borderRadius: 10, backgroundColor: colors.bg, border: `1px solid ${colors.border}`, display: 'inline-block' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>{badge}</div>
      <div style={{ fontWeight: 700, color: colors.text }}>{tier}</div>
      <div style={{ fontSize: '0.8rem', color: colors.text, opacity: 0.8 }}>{score} points</div>
    </div>
  );
}

export default function ReputationCard({ reputation }) {
  if (!reputation) return null;
  const { tier, badge, score, breakdown, nextTier, walletAddress } = reputation;

  return (
    <div style={{ padding: '1rem', border: '1px solid var(--border,#e2e8f0)', borderRadius: 12, maxWidth: 360 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted,#64748b)' }}>{walletAddress?.slice(0, 10)}…</p>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, margin: '2px 0' }}>{score} pts</div>
        </div>
        <ReputationBadge tier={tier} badge={badge} score={score} compact />
      </div>
      {breakdown?.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>Score breakdown</p>
          {breakdown.map(item => (
            <div key={item.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--muted,#64748b)' }}>
              <span>{item.category}</span>
              <span style={{ color: item.contribution >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {item.contribution >= 0 ? '+' : ''}{item.contribution}
              </span>
            </div>
          ))}
        </div>
      )}
      {nextTier && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted,#64748b)' }}>
          {nextTier.pointsNeeded} pts until <strong>{nextTier.name}</strong>
        </p>
      )}
    </div>
  );
}
