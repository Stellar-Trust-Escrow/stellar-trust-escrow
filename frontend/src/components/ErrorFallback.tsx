'use client'
import React from 'react'
import * as Sentry from '@sentry/nextjs'
import { useRouter } from 'next/navigation'

export interface FallbackProps {
  error: Error
  resetError: () => void
  context?: string
}

export default function ErrorFallback({ error, resetError }: FallbackProps) {
  const router = useRouter()
  const showError = process.env.NODE_ENV !== 'production' && error?.message
  return (
    <div role='alert'>
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. Our team has been notified.</p>
      {showError && (
        <details>
          <summary>Error details</summary>
          <pre>{error.message}</pre>
        </details>
      )}
      <div>
        <button onClick={resetError}>Try again</button>
        <button onClick={()=>router.push('/dashboard')}>Go to Dashboard</button>
        <button onClick={()=>Sentry.showReportDialog()}>Report this problem</button>
      </div>
    </div>
  )
}
