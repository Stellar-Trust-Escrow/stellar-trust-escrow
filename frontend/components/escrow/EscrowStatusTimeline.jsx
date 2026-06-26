/**
 * EscrowStatusTimeline Component
 *
 * Displays a vertical timeline showing escrow lifecycle states.
 * Shows completed states with checkmarks, current state with animated pulse,
 * and future states greyed out.
 *
 * @param {object} props
 * @param {Array} props.events - Array of {state, timestamp, actor} objects
 * @param {string} props.currentState - Current escrow state
 * @param {string} [props.className]
 */

import { Check, Clock } from 'lucide-react';

export default function EscrowStatusTimeline({ events = [], currentState, className = '' }) {
  const stateLabels = {
    Created: 'Created',
    Funded: 'Funded',
    InProgress: 'In Progress',
    ReleaseRequested: 'Release Requested',
    Released: 'Released',
    Disputed: 'Disputed',
    Resolved: 'Resolved',
    Cancelled: 'Cancelled',
  };

  const getStateColor = (state, isCurrent, isCompleted) => {
    if (isCompleted) return 'bg-green-600';
    if (isCurrent) return 'bg-indigo-600 animate-pulse';
    return 'bg-gray-700';
  };

  const getLineColor = (index, totalLength) => {
    return index < totalLength - 1 ? 'bg-gray-700' : 'bg-transparent';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`flex flex-col space-y-6 ${className}`} data-testid="escrow-timeline">
      {events.map((event, index) => {
        const isCompleted = index < events.length - 1 || currentState === events[index].state;
        const isCurrent = event.state === currentState;

        return (
          <div key={`${event.state}-${index}`} className="flex gap-4">
            {/* Timeline circle */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center 
                  border-2 border-gray-600 transition-all
                  ${getStateColor(event.state, isCurrent, isCompleted)}
                `}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 text-white" />
                ) : isCurrent ? (
                  <Clock className="w-5 h-5 text-white" />
                ) : (
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                )}
              </div>

              {/* Vertical line connecting to next event */}
              {index < events.length - 1 && (
                <div
                  className={`w-1 h-12 mt-2 ${getLineColor(index, events.length)}`}
                />
              )}
            </div>

            {/* Event details */}
            <div className="flex-1 pt-1">
              <h4
                className={`font-medium ${isCurrent ? 'text-white' : 'text-gray-400'}`}
              >
                {stateLabels[event.state] || event.state}
              </h4>
              <p className="text-xs text-gray-500 mt-1">{formatTime(event.timestamp)}</p>
              {event.actor && (
                <p className="text-xs text-gray-600 mt-0.5">by {event.actor}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
