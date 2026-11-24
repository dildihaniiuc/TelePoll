import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Menu,
  Radio,
  Sparkles,
  X,
  AlertCircle,
} from "lucide-react";
import { COPY } from "./i18n";
import type { PublicTelegramConfig, ScheduledPollJob, UiLang } from "./types";
import { AgentStudio } from "./components/AgentStudio";
import { ScheduleQueue } from "./components/ScheduleQueue";
import { ChannelSettings } from "./components/ChannelSettings";
import {
  restoreSessionVaultIfNeeded,
  syncSessionVault,
} from "./lib/sessionVault";
import { BinaryRainBackground } from "./components/BinaryRainBackground";
import { PWAInstallButton } from "./components/PWAInstallButton";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { HackerWelcomeBanner } from "./components/HackerWelcomeBanner";

type ActiveTab = "studio" | "queue" | "channel";

interface ToastMessage {
  id: number;
  type: "success" | "error";
  text: string;
}

export default function App() {
  const [lang, setLang] = useState<UiLang>("bn");
  const [activeTab, setActiveTab] = useState<ActiveTab>("studio");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [config, setConfig] = useState<PublicTelegramConfig | null>(null);
  const [jobs, setJobs] = useState<ScheduledPollJob[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const vaultReadyRef = useRef(false);

  const t = COPY[lang];

  const notify = useCallback((type: "success" | "error", text: string) => {
    const id = Date.now();
    setToast({ id, type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 5000);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/config");
      if (res.ok) {
        const data = (await res.json()) as PublicTelegramConfig;
        const restored = await restoreSessionVaultIfNeeded(data);
        if (restored.restored && restored.config) {
          setConfig(restored.config);
          if (Array.isArray(restored.jobs)) {
            setJobs(restored.jobs);
          }
        } else {
          setConfig(data);
          if (data.hasUserSession || data.hasBotToken) {
            void syncSessionVault();
          }
        }
        vaultReadyRef.current = true;
      }
    } catch {
      // Ignore transient load error
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules");
      if (res.ok) {
        const data = (await res.json()) as { jobs: ScheduledPollJob[] };
        setJobs(data.jobs || []);
      }
    } catch {
      // Ignore transient poll error
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await loadConfig();
      if (cancelled) return;
      await loadJobs();
      if (cancelled) return;
      void fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      }).catch(() => {});
    };
    void init();

    const interval = window.setInterval(() => {
      void loadJobs();
      void loadConfig();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadConfig, loadJobs]);

  useEffect(() => {
    if (!vaultReadyRef.current || !config) return;
    if (!config.hasUserSession && !config.hasBotToken) return;
    const timer = window.setTimeout(() => {
      void syncSessionVault();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [config, jobs]);

  const upcomingJob = jobs.find((j) => j.status === "pending");
  const pendingCount = jobs.filter((j) => j.status === "pending").length;

  const currentBreadcrumb =
    activeTab === "studio"
      ? t.navStudio
      : activeTab === "queue"
        ? t.navQueue
        : t.navChannel;

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: typeof Sparkles;
    count?: number;
  }> = [
    { id: "studio", label: t.navStudio, icon: Sparkles },
    { id: "queue", label: t.navQueue, icon: CalendarClock, count: pendingCount },
    { id: "channel", label: t.navChannel, icon: Radio },
  ];

  return (
    <div className="relative min-h-screen flex terminal-grid-bg text-slate-100 overflow-x-hidden">
      <BinaryRainBackground />

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Left Workspace Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#060B10]/92 backdrop-blur-md border-r border-emerald-500/30 flex flex-col transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-14 px-5 border-b border-emerald-500/25 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/src/assets/images/agent_avatar_1794991339003.jpg"
              alt={t.brand}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-sm object-cover border border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.25)] shrink-0"
            />
            <span className="text-base font-bold font-mono tracking-tight text-emerald-400 hacker-glow-text whitespace-nowrap truncate">
              {t.brand}
              <span className="terminal-cursor text-emerald-300 ml-0.5" aria-hidden="true">
                _
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 text-slate-400 hover:text-emerald-300 lg:hidden cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-sm border transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/60 shadow-[0_0_14px_rgba(16,185,129,0.16)]"
                    : "border-transparent text-slate-400 hover:bg-emerald-950/30 hover:border-emerald-500/20 hover:text-slate-100"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {typeof item.count === "number" && item.count > 0 && (
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      active ? "text-emerald-300" : "text-slate-500"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Install PWA + Upcoming Post Footer Summary */}
        <div className="p-4 border-t border-emerald-500/25 space-y-3 text-xs">
          <PWAInstallButton lang={lang} />

          <div className="space-y-1.5">
            <div className="font-mono text-[11px] text-slate-400">
              {t.nextScheduledLabel}
            </div>
            {upcomingJob ? (
              <button
                type="button"
                onClick={() => setActiveTab("queue")}
                className="w-full text-left space-y-0.5 hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <div className="font-mono tabular-nums text-emerald-400 font-medium">
                  {new Date(upcomingJob.scheduledAt).toLocaleString(
                    lang === "bn" ? "bn-BD" : "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }
                  )}
                </div>
                <div className="text-slate-400 truncate">
                  {upcomingJob.question}
                </div>
              </button>
            ) : (
              <div className="text-slate-500 font-mono text-[11px]">
                {t.noUpcomingLabel}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-14 bg-[#060B10]/90 backdrop-blur-md border-b border-emerald-500/30 px-4 sm:px-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-900 lg:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap truncate font-mono">
              <span className="text-emerald-500/80">{t.brand}</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium text-slate-100 font-sans">
                {currentBreadcrumb}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Language Switcher */}
            <div className="flex items-center gap-0.5 p-0.5 bg-[#04070B] border border-emerald-500/25 rounded-sm">
              <button
                type="button"
                onClick={() => setLang("bn")}
                className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  lang === "bn"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap cursor-pointer ${
                  lang === "en"
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50"
                    : "text-slate-400 hover:text-slate-200 border border-transparent"
                }`}
              >
                EN
              </button>
            </div>

            {activeTab !== "studio" && (
              <button
                type="button"
                onClick={() => setActiveTab("studio")}
                className="px-3.5 py-1.5 text-xs font-semibold font-mono text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.3)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.newPollBtn}
              </button>
            )}
          </div>
        </header>

        {/* Active Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1 min-w-[220px]">
              <HackerWelcomeBanner />
            </div>
            <div className="lg:hidden shrink-0">
              <PWAInstallButton lang={lang} compact />
            </div>
          </div>

          {activeTab === "studio" && (
            <AgentStudio
              lang={lang}
              config={config}
              onNotify={notify}
              onOpenChannelSettings={() => setActiveTab("channel")}
              onSchedulesCreated={loadJobs}
              onOpenQueue={() => setActiveTab("queue")}
            />
          )}

          {activeTab === "queue" && (
            <ScheduleQueue
              lang={lang}
              jobs={jobs}
              onRefresh={loadJobs}
              onNotify={notify}
              onGoToStudio={() => setActiveTab("studio")}
            />
          )}

          {activeTab === "channel" && (
            <ChannelSettings
              lang={lang}
              config={config}
              onConfigUpdated={setConfig}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Non-blocking Toast Banner */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-sm border shadow-2xl text-sm backdrop-blur-md ${
            toast.type === "success"
              ? "bg-[#071117]/95 border-emerald-400/55 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              : "bg-[#160A10]/95 border-rose-500/55 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.2)]"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <OfflineIndicator lang={lang} />
    </div>
  );
}
