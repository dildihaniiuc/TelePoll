import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import type { UiLang } from "../types";

export function OfflineIndicator({ lang }: { lang: UiLang }) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3.5 py-2 rounded-sm bg-amber-950/90 border border-amber-500/50 text-xs font-mono font-medium text-amber-200 shadow-lg backdrop-blur-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>
        {lang === "bn"
          ? "অফলাইন মোড — ক্যাশ করা ডেটা চালু আছে"
          : "Offline Mode — Cached interface active"}
      </span>
    </div>
  );
}
