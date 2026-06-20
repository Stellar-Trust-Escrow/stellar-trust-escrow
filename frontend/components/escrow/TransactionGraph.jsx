'use client';

/**
 * TransactionGraph
 *
 * Animated, node-based visualisation of escrow fund flows.
 * Renders four nodes: Buyer Wallet → Escrow Contract → Platform Treasury / Freelancer Wallet.
 * Glowing SVG path lines animate a particle along the active transfer direction.
 * Clicking a node opens a detail popover (address + TX hash).
 * Falls back to a descriptive <table> for screen-reader / reduced-motion users.
 *
 * Props:
 *   escrow  — escrow object with { id, clientAddress, freelancerAddress,
 *              totalAmount, platformFee, status, transactionHash }
 */

import { useEffect, useRef, useState, useReducer, useCallback } from 'react';

// ── Layout constants ──────────────────────────────────────────────────────────

const W = 640;
const H = 320;

const NODES = {
  buyer: { id: 'buyer', label: 'Buyer Wallet', x: 80, y: 160, color: '#6366f1' },
  escrow: { id: 'escrow', label: 'Escrow Contract', x: 320, y: 160, color: '#8b5cf6' },
  treasury: { id: 'treasury', label: 'Platform Treasury', x: 560, y: 80, color: '#f59e0b' },
  freelancer: { id: 'freelancer', label: 'Freelancer Wallet', x: 560, y: 240, color: '#10b981' },
};

/** Edges active per escrow status */
const STATUS_EDGES = {
  Active: [{ from: 'buyer', to: 'escrow', label: 'Deposit' }],
  Completed: [
    { from: 'escrow', to: 'freelancer', label: 'Payout' },
    { from: 'escrow', to: 'treasury', label: 'Fee' },
  ],
  Disputed: [{ from: 'buyer', to: 'escrow', label: 'Locked' }],
  Cancelled: [{ from: 'escrow', to: 'buyer', label: 'Refund' }],
};

// ── Particle animation ────────────────────────────────────────────────────────

function useParticle(active) {
  const [t, setT] = useState(0);
  const raf = useRef(null);
  const start = useRef(null);
  const DURATION = 1800; // ms per cycle

  useEffect(() => {
    if (!active) {
      setT(0);
      return;
    }
    const animate = (now) => {
      if (!start.current) start.current = now;
      const elapsed = (now - start.current) % DURATION;
      setT(elapsed / DURATION);
      raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf.current);
      start.current = null;
    };
  }, [active]);

  return t;
}

// ── Edge component ────────────────────────────────────────────────────────────

