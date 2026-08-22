import React, { useMemo } from 'react';

function MilestoneNode({ node, isReady, isCompleted, style }) {
  const bg = isCompleted ? '#22c55e' : isReady ? '#3b82f6' : 'var(--surface,#f8fafc)';
  const color = isCompleted || isReady ? '#fff' : 'inherit';
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border,#e2e8f0)', backgroundColor: bg, color, fontSize: '0.875rem', ...style }}>
      <div style={{ fontWeight: 600 }}>{node.title || node.id}</div>
      {node.dependsOn?.length > 0 && <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>depends on: {node.dependsOn.join(', ')}</div>}
    </div>
  );
}

export default function MilestoneDagViewer({ milestones = [], completedIds = [] }) {
  const { order, ready, error } = useMemo(() => {
    try {
      const completedSet = new Set(completedIds);
      const nodes = new Map(milestones.map(m => [m.id, { ...m, dependsOn: m.dependsOn || [] }]));
      const visited = new Set();
      const result = [];
      const visit = (id) => {
        if (visited.has(id)) return;
        visited.add(id);
        nodes.get(id)?.dependsOn.forEach(visit);
        result.push(id);
      };
      nodes.forEach((_, id) => visit(id));
      const ready = result.filter(id => !completedSet.has(id) && nodes.get(id)?.dependsOn.every(d => completedSet.has(d)));
      return { order: result, ready: new Set(ready), error: null };
    } catch (e) { return { order: [], ready: new Set(), error: e.message }; }
  }, [milestones, completedIds]);

  if (error) return <div style={{ color: '#ef4444', padding: '0.75rem' }}>DAG error: {error}</div>;
  const completedSet = new Set(completedIds);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
      <h4 style={{ margin: '0 0 0.5rem' }}>Milestone Execution Order</h4>
      {order.map((id, i) => {
        const node = milestones.find(m => m.id === id);
        if (!node) return null;
        return (
          <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted,#64748b)', minWidth: 20 }}>{i + 1}</span>
            <MilestoneNode node={node} isReady={ready.has(id)} isCompleted={completedSet.has(id)} style={{ flex: 1 }} />
          </div>
        );
      })}
      <p style={{ fontSize: '0.75rem', color: 'var(--muted,#64748b)', margin: '0.5rem 0 0' }}>
        Blue = ready to start · Green = completed · Grey = waiting on dependencies
      </p>
    </div>
  );
}
