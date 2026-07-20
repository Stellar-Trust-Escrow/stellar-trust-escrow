'use client';

/**
 * MetricsTile - Displays a single metric with delta indicator
 * Shows improvement in green, degradation in red (configurable per metric)
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function MetricsTile({
  label,
  value,
  delta,
  deltaLabel,
  icon,
  color = 'text-indigo-400',
  improvementDirection = 'up', // 'up' means higher is better, 'down' means lower is better
}) {
  const getDeltaColor = () => {
    if (delta === 0 || delta === null || delta === undefined) {
      return 'text-gray-400';
    }
    
    const isPositive = delta > 0;
    const isImprovement = improvementDirection === 'up' ? isPositive : !isPositive;
    
    return isImprovement ? 'text-green-400' : 'text-red-400';
  };

  const getDeltaIcon = () => {
    if (delta === 0 || delta === null || delta === undefined) {
      return <Minus className="w-4 h-4" />;
    }
    
    const isPositive = delta > 0;
    const isImprovement = improvementDirection === 'up' ? isPositive : !isPositive;
    
    return isImprovement ? (
      <TrendingUp className="w-4 h-4" />
    ) : (
      <TrendingDown className="w-4 h-4" />
    );
  };

  const formatDelta = () => {
    if (delta === null || delta === undefined) return '—';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta}%`;
  };

  return (
    <div className="card flex items-start gap-4">
      <div className={`text-3xl ${color}`}>{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-bold text-white mt-1">{value ?? '—'}</p>
        {(delta !== null && delta !== undefined) && (
          <div className={`flex items-center gap-1 mt-1 ${getDeltaColor()}`}>
            {getDeltaIcon()}
            <span className="text-sm font-medium">
              {formatDelta()} {deltaLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
