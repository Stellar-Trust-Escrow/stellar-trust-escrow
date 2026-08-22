import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = { completed: '#22c55e', disputed: '#ef4444', neutral: '#6366f1', secondary: '#8b5cf6' };

function KpiTile({ label, value, unit }) {
  return (
    <div style={{
      padding: '1rem 1.25rem',
      border: '1px solid var(--border, #e2e8f0)',
      borderRadius: 8,
      minWidth: 150,
      flex: '1 1 140px',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
        {unit && <span style={{ fontSize: '0.8rem', fontWeight: 400, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function AnalyticsDashboard() {
  const [summary, setSummary] = useState(null);
  const [cohort, setCohort] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/admin/analytics/summary').then(r => r.json()),
      fetch('/api/v1/admin/analytics/cohort').then(r => r.json()),
    ])
      .then(([s, c]) => {
        setSummary(s);
        const cohortData = Array.isArray(c.weeks)
          ? c.weeks.map((w, i) => ({ week: `W${w}`, retention: (c.retention?.[i] ?? 0).toFixed(1) }))
          : (Array.isArray(c) ? c : []);
        setCohort(cohortData);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const downloadCSV = async (dataset) => {
    const res = await fetch(`/api/v1/admin/analytics/export/${dataset}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading analytics…</div>;
  if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>Error: {error}</div>;

  const dailyData = (summary?.dailyBreakdown ?? []).map(d => ({ ...d, count: Number(d.count) }));

  const pieData = [
    { name: 'Completed', value: Math.max(0, (summary?.totalEscrows ?? 0) * (1 - (summary?.disputeRate ?? 0))) },
    { name: 'Disputed', value: Math.max(0, (summary?.totalEscrows ?? 0) * (summary?.disputeRate ?? 0)) },
  ];

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 700 }}>Analytics Dashboard</h2>

      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <KpiTile label="Total Escrows (30d)" value={summary?.totalEscrows ?? 0} />
        <KpiTile label="XLM Volume" value={summary?.totalXLMVolume ?? '0'} unit="XLM" />
        <KpiTile label="Dispute Rate" value={((summary?.disputeRate ?? 0) * 100).toFixed(1)} unit="%" />
        <KpiTile label="Avg Resolution" value={summary?.avgResolutionHours ?? 0} unit="hrs" />
      </div>

      {/* Daily volume line chart */}
      <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Daily Escrow Volume (30d)</h3>
          <button onClick={() => downloadCSV('summary')} style={{ fontSize: '0.75rem', padding: '4px 12px', cursor: 'pointer', borderRadius: 4 }}>
            Export CSV
          </button>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke={COLORS.neutral} strokeWidth={2} dot={false} name="Escrows" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort bar chart */}
      <div style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Weekly Cohort Retention</h3>
          <button onClick={() => downloadCSV('cohort')} style={{ fontSize: '0.75rem', padding: '4px 12px', cursor: 'pointer', borderRadius: 4 }}>
            Export CSV
          </button>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={cohort} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="retention" fill={COLORS.secondary} name="Retention %" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Outcomes pie chart */}
      <div style={{ padding: '1rem', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Escrow Outcomes</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={i === 0 ? COLORS.completed : COLORS.disputed} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => v.toFixed(0)} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: i === 0 ? COLORS.completed : COLORS.disputed, display: 'inline-block', flexShrink: 0 }} />
                <span>{d.name}: {d.value.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
