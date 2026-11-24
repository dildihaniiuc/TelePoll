import { useEffect, useState } from "react";
import { Terminal } from "lucide-react";

const TARGET_TEXT = "Welcome Dihan";
const CIPHER_CHARS = "01$#%&*@X9A7F";

export function HackerWelcomeBanner() {
  const [displayText, setDisplayText] = useState(TARGET_TEXT);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reducedMotion) {
      setDisplayText(TARGET_TEXT);
      return;
    }

    let step = 0;
    const totalSteps = TARGET_TEXT.length * 2 + 4;
    const timer = window.setInterval(() => {
      step += 1;
      const revealedCount = Math.floor(step / 2);

      const scrambled = TARGET_TEXT.split("")
        .map((char, idx) => {
          if (char === " ") return " ";
          if (idx < revealedCount) return char;
          return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
        })
        .join("");

      setDisplayText(scrambled);

      if (step >= totalSteps) {
        setDisplayText(TARGET_TEXT);
        window.clearInterval(timer);
      }
    }, 38);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      aria-label={TARGET_TEXT}
      className="hacker-panel rounded-sm px-4 py-2.5 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="font-mono text-base sm:text-lg font-bold tracking-wider text-emerald-300 hacker-glow-text truncate">
          {displayText}
          <span
            className="terminal-cursor text-cyan-300 ml-0.5"
            aria-hidden="true"
          >
            _
          </span>
        </span>
      </div>
    </div>
  );
}
