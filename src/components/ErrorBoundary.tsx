import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logCrash } from '../lib/tauri';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Log to crash file via Tauri command (best effort)
    logCrash(error.message, error.stack ?? '', errorInfo.componentStack ?? '').catch(() => {});
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="text-red-400 text-lg font-medium mb-2">
            {this.props.fallbackTitle ?? 'Something went wrong'}
          </div>
          <p className="text-[var(--text-tertiary)] text-sm mb-4 max-w-md">
            An unexpected error occurred. You can try again or restart the app if the problem persists.
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            Try again
          </button>
          <details className="mt-4 text-left w-full max-w-lg">
            <summary className="text-[var(--text-secondary)] text-xs cursor-pointer hover:text-[var(--text-tertiary)]">
              Error details
            </summary>
            <pre className="mt-2 p-3 bg-gray-900 rounded text-xs text-red-300 overflow-auto max-h-48">
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
