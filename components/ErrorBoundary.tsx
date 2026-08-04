import React from 'react';
import { reportError } from '../services/telemetry';

interface ErrorBoundaryState { failed: boolean }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError(new Error(`${error.message}\n${info.componentStack}`), 'React render failure');
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 p-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <section className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-6 text-center shadow-sm dark:border-stone-700 dark:bg-stone-900">
          <h1 className="text-xl font-semibold">BlitzSense hit an unexpected problem.</h1>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Your saved progress is still on this device. Reload to start from a clean screen.</p>
          <button onClick={() => window.location.reload()} className="mt-5 rounded-md bg-stone-800 px-5 py-2.5 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900">
            Reload BlitzSense
          </button>
        </section>
      </main>
    );
  }
}
