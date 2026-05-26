import React from "react";
import RetryButton from "./RetryButton";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
    // Optionally report to Sentry here
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600">Something went wrong 😞</h2>
          <p className="my-4 text-gray-700">{this.state.error?.message}</p>
          <RetryButton onRetry={this.handleRetry}>Try Again</RetryButton>
        </div>
      );
    }

    return this.props.children;
  }
}