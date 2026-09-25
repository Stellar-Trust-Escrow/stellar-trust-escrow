'use client';

/**
 * Admin — Queue Management Page  (Issue #233)
 *
 * Shows the BullMQ dead-letter queue with job inspection and
 * replay/acknowledge actions.
 */

import { useAdminStore } from '../../../store/app-store';
import DeadLetterQueue from '../../../components/admin/DeadLetterQueue';

export default function AdminQueuesPage() {
  const { apiKey } = useAdminStore();

  if (!apiKey) {
    return (
      <div className="card text-center py-12 text-gray-400">
        <p>Please authenticate on the <a href="/admin" className="text-indigo-400 hover:underline">Admin Dashboard</a> first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Queue Management</h1>
          <p className="text-gray-400 text-sm mt-1">
            Inspect and replay failed background jobs from the dead-letter queue.
          </p>
        </div>
        <a href="/admin" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          ← Dashboard
        </a>
      </div>

      <DeadLetterQueue apiKey={apiKey} />
    </div>
  );
}