function Edge({ from, to, label, color = '#6366f1', animate: doAnimate }) {
  const t = useParticle(doAnimate);
  const fx = NODES[from].x,
    fy = NODES[from].y;
  const tx = NODES[to].x,
    ty = NODES[to].y;

  // Cubic bezier control points for a gentle arc
  const cx = (fx + tx) / 2;
  const cy = (fy + ty) / 2 - 40;
  const d = `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;

  // Particle position along the bezier at parameter t
  const bx = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * cx + t * t * tx;
  const by = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * cy + t * t * ty;

  return (
    <g>
      {/* Glow layer */}
      <path d={d} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.15} />
      {/* Main line */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.7}
        strokeDasharray="6 4"
      />
      {/* Edge label */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={10} fill={color} opacity={0.9}>
        {label}
      </text>
      {/* Animated particle */}
      {doAnimate && (
        <circle cx={bx} cy={by} r={5} fill={color} opacity={0.95}>
          <animate attributeName="r" values="4;6;4" dur="0.6s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// ── Node component ────────────────────────────────────────────────────────────

function Node({ node, detail, onClick, active }) {
  const { x, y, label, color } = node;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${label} — click for details`}
      style={{ cursor: 'pointer' }}
      onClick={() => onClick(node.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick(node.id)}
    >
      {/* Outer glow ring */}
      {active && (
        <circle cx={x} cy={y} r={28} fill="none" stroke={color} strokeWidth={2} opacity={0.3}>
          <animate attributeName="r" values="26;32;26" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      {/* Node circle */}
      <circle
        cx={x}
        cy={y}
        r={22}
        fill={`${color}22`}
        stroke={color}
        strokeWidth={active ? 2 : 1.5}
        opacity={active ? 1 : 0.6}
      />
      {/* Label */}
      <text x={x} y={y + 36} textAnchor="middle" fontSize={10} fill="#d1d5db">
        {label}
      </text>
      {/* Icon placeholder — first letter */}
      <text x={x} y={y + 5} textAnchor="middle" fontSize={13} fontWeight="bold" fill={color}>
        {label[0]}
      </text>
    </g>
  );
}

// ── Detail popover ────────────────────────────────────────────────────────────

function NodeDetail({ nodeId, escrow, onClose }) {
  const details = {
    buyer: { address: escrow?.clientAddress, tx: escrow?.transactionHash },
    escrow: { address: escrow?.contractAddress, tx: escrow?.transactionHash },
    treasury: { address: 'Platform Treasury', tx: null },
    freelancer: { address: escrow?.freelancerAddress, tx: escrow?.transactionHash },
  };
  const d = details[nodeId] || {};
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${NODES[nodeId]?.label} details`}
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-72
                 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl p-4 shadow-xl"
    >
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-white">{NODES[nodeId]?.label}</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-white text-lg leading-none"
        >
          &times;
        </button>
      </div>
      {d.address && (
        <p className="text-xs text-gray-400 font-mono break-all mb-1">
          <span className="text-gray-500">Address: </span>
          {d.address}
        </p>
      )}
      {d.tx && (
        <p className="text-xs text-gray-400 font-mono break-all">
          <span className="text-gray-500">TX: </span>
          {d.tx}
        </p>
      )}
    </div>
  );
}

// ── Accessible table fallback ─────────────────────────────────────────────────

function AccessibleTable({ escrow, edges }) {
  return (
    <table className="w-full text-sm text-gray-300 border-collapse">
      <caption className="sr-only">Escrow transaction flow</caption>
      <thead>
        <tr className="border-b border-gray-700">
          <th className="text-left py-1 pr-4 font-medium text-gray-400">From</th>
          <th className="text-left py-1 pr-4 font-medium text-gray-400">To</th>
          <th className="text-left py-1 font-medium text-gray-400">Type</th>
        </tr>
      </thead>
      <tbody>
        {edges.map((e, i) => (
          <tr key={i} className="border-b border-gray-800">
            <td className="py-1 pr-4">{NODES[e.from]?.label}</td>
            <td className="py-1 pr-4">{NODES[e.to]?.label}</td>
            <td className="py-1">{e.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TransactionGraph({ escrow }) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mq.matches);
    const handler = (e) => setPrefersReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const status = escrow?.status || 'Active';
  const edges = STATUS_EDGES[status] || STATUS_EDGES.Active;

  // Which nodes are involved in active edges
  const activeNodeIds = new Set(edges.flatMap((e) => [e.from, e.to]));

  const handleNodeClick = useCallback((id) => {
    setSelectedNode((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="card relative overflow-hidden" aria-label="Transaction flow graph">
      <h2 className="text-sm font-semibold text-gray-400 mb-4">Fund Flow</h2>

      {/* SVG graph remains keyboard-accessible; table below provides a compact text fallback. */}
      <div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ maxHeight: 280 }}
          className="overflow-visible"
        >
          {/* Edges */}
          {edges.map((e, i) => (
            <Edge
              key={i}
              from={e.from}
              to={e.to}
              label={e.label}
              color={NODES[e.to]?.color}
              animate={!prefersReduced}
            />
          ))}

          {/* Nodes */}
          {Object.values(NODES).map((node) => (
            <Node
              key={node.id}
              node={node}
              active={activeNodeIds.has(node.id)}
              onClick={handleNodeClick}
            />
          ))}
        </svg>
      </div>

      {/* Node detail popover */}
      {selectedNode && escrow && (
        <NodeDetail nodeId={selectedNode} escrow={escrow} onClose={() => setSelectedNode(null)} />
      )}

      {/* Accessible table fallback */}
      <details className="mt-4">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 select-none">
          View as table (accessibility)
        </summary>
        <div className="mt-2">
          <AccessibleTable escrow={escrow} edges={edges} />
        </div>
      </details>
    </div>
  );
}
