import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * App-wide error boundary (ARCH05). A crash in any child component is
 * contained instead of white-screening the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="display mt-3 text-4xl text-foreground sm:text-5xl">
            We hit a snag
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            An unexpected error occurred while rendering this page. Reloading
            usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="clip-angle mt-8 inline-flex bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}