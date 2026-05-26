'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body className="bg-gray-950 text-gray-100">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center space-y-4 p-8 card max-w-lg w-full">
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
        </div>
      </body>
    </html>
  );
}
