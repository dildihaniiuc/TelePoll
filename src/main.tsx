import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { installPersistentSessionInterceptor } from "./lib/sessionVault";
import "./index.css";

installPersistentSessionInterceptor();

if (import.meta.env.PROD) {
  try {
    registerSW({
      immediate: true,
    });
  } catch {
    // Ignore SW registration failure in restricted environments
  }
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#060A0F] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full border border-emerald-500/40 bg-[#0D1722] p-6 rounded-sm space-y-3 font-mono">
            <h2 className="text-base font-bold text-rose-400">
              Render Error Detected
            </h2>
            <p className="text-xs text-slate-300 break-words">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
