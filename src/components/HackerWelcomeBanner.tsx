import { useEffect, useRef, useState } from "react";
import { Terminal } from "lucide-react";

const WELCOME_TEXT = "Welcome Dihan";
const CIPHER_CHARS = "01$#%&*@X9A7F";

const MOTIVATIONAL_QUOTES = [
  "Discipline beats motivation when motivation fades.",
  "Small consistent steps build unstoppable momentum.",
  "Stay silent, build fast, let the results speak.",
  "Dream big, start small, execute every single day.",
  "Focus on progress, not perfection.",
  "Hard work outlasts talent when talent stops working.",
  "Every expert was once a relentless beginner.",
  "Turn setbacks into setups for a stronger comeback.",
  "Your only competition is who you were yesterday.",
  "Master your mind, and you can master anything.",
  "Greatness is built in the hours nobody is watching.",
  "Do it scared, do it tired, just keep moving forward.",
  "Knowledge turns chaos into clarity.",
  "Consistency is the real superpower.",
];

export function HackerWelcomeBanner() {
  const [displayText, setDisplayText] = useState(WELCOME_TEXT);
  const [isWelcomePhase, setIsWelcomePhase] = useState(true);
  const [activePhrase, setActivePhrase] = useState(WELCOME_TEXT);
  const lastQuoteIdxRef = useRef(-1);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let cancelled = false;
    let scrambleTimer: number | undefined;
    let nextPhaseTimer: number | undefined;

    const pickRandomQuote = (): string => {
      let nextIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      if (nextIdx === lastQuoteIdxRef.current && MOTIVATIONAL_QUOTES.length > 1) {
        nextIdx = (nextIdx + 1) % MOTIVATIONAL_QUOTES.length;
      }
      lastQuoteIdxRef.current = nextIdx;
      return MOTIVATIONAL_QUOTES[nextIdx];
    };

    const runPhrase = (target: string, isWelcome: boolean) => {
      if (cancelled) return;
      setIsWelcomePhase(isWelcome);
      setActivePhrase(target);

      const holdMs = isWelcome ? 2600 : 5200;

      if (reducedMotion) {
        setDisplayText(target);
        nextPhaseTimer = window.setTimeout(() => {
          runPhrase(pickRandomQuote(), false);
        }, holdMs);
        return;
      }

      let step = 0;
      const charsPerTick = target.length > 36 ? 2 : 1;
      const totalSteps = Math.ceil(target.length / charsPerTick) * 2 + 2;

      scrambleTimer = window.setInterval(() => {
        if (cancelled) return;
        step += 1;
        const revealedCount = Math.floor(step / 2) * charsPerTick;

        const scrambled = target
          .split("")
          .map((char, idx) => {
            if (char === " ") return " ";
            if (idx < revealedCount) return char;
            return CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
          })
          .join("");

        setDisplayText(scrambled);

        if (step >= totalSteps) {
          if (scrambleTimer) window.clearInterval(scrambleTimer);
          setDisplayText(target);
          nextPhaseTimer = window.setTimeout(() => {
            runPhrase(pickRandomQuote(), false);
          }, holdMs);
        }
      }, 32);
    };

    runPhrase(WELCOME_TEXT, true);

    return () => {
      cancelled = true;
      if (scrambleTimer) window.clearInterval(scrambleTimer);
      if (nextPhaseTimer) window.clearTimeout(nextPhaseTimer);
    };
  }, []);

  return (
    <div
      aria-label={activePhrase}
      className="hacker-panel rounded-sm px-4 py-2.5 flex items-center justify-between gap-3 min-h-[3rem]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
        <span
          className={`font-mono tracking-wide leading-snug break-words transition-colors duration-200 ${
            isWelcomePhase
              ? "text-base sm:text-lg font-bold text-emerald-300 hacker-glow-text"
              : "text-xs sm:text-sm md:text-base font-semibold text-cyan-200 hacker-glow-text"
          }`}
        >
          {displayText}
          <span
            className="terminal-cursor text-emerald-400 ml-0.5"
            aria-hidden="true"
          >
            _
          </span>
        </span>
      </div>
    </div>
  );
}
