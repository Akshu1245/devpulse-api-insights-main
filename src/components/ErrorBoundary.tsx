"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-[300px] flex items-center justify-center">
            <div className="glass-card rounded-2xl p-8 text-center border border-border max-w-md">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
                className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
