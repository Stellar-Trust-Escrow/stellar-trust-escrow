'use client';

/**
 * Global Error Boundary (App Router)
 *
 * Catches unhandled errors in the root layout and reports them to Sentry.
 * Next.js requires this file to be a Client Component.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import Button from '../components/ui/Button';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);


        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-red-400">Something went wrong</h1>
          <p className="text-gray-400 text-sm">
            This error has been reported. Try refreshing the page.
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
