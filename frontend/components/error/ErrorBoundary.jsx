'use client';

import { Component } from 'react';
import * as Sentry from '@sentry/nextjs';
import Button from '../ui/Button';
import Link from 'next/link';

/**
 * Comprehensive ErrorBoundary for component/route-level error catching.
 * Features:
 * - Catches JS errors in tree
 * - Reports to Sentry + console
 * - Graceful fallback UI with recovery
 * - Retry button remounts children
 * - Consistent dark theme styling
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console with stack
    console.error('ErrorBoundary caught error:', error, errorInfo);

    // Report to Sentry
    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: errorInfo.componentStack });
      Sentry.captureException(error);
    });

    // Optional callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) {
      // Render children with key for remount on retry
      return (
        <div key={this.props.childrenKey || Math.random()}>
          {this.props.children}
        </div>
      );
    }

    const { fallback = this.renderFallback() } = this.props;

    return fallback;
  }

  renderFallback() {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <div className="text-center space-y-6 max-w-md mx-auto">
          <div className="w-20 h-20 bg-red-500/10 border-2 border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
            <p className="text-gray-400 leading-relaxed">
              This section encountered an unexpected error. We've logged it for review.
            </p>
            {this.state.error?.message && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
                <code className="font-mono break-all">
                  {this.state.error.message.length > 100
                    ? `${this.state.error.message.slice(0, 100)}…`
                    : this.state.error.message}
                </code>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={this.handleRetry} className="w-full sm:w-auto">
              Try Again
            </Button>
            <Button variant="secondary" href="/" asChild className="w-full sm:w-auto">
              <Link href="/">Go Home</Link>
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Error reported automatically. Refresh page if issue persists.
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
