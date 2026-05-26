'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AlertCircle, Trash2, Plus } from 'lucide-react';
import Button from '../ui/Button';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const NODE_PADDING = 40;

function hasCycle(graph) {
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node) {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

export default function MilestonePlanner({ milestones = [], onChange = () => {} }) {
  const canvasRef = useRef(null);
  const [positions, setPositions] = useState({});
  const [edges, setEdges] = useState([]); // { from, to }
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [draggingEdge, setDraggingEdge] = useState(null);
  const [error, setError] = useState('');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!milestones.length) return;
    const newPositions = {};
    milestones.forEach((m, i) => {
      if (!positions[m.id]) {
        newPositions[m.id] = {
          x: (i % 3) * (NODE_WIDTH + NODE_PADDING) + 40,
          y: Math.floor(i / 3) * (NODE_HEIGHT + NODE_PADDING) + 40,
        };
      }
    });
    setPositions((p) => ({ ...p, ...newPositions }));
  }, [milestones]);

  const handleNodeMouseDown = (nodeId, e) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = positions[nodeId];

    const handleMouseMove = (moveE) => {
      const dx = moveE.clientX - startX;
      const dy = moveE.clientY - startY;
      setPositions((p) => ({
        ...p,
        [nodeId]: {
          x: Math.max(0, startPos.x + dx),
          y: Math.max(0, startPos.y + dy),
        },
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleEdgeStart = (fromId, e) => {
    e.stopPropagation();
    setDraggingEdge({ from: fromId, to: null });
  };

  const handleMouseMove = (e) => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleEdgeEnd = (toId, e) => {
    e.stopPropagation();
    if (!draggingEdge || draggingEdge.from === toId) {
      setDraggingEdge(null);
      return;
    }

    const newEdges = [...edges, { from: draggingEdge.from, to: toId }];
    const graph = buildGraph(newEdges);

    if (hasCycle(graph)) {
      setError('❌ Circular dependency detected. Edge not created.');
      setTimeout(() => setError(''), 4000);
    } else {
      setEdges(newEdges);
      setError('');
      onChange({ edges: newEdges });
    }
    setDraggingEdge(null);
  };

  const buildGraph = (edgeList) => {
    const graph = {};
    milestones.forEach((m) => {
      graph[m.id] = [];
    });
    edgeList.forEach(({ from, to }) => {
      if (!graph[from]) graph[from] = [];
      graph[from].push(to);
    });
    return graph;
  };

  const handleDeleteEdge = (edgeIndex) => {
    const newEdges = edges.filter((_, i) => i !== edgeIndex);
    setEdges(newEdges);
    onChange({ edges: newEdges });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Delete' && selectedNodes.size > 0) {
      const newEdges = edges.filter(
        (edge) => !selectedNodes.has(edge.from) && !selectedNodes.has(edge.to)
      );
      setEdges(newEdges);
      setSelectedNodes(new Set());
      onChange({ edges: newEdges });
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, edges]);

  if (!milestones.length) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-400">No milestones to plan. Create milestones first.</p>
      </div>
    );
  }

  const width = Math.max(600, (Math.max(...milestones.map((_, i) => i % 3)) + 1) * (NODE_WIDTH + NODE_PADDING));
  const height = Math.max(400, (Math.ceil(milestones.length / 3)) * (NODE_HEIGHT + NODE_PADDING) + 100);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="bg-gray-900/40 backdrop-blur-md border border-gray-800/50 rounded-xl p-6 overflow-auto">
        <svg
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full bg-gray-950/50 rounded-lg border border-gray-800"
          onMouseMove={handleMouseMove}
        >
          {edges.map((edge, idx) => {
            const fromNode = milestones.find((m) => m.id === edge.from);
            const toNode = milestones.find((m) => m.id === edge.to);
            if (!fromNode || !toNode) return null;

            const fromPos = positions[edge.from];
            const toPos = positions[edge.to];
            if (!fromPos || !toPos) return null;

            const x1 = fromPos.x + NODE_WIDTH / 2;
            const y1 = fromPos.y + NODE_HEIGHT;
            const x2 = toPos.x + NODE_WIDTH / 2;
            const y2 = toPos.y;

            const controlY = (y1 + y2) / 2;

            return (
              <g key={`edge-${idx}`}>
                <path
                  d={`M ${x1} ${y1} Q ${x1} ${controlY}, ${x2} ${y2}`}
                  stroke="#6366f1"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="5,5"
                />
                <circle
                  cx={(x1 + x2) / 2}
                  cy={controlY}
                  r="6"
                  fill="#ef4444"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleDeleteEdge(idx)}
                />
              </g>
            );
          })}

          {draggingEdge && (
            <path
              d={`M ${positions[draggingEdge.from]?.x + NODE_WIDTH / 2} ${
                positions[draggingEdge.from]?.y + NODE_HEIGHT
              } L ${mousePos.x} ${mousePos.y}`}
              stroke="#6366f1"
              strokeWidth="2"
              strokeDasharray="5,5"
              fill="none"
              opacity="0.6"
            />
          )}

          {milestones.map((milestone) => {
            const pos = positions[milestone.id];
            if (!pos) return null;

            const isSelected = selectedNodes.has(milestone.id);

            return (
              <g
                key={`node-${milestone.id}`}
                onMouseDown={(e) => {
                  if (e.shiftKey) {
                    setSelectedNodes((s) => {
                      const newSet = new Set(s);
                      if (newSet.has(milestone.id)) newSet.delete(milestone.id);
                      else newSet.add(milestone.id);
                      return newSet;
                    });
                  } else if (e.button === 0) {
                    handleNodeMouseDown(milestone.id, e);
                  }
                }}
              >
                {/* Glassmorphic card background */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="8"
                  fill="#1f2937"
                  fillOpacity="0.6"
                  stroke={isSelected ? '#6366f1' : '#374151'}
                  strokeWidth={isSelected ? '2' : '1'}
                  style={{ cursor: 'move' }}
                />

                {/* Text */}
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + 25}
                  textAnchor="middle"
                  fill="#e5e7eb"
                  fontSize="12"
                  fontWeight="500"
                  pointerEvents="none"
                >
                  {milestone.title?.length > 16 ? milestone.title?.substring(0, 13) + '...' : milestone.title}
                </text>
                <text
                  x={pos.x + NODE_WIDTH / 2}
                  y={pos.y + 50}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="11"
                  pointerEvents="none"
                >
                  {milestone.amount ? `$${milestone.amount}` : 'No amount'}
                </text>

                {/* Edge start handle */}
                <circle
                  cx={pos.x + NODE_WIDTH / 2}
                  cy={pos.y + NODE_HEIGHT}
                  r="5"
                  fill="#10b981"
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={(e) => handleEdgeStart(milestone.id, e)}
                />

                {/* Edge end handle */}
                <circle
                  cx={pos.x + NODE_WIDTH / 2}
                  cy={pos.y}
                  r="5"
                  fill="#f59e0b"
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={(e) => handleEdgeEnd(milestone.id, e)}
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="text-xs text-gray-400 space-y-1">
        <p>🖱️ Drag nodes to reposition | 🔗 Drag from green handle (bottom) to yellow handle (top) to create dependencies</p>
        <p>Shift+Click to select/deselect nodes | Delete key to remove selected nodes and their edges</p>
        <p>Circular dependencies are blocked automatically</p>
      </div>
    </div>
  );
}
