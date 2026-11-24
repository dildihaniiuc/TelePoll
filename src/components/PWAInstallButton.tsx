import { useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import type { UiLang } from "../types";

interface PWAInstallButtonProps {
  lang: UiLang;
  compact?: boolean;
}

export function PWAInstallButton({ lang, compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const label =
    lang === "bn"
      ? isIOS
        ? "হোম স্ক্রিনে যোগ করুন"
        : "অ্যাপ ইনস্টল করুন"
      : isIOS
        ? "Add to Home Screen"
        : "Install App";

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-200 bg-cyan-950/45 border border-cyan-500/45 rounded-sm hover:bg-cyan-950/75 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            : "w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-mono font-semibold text-cyan-200 bg-cyan-950/40 border border-cyan-500/40 rounded-sm hover:bg-cyan-950/70 hover:border-cyan-400/70 transition-colors whitespace-nowrap cursor-pointer"
        }
      >
        {isIOS ? (
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{label}</span>
      </button>

      {showGuideModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md hacker-panel rounded-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                <h3 className="text-sm font-semibold text-emerald-300 font-mono">
                  {lang === "bn"
                    ? "অ্যাপ হিসেবে ইনস্টল করার পদ্ধতি"
                    : "Install TelePoll Agent as an App"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 text-slate-400 hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  {lang === "bn"
                    ? "Safari ব্রাউজারের নিচের Share আইকনে ট্যাপ করুন।"
                    : "Tap the Share icon in the Safari toolbar."}
                </li>
                <li>
                  {lang === "bn"
                    ? "নিচে স্ক্রল করে 'Add to Home Screen' নির্বাচন করুন এবং Add চাপুন।"
                    : "Scroll down, tap 'Add to Home Screen', then tap Add."}
                </li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  {lang === "bn"
                    ? "প্রিভিউ ফ্রেমে না থেকে সাইটটি নতুন ট্যাবে (Shared App URL বা Vercel URL) ওপেন করুন।"
                    : "Open the app URL directly in a browser tab (not inside an embedded preview frame)."}
                </li>
                <li>
                  {lang === "bn"
                    ? "Android Chrome-এ মেনু (⋮) থেকে 'Install app' বা 'Add to Home screen' চাপুন।"
                    : "On Android Chrome, open the browser menu (⋮) and tap 'Install app'."}
                </li>
                <li>
                  {lang === "bn"
                    ? "Desktop Chrome বা Edge-এ অ্যাড্রেস বারের ডানদিকে থাকা Install (⊕) আইকনে ক্লিক করুন।"
                    : "On Desktop Chrome or Edge, click the Install icon (⊕) in the address bar."}
                </li>
              </ol>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 cursor-pointer"
              >
                {lang === "bn" ? "বুঝেছি" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
