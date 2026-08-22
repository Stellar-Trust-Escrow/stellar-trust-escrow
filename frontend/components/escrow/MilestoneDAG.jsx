import React, { useMemo } from 'react';
import PropTypes from 'prop-types';

const NODE_W = 140;
const NODE_H = 44;
const H_GAP = 60;
const V_GAP = 70;

const STATUS_COLORS = {
  APPROVED: '#22c55e',
  PENDING: '#f59e0b',
  REJECTED: '#ef4444',
  DEFAULT: '#6b7280',
};

function buildLayers(milestones) {
  const ids = new Set(milestones.map(m => m.id));

  const inDegree = Object.fromEntries(milestones.map(m => [m.id, 0]));
  for (const m of milestones) {
    for (const dep of (m.dependsOn || [])) {
      if (ids.has(dep)) inDegree[m.id] = (inDegree[m.id] || 0) + 1;
    }
  }

  const layer = {};
  const queue = milestones.filter(m => inDegree[m.id] === 0).map(m => m.id);
  queue.forEach(id => { layer[id] = 0; });

  while (queue.length) {
    const cur = queue.shift();
    for (const next of milestones.filter(m => (m.dependsOn || []).includes(cur)).map(m => m.id)) {
      inDegree[next]--;
      layer[next] = Math.max(layer[next] ?? 0, (layer[cur] ?? 0) + 1);
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  const layers = [];
  for (const [id, l] of Object.entries(layer)) {
    if (!layers[l]) layers[l] = [];
    layers[l].push(id);
  }
  return { layers };
}

export default function MilestoneDAG({ milestones = [], statusMap = {}, onNodeClick }) {
  const { positions, edges, svgW, svgH } = useMemo(() => {
    if (!milestones.length) return { positions: {}, edges: [], svgW: 200, svgH: 100 };

    const { layers } = buildLayers(milestones);
    const positions = {};

    layers.forEach((col, colIdx) => {
      (col || []).forEach((id, rowIdx) => {
        positions[id] = {
          x: colIdx * (NODE_W + H_GAP) + 20,
          y: rowIdx * (NODE_H + V_GAP) + 20,
        };
      });
    });

    const edges = [];
    for (const m of milestones) {
      for (const dep of (m.dependsOn || [])) {
        if (positions[dep] && positions[m.id]) {
          const from = positions[dep];
          const to = positions[m.id];
          edges.push({
            key: `${dep}->${m.id}`,
            x1: from.x + NODE_W,
            y1: from.y + NODE_H / 2,
            x2: to.x,
            y2: to.y + NODE_H / 2,
          });
        }
      }
    }

    const vals = Object.values(positions);
    const maxX = vals.length ? Math.max(...vals.map(p => p.x)) + NODE_W + 40 : 200;
    const maxY = vals.length ? Math.max(...vals.map(p => p.y)) + NODE_H + 40 : 100;

    return { positions, edges, svgW: maxX, svgH: maxY };
  }, [milestones]);

  if (!milestones.length) {
    return <p style={{ color: '#9ca3af', textAlign: 'center' }}>No milestones to display.</p>;
  }

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
      <svg
        width={svgW}
        height={svgH}
        aria-label="Milestone dependency graph"
        style={{ fontFamily: 'inherit' }}
      >
        <defs>
          <marker id="dag-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
          </marker>
        </defs>

        {edges.map(e => (
          <line
            key={e.key}
            x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            stroke="#94a3b8" strokeWidth={1.5}
            markerEnd="url(#dag-arrow)"
          />
        ))}

        {milestones.map(m => {
          const pos = positions[m.id];
          if (!pos) return null;
          const status = statusMap[m.id] || 'DEFAULT';
          const color = STATUS_COLORS[status] ?? STATUS_COLORS.DEFAULT;

          return (
            <g
              key={m.id}
              transform={`translate(${pos.x},${pos.y})`}
              onClick={() => onNodeClick?.(m)}
              style={{ cursor: onNodeClick ? 'pointer' : 'default' }}
              role="button"
              aria-label={`${m.id} — ${status}`}
            >
              <rect width={NODE_W} height={NODE_H} rx={8} fill="#1e293b" stroke={color} strokeWidth={2} />
              <text
                x={NODE_W / 2} y={NODE_H / 2 - 5}
                textAnchor="middle" fill="#f1f5f9"
                fontSize={12} fontWeight="600" dominantBaseline="middle"
              >
                {m.id.length > 16 ? `${m.id.slice(0, 14)}…` : m.id}
              </text>
              <text x={NODE_W / 2} y={NODE_H / 2 + 10} textAnchor="middle" fill={color} fontSize={10}>
                {status}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

MilestoneDAG.propTypes = {
  milestones: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      dependsOn: PropTypes.arrayOf(PropTypes.string),
    })
  ),
  statusMap: PropTypes.objectOf(PropTypes.string),
  onNodeClick: PropTypes.func,
};
