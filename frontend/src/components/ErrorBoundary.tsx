import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[SeeYou Error]", error, info);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-black/95 p-6">
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(255,0,0,0.01)_2px,rgba(255,0,0,0.01)_4px)]" />
          <div className="relative flex max-w-lg flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-red-500">
                System Error
              </h2>
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-red-900 to-transparent" />

            <pre className="w-full overflow-auto rounded border border-red-900/40 bg-red-950/20 px-4 py-3 text-left font-mono text-xs leading-relaxed text-red-400/80">
              {this.state.error?.message ?? "Unknown error"}
            </pre>

            <button
              onClick={this.handleReset}
              className="rounded border border-red-800/60 bg-red-950/30 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-red-400 transition-colors hover:border-red-700 hover:bg-red-950/50 hover:text-red-300"
            >
              ▶ Retry
            </button>

            <p className="font-mono text-[10px] text-red-900">
              ERR: {this.state.error?.name ?? "RUNTIME"} — MODULE FAULT DETECTED
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
