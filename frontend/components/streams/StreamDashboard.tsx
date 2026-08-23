'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import StreamCard from './StreamCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface StreamDashboardProps {
  userAddress?: string | null;
}

export default function StreamDashboard({ userAddress }: StreamDashboardProps) {
  const [tab, setTab] = useState('all');

  const { data, error, isLoading, mutate } = useSWR(
    userAddress ? `${API_URL}/api/v1/streams?address=${userAddress}&limit=50` : null,
    fetcher,
    { refreshInterval: 15_000 },
  );

  const streams: any[] = data?.data || [];
  const sending = streams.filter((s) => s.senderAddress === userAddress);
  const receiving = streams.filter((s) => s.recipientAddress === userAddress);

  const displayStreams =
    tab === 'sending' ? sending : tab === 'receiving' ? receiving : streams;

  const handleAction = useCallback(() => {
    mutate();
  }, [mutate]);

  if (!userAddress) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Connect your wallet to view payment streams.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Payment Streams</h2>
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {['all', 'sending', 'receiving'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-gray-800 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-800 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-800 rounded w-1/4" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="card p-4 border-red-800">
          <p className="text-red-400 text-sm">Failed to load streams. Retrying...</p>
        </div>
      )}

      {!isLoading && !error && displayStreams.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-2">No payment streams found.</p>
          <p className="text-gray-600 text-sm">Create a new stream to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {tab === 'all' && (
          <>
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
                Sending ({sending.length})
              </h3>
              {sending.map((s) => (
                <StreamCard
                  key={s.streamId.toString()}
                  stream={s}
                  role="sender"
                  onAction={handleAction}
                />
              ))}
              {sending.length === 0 && !isLoading && (
                <p className="text-gray-600 text-sm py-4">No outgoing streams</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wider">
                Receiving ({receiving.length})
              </h3>
              {receiving.map((s) => (
                <StreamCard
                  key={s.streamId.toString()}
                  stream={s}
                  role="recipient"
                  onAction={handleAction}
                />
              ))}
              {receiving.length === 0 && !isLoading && (
                <p className="text-gray-600 text-sm py-4">No incoming streams</p>
              )}
            </div>
          </>
        )}

        {tab !== 'all' && (
          <div className={tab === 'sending' ? '' : ''}>
            {displayStreams.map((s) => (
              <StreamCard
                key={s.streamId.toString()}
                stream={s}
                role={tab === 'sending' ? 'sender' : 'recipient'}
                onAction={handleAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
