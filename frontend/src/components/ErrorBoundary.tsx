'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import ErrorFallback from './ErrorFallback'

interface ErrorBoundaryProps {
  children: ReactNode
  context?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { context } = this.props
    Sentry.withScope((scope) => {
      scope.setTag('boundary', 'route')
      if (context) {
        scope.setTag('route', context)
        scope.setContext('route', { name: context })
      }
      scope.setExtra('componentStack', errorInfo.componentStack)
      Sentry.captureException(error)
    })
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, context } = this.props
    if (hasError && error) {
      return <ErrorFallback error={error} resetError={this.handleReset} context={context} />
    }
    return children
  }
}
