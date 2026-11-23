import crypto from "crypto";
import type { PollDraft, PollType } from "./types.ts";
import { normalizeKeywordList } from "./channelIndexer.ts";

export interface ParseReadyPollsInput {
  text: string;
  pollType?: "regular" | "quiz" | "auto";
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
  indexingKeywords?: string[] | string;
  language?: "bn" | "en" | "auto";
}

export interface ParseReadyPollsResult {
  polls: PollDraft[];
  skippedNotes: string[];
  agentSummary: string;
  matchedBlocksCount: number;
}

interface ParsedOptionItem {
  label?: string;
  text: string;
  markedCorrect: boolean;
}

interface RawPollBlock {
  questionLines: string[];
  options: ParsedOptionItem[];
  answerRaw?: string;
  explanationLines: string[];
  hadAnswerMarker: boolean;
}

const BN_DIGIT_MAP: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const BN_LETTER_INDEX: Record<string, number> = {
  ক: 0,
  খ: 1,
  গ: 2,
  ঘ: 3,
  ঙ: 4,
  চ: 5,
  ছ: 6,
  জ: 7,
  ঝ: 8,
  ঞ: 9,
};

const EN_LETTER_INDEX: Record<string, number> = {
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  e: 4,
  f: 5,
  g: 6,
  h: 7,
  i: 8,
  j: 9,
};

function bnDigitsToAscii(input: string): string {
  return input.replace(/[০-৯]/g, (ch) => BN_DIGIT_MAP[ch] ?? ch);
}

function stripCorrectMarkers(rawText: string): {
  text: string;
  markedCorrect: boolean;
} {
  let text = rawText.trim();
  let markedCorrect = false;

  // Check explicit checkmark / tag markers before or after option text
  const markerPatterns = [
    /^\s*[✓✔✅☑️]+\s*/u,
    /\s*[✓✔✅☑️]+\s*$/u,
    /\s*[\(\[]\s*(?:সঠিক(?:\s*উত্তর)?|correct|right|ans)\s*[\)\]]\s*$/i,
    /^\s*[\(\[]\s*(?:সঠিক(?:\s*উত্তর)?|correct|right|ans)\s*[\)\]]\s*/i,
  ];

  for (const re of markerPatterns) {
    if (re.test(text)) {
      markedCorrect = true;
      text = text.replace(re, "").trim();
    }
  }

  // Leading or trailing asterisk used to mark correct MCQ answer (e.g. "ক) *ঢাকা" or "A) Dhaka*")
  if (/^\*+(?!\*)/.test(text) && !/\*$/.test(text)) {
    markedCorrect = true;
    text = text.replace(/^\*+\s*/, "").trim();
  } else if (/(?<!\*)\*+$/.test(text) && !/^\*/.test(text)) {
    markedCorrect = true;
    text = text.replace(/\s*\*+$/, "").trim();
  }

  return { text, markedCorrect };
}

function normalizeLabelToIndex(label: string): number | undefined {
  const clean = label.trim().replace(/[\(\)\.\:\-\s]/g, "");
  if (!clean) return undefined;
  if (clean in BN_LETTER_INDEX) return BN_LETTER_INDEX[clean];
  const lower = clean.toLowerCase();
  if (lower in EN_LETTER_INDEX) return EN_LETTER_INDEX[lower];
  const ascii = bnDigitsToAscii(clean);
  if (/^\d{1,2}$/.test(ascii)) {
    const num = Number(ascii);
    if (num >= 1 && num <= 10) return num - 1;
  }
  return undefined;
}

const QUESTION_HEADER_RE =
  /^\s*(?:প্রশ্ন\s*[০-৯\d]{1,3}\s*[:：\.\-]\s*|Q(?:uestion)?\s*\d{1,3}\s*[:：\.\-]\s*|প্রশ্ন\s*[:：]\s*|Q\s*[:：]\s*)(.+)$/i;

const NUMBERED_QUESTION_START_RE =
  /^\s*(?:প্রশ্ন\s*[০-৯\d]{1,3}\s*[:：\.\-]?\s*|Q(?:uestion)?\s*\d{1,3}\s*[:：\.\-]?\s*|[০-৯\d]{1,3}\s*[\.\)]\s+)(.+)$/i;

const ANSWER_LINE_RE =
  /^\s*(?:সঠিক\s*উত্তর|উত্তর|উঃ|Ans(?:wer)?|Correct(?:\s*Answer)?)\s*[:：\-\=]\s*(.+)$/i;

const EXPLANATION_LINE_RE =
  /^\s*(?:ব্যাখ্যা|বিশ্লেষণ|নোট|Explanation|Note|Exp)\s*[:：\-\=]\s*(.+)$/i;

const LETTER_OPTION_RE =
  /^\s*(?:\(([ক-ঞA-Ja-j])\)|([ক-ঞA-Ja-j])[\)\.\:\-])\s+(.+)$/;

const NUMBER_OPTION_RE =
  /^\s*(?:\(([০-৯\d]{1,2})\)|([০-৯\d]{1,2})[\)\.])\s+(.+)$/;

const BULLET_OPTION_RE = /^\s*(?:[-•▪◦‣]|[✓✔✅☑️])\s+(.+)$/u;

const INLINE_LABEL_SCAN_RE =
  /(?:^|\s)(?:\(([ক-ঞA-Ja-j])\)|([ক-ঞA-Ja-j])\)|([ক-ঞ])\.)\s+/g;

function extractInlineLabeledOptions(line: string): {
  prefixQuestion: string;
  options: ParsedOptionItem[];
} | null {
  const matches: Array<{
    start: number;
    end: number;
    label: string;
  }> = [];

  for (const m of line.matchAll(INLINE_LABEL_SCAN_RE)) {
    const label = m[1] || m[2] || m[3] || "";
    const idx = m.index ?? 0;
    const leadingSpaceLen = m[0].length - m[0].trimStart().length;
    matches.push({
      start: idx + leadingSpaceLen,
      end: idx + m[0].length,
      label,
    });
  }

  if (matches.length < 2) return null;

  // Validate that labels look like sequential option keys (e.g., ক..খ or A..B)
  const firstIdx = normalizeLabelToIndex(matches[0].label);
  const secondIdx = normalizeLabelToIndex(matches[1].label);
  if (firstIdx !== 0 || secondIdx !== 1) return null;

  const prefixQuestion = line.slice(0, matches[0].start).trim();
  const options: ParsedOptionItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const rawSegment = line
      .slice(
        matches[i].end,
        i + 1 < matches.length ? matches[i + 1].start : line.length
      )
      .trim()
      .replace(/[;,|]+$/, "")
      .trim();
    const cleaned = stripCorrectMarkers(rawSegment);
    options.push({
      label: matches[i].label,
      text: cleaned.text,
      markedCorrect: cleaned.markedCorrect,
    });
  }

  return { prefixQuestion, options };
}

function cleanQuestionHeader(rawQuestion: string): string {
  const trimmed = rawQuestion.trim();
  const explicit = trimmed.match(QUESTION_HEADER_RE);
  if (explicit?.[1]) return explicit[1].trim();
  const numbered = trimmed.match(NUMBERED_QUESTION_START_RE);
  if (numbered?.[1]) return numbered[1].trim();
  return trimmed;
}

function splitIntoPollBlocks(rawText: string): RawPollBlock[] {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  const blocks: RawPollBlock[] = [];
  let current: RawPollBlock | null = null;
  let lastLineBlank = true;

  const getCur = (): RawPollBlock | null => current;

  const pushCurrent = () => {
    if (
      current &&
      (current.questionLines.length > 0 || current.options.length > 0)
    ) {
      blocks.push(current);
    }
    current = null;
  };

  const ensureCurrent = (): RawPollBlock => {
    if (!current) {
      current = {
        questionLines: [],
        options: [],
        explanationLines: [],
        hadAnswerMarker: false,
      };
    }
    return current;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      lastLineBlank = true;
      continue;
    }

    const active = getCur();

    // Check Answer line
    const ansMatch = line.match(ANSWER_LINE_RE);
    if (ansMatch && active && active.questionLines.length > 0) {
      active.answerRaw = ansMatch[1].trim();
      active.hadAnswerMarker = true;
      lastLineBlank = false;
      continue;
    }

    // Check Explanation line
    const expMatch = line.match(EXPLANATION_LINE_RE);
    if (expMatch && active && active.questionLines.length > 0) {
      active.explanationLines.push(expMatch[1].trim());
      lastLineBlank = false;
      continue;
    }

    // Check explicit question header (প্রশ্ন ১:, Q1:, etc.)
    if (QUESTION_HEADER_RE.test(line)) {
      if (active && (active.options.length > 0 || active.questionLines.length > 0)) {
        pushCurrent();
      }
      const blk = ensureCurrent();
      const inline = extractInlineLabeledOptions(cleanQuestionHeader(line));
      if (inline) {
        if (inline.prefixQuestion) blk.questionLines.push(inline.prefixQuestion);
        blk.options.push(...inline.options);
      } else {
        blk.questionLines.push(cleanQuestionHeader(line));
      }
      lastLineBlank = false;
      continue;
    }

    // Check inline multi-options on a single line (e.g. "প্রশ্ন? ক) ... খ) ... গ) ... ঘ) ...")
    const inline = extractInlineLabeledOptions(line);
    if (inline) {
      if (
        inline.prefixQuestion &&
        active &&
        (active.options.length >= 2 || active.hadAnswerMarker)
      ) {
        pushCurrent();
      }
      const blk = ensureCurrent();
      if (inline.prefixQuestion) {
        if (blk.options.length >= 2) {
          pushCurrent();
          const nextBlk = ensureCurrent();
          nextBlk.questionLines.push(cleanQuestionHeader(inline.prefixQuestion));
          nextBlk.options.push(...inline.options);
        } else {
          blk.questionLines.push(cleanQuestionHeader(inline.prefixQuestion));
          blk.options.push(...inline.options);
        }
      } else {
        blk.options.push(...inline.options);
      }
      lastLineBlank = false;
      continue;
    }

    // Check letter-labeled option (ক), খ), A), B), etc.)
    const letterOpt = line.match(LETTER_OPTION_RE);
    if (letterOpt) {
      const label = letterOpt[1] || letterOpt[2];
      const labelIdx = normalizeLabelToIndex(label);
      const blk = ensureCurrent();
      if (
        blk.hadAnswerMarker &&
        labelIdx === 0 &&
        blk.options.length >= 2
      ) {
        pushCurrent();
        const fresh = ensureCurrent();
        const cleaned = stripCorrectMarkers(letterOpt[3]);
        fresh.options.push({
          label,
          text: cleaned.text,
          markedCorrect: cleaned.markedCorrect,
        });
      } else {
        const cleaned = stripCorrectMarkers(letterOpt[3]);
        blk.options.push({
          label,
          text: cleaned.text,
          markedCorrect: cleaned.markedCorrect,
        });
      }
      lastLineBlank = false;
      continue;
    }

    // Check numeric line (could be numbered question "1. ..." OR numbered option "1) ...")
    const numOpt = line.match(NUMBER_OPTION_RE);
    if (numOpt) {
      const rawLabel = numOpt[1] || numOpt[2];
      const parsedNum = Number(bnDigitsToAscii(rawLabel));
      const isParenFormat =
        /^\s*(?:\([০-৯\d]{1,2}\)|[০-৯\d]{1,2}\))/.test(line);

      const looksLikeOptionOfCurrent =
        Boolean(active) &&
        !active!.hadAnswerMarker &&
        active!.questionLines.length > 0 &&
        (isParenFormat || active!.options.some((o) => /^\d+$/.test(bnDigitsToAscii(o.label || "")))) &&
        parsedNum === active!.options.length + 1 &&
        parsedNum <= 10;

      if (looksLikeOptionOfCurrent && active) {
        const cleaned = stripCorrectMarkers(numOpt[3]);
        active.options.push({
          label: rawLabel,
          text: cleaned.text,
          markedCorrect: cleaned.markedCorrect,
        });
        lastLineBlank = false;
        continue;
      }

      // Otherwise treat as a new numbered question if current already has options or answer
      if (
        active &&
        (active.options.length >= 2 ||
          active.hadAnswerMarker ||
          (lastLineBlank && active.questionLines.length > 0))
      ) {
        pushCurrent();
      }
      const blk = ensureCurrent();
      blk.questionLines.push(cleanQuestionHeader(line));
      lastLineBlank = false;
      continue;
    }

    // Check bullet option (- Option, • Option, ✅ Option)
    const bulletOpt = line.match(BULLET_OPTION_RE);
    if (bulletOpt && active && active.questionLines.length > 0 && !active.hadAnswerMarker) {
      const startsCheck = /^\s*[✓✔✅☑️]/u.test(line);
      const cleaned = stripCorrectMarkers(bulletOpt[1]);
      active.options.push({
        text: cleaned.text,
        markedCorrect: startsCheck || cleaned.markedCorrect,
      });
      lastLineBlank = false;
      continue;
    }

    // Otherwise plain text line
    if (
      active &&
      (active.options.length >= 2 ||
        active.hadAnswerMarker ||
        (lastLineBlank && active.options.length > 0))
    ) {
      pushCurrent();
    }

    const blk = ensureCurrent();
    if (blk.explanationLines.length > 0 && !lastLineBlank) {
      blk.explanationLines.push(line);
    } else if (blk.options.length === 0) {
      blk.questionLines.push(blk.questionLines.length === 0 ? cleanQuestionHeader(line) : line);
    } else {
      blk.questionLines.push(line);
    }
    lastLineBlank = false;
  }

  pushCurrent();
  return blocks;
}

function resolveAnswerIndex(
  block: RawPollBlock,
  options: ParsedOptionItem[]
): { index?: number; hadQuizSignal: boolean; errorReason?: string } {
  const markedIndices = options
    .map((o, idx) => (o.markedCorrect ? idx : -1))
    .filter((i) => i >= 0);

  const ansRaw = block.answerRaw?.trim() || "";
  const hadQuizSignal = Boolean(ansRaw) || markedIndices.length > 0;

  if (!hadQuizSignal) {
    return { hadQuizSignal: false };
  }

  if (markedIndices.length > 1) {
    return {
      hadQuizSignal: true,
      errorReason:
        "একই প্রশ্নে একাধিক অপশনে সঠিক চিহ্ন (✓/✅/*) দেওয়া আছে — ভুল এড়াতে বাদ দেওয়া হয়েছে।",
    };
  }

  let resolvedFromAnswerLine: number | undefined;
  let answerTextNote: string | undefined;

  if (ansRaw) {
    // Pattern 1: "খ) ঢাকা", "খ. ঢাকা", "(খ) ঢাকা", "B) Dhaka", "খ", "B", "2", "২"
    const labeledAns = ansRaw.match(
      /^(?:\(([ক-ঞA-Ja-j০-৯\d]{1,2})\)|([ক-ঞA-Ja-j০-৯\d]{1,2})(?:[\)\.\:\-\s]|$))\s*(.*)$/
    );

    if (labeledAns) {
      const token = labeledAns[1] || labeledAns[2];
      const remainder = (labeledAns[3] || "").trim();
      const targetPos = normalizeLabelToIndex(token);

      if (targetPos !== undefined) {
        // Prefer matching option with explicit matching label; else positional index
        const byLabelIdx = options.findIndex(
          (o) => o.label && normalizeLabelToIndex(o.label) === targetPos
        );
        const candidateIdx = byLabelIdx >= 0 ? byLabelIdx : targetPos;

        if (candidateIdx >= 0 && candidateIdx < options.length) {
          if (remainder) {
            const cleanRemainder = stripCorrectMarkers(remainder).text.toLowerCase();
            const candidateText = options[candidateIdx].text.toLowerCase();
            if (cleanRemainder && cleanRemainder !== candidateText) {
              // Label and text conflict! Check if user wrote exact option text elsewhere
              return {
                hadQuizSignal: true,
                errorReason: `উত্তর লাইনে লেবেল (${token}) ও টেক্সট ("${remainder}") মিলছে না — ভুল এড়াতে বাদ দেওয়া হয়েছে।`,
              };
            }
          }
          resolvedFromAnswerLine = candidateIdx;
        } else if (remainder) {
          answerTextNote = stripCorrectMarkers(remainder).text;
        }
      }
    }

    // Pattern 2: Full text match against options (case-insensitive)
    if (resolvedFromAnswerLine === undefined) {
      const cleanAns = stripCorrectMarkers(answerTextNote || ansRaw)
        .text.replace(/[।\.]+$/, "")
        .trim()
        .toLowerCase();

      const exactMatches = options
        .map((o, idx) => ({
          idx,
          norm: o.text.replace(/[।\.]+$/, "").trim().toLowerCase(),
        }))
        .filter((x) => x.norm === cleanAns);

      if (exactMatches.length === 1) {
        resolvedFromAnswerLine = exactMatches[0].idx;
      } else {
        // Try prefix/label stripping e.g. if ansRaw was "খ) অপশন" with odd punctuation
        return {
          hadQuizSignal: true,
          errorReason: `প্রদত্ত উত্তর "${ansRaw}" কোনো অপশনের সাথে স্পষ্টভাবে মেলেনি।`,
        };
      }
    }
  }

  if (
    markedIndices.length === 1 &&
    resolvedFromAnswerLine !== undefined &&
    markedIndices[0] !== resolvedFromAnswerLine
  ) {
    return {
      hadQuizSignal: true,
      errorReason:
        "অপশনের চিহ্ন (✓/*) এবং উত্তর লাইনের উত্তর পরস্পরবিরোধী হওয়ায় বাদ দেওয়া হয়েছে।",
    };
  }

  const finalIdx =
    resolvedFromAnswerLine !== undefined
      ? resolvedFromAnswerLine
      : markedIndices[0];

  if (finalIdx === undefined || finalIdx < 0 || finalIdx >= options.length) {
    return {
      hadQuizSignal: true,
      errorReason: "সঠিক উত্তর নির্দিষ্ট করা যায়নি।",
    };
  }

  return { index: finalIdx, hadQuizSignal: true };
}

export function parseReadyPollsFromText(
  input: ParseReadyPollsInput
): ParseReadyPollsResult {
  const rawText = String(input.text ?? "").trim();
  const isBn = input.language !== "en";
  if (!rawText) {
    return {
      polls: [],
      skippedNotes: [
        isBn
          ? "কোনো প্রশ্ন বা অপশন দেওয়া হয়নি।"
          : "No question or options provided.",
      ],
      agentSummary: "",
      matchedBlocksCount: 0,
    };
  }

  const requestedMode = input.pollType ?? "auto";
  const isAnonymous = input.isAnonymous ?? true;
  const allowsMultiple = Boolean(input.allowsMultipleAnswers);
  const cleanKeywords = normalizeKeywordList(input.indexingKeywords);

  const blocks = splitIntoPollBlocks(rawText);
  const polls: PollDraft[] = [];
  const skippedNotes: string[] = [];

  blocks.forEach((block, blockIdx) => {
    const numLabel = blockIdx + 1;
    const rawQuestion = block.questionLines.join(" ").replace(/\s+/g, " ").trim();

    if (!rawQuestion) {
      if (block.options.length > 0) {
        skippedNotes.push(
          isBn
            ? `#${numLabel}: প্রশ্নের লেখা পাওয়া যায়নি।`
            : `#${numLabel}: Missing question text.`
        );
      }
      return;
    }

    if (rawQuestion.length > 300) {
      skippedNotes.push(
        isBn
          ? `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): প্রশ্ন ${rawQuestion.length} অক্ষর — টেলিগ্রামে সর্বোচ্চ ৩০০ অক্ষর অনুমোদিত।`
          : `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): Question is ${rawQuestion.length} chars (Telegram max is 300).`
      );
      return;
    }

    // Clean & dedupe options while preserving original indices via mapping
    const dedupedOptions: ParsedOptionItem[] = [];
    const seenOptions = new Set<string>();
    const rawToDedup = new Map<number, number>();
    let optionTooLongError = false;

    for (let i = 0; i < block.options.length; i++) {
      const opt = block.options[i];
      const cleanText = opt.text.replace(/\s+/g, " ").trim();
      if (!cleanText) continue;
      if (cleanText.length > 100) {
        skippedNotes.push(
          isBn
            ? `#${numLabel} ("${rawQuestion.slice(0, 30)}..."): একটি অপশন ${cleanText.length} অক্ষর — টেলিগ্রামে সর্বোচ্চ ১০০ অক্ষর অনুমোদিত।`
            : `#${numLabel} ("${rawQuestion.slice(0, 30)}..."): An option is ${cleanText.length} chars (Telegram max is 100).`
        );
        optionTooLongError = true;
        break;
      }
      const key = cleanText.toLowerCase();
      if (seenOptions.has(key)) continue;
      seenOptions.add(key);
      rawToDedup.set(i, dedupedOptions.length);
      dedupedOptions.push({ ...opt, text: cleanText });
    }

    if (optionTooLongError) return;

    if (dedupedOptions.length < 2) {
      skippedNotes.push(
        isBn
          ? `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): অন্তত ২টি আলাদা অপশন থাকতে হবে।`
          : `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): At least 2 distinct options are required.`
      );
      return;
    }

    if (dedupedOptions.length > 10) {
      skippedNotes.push(
        isBn
          ? `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): টেলিগ্রামে সর্বোচ্চ ১০টি অপশন দেওয়া যায় (${dedupedOptions.length}টি পাওয়া গেছে)।`
          : `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): Telegram supports up to 10 options (found ${dedupedOptions.length}).`
      );
      return;
    }

    // Resolve answer against original block.options first, then map through rawToDedup
    const answerCheck = resolveAnswerIndex(block, block.options);
    if (answerCheck.errorReason) {
      skippedNotes.push(
        `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): ${answerCheck.errorReason}`
      );
      return;
    }

    let resolvedType: PollType;
    let correctOptionIndex: number | undefined;

    if (requestedMode === "regular") {
      resolvedType = "regular";
    } else if (requestedMode === "quiz" || answerCheck.hadQuizSignal) {
      if (answerCheck.index === undefined) {
        skippedNotes.push(
          isBn
            ? `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): কুইজ মোডে সঠিক উত্তর ("উত্তর: খ" বা ✓) উল্লেখ করা নেই — ভুল উত্তর এড়াতে বাদ দেওয়া হয়েছে।`
            : `#${numLabel} ("${rawQuestion.slice(0, 35)}..."): Missing quiz answer key — skipped to prevent wrong answers.`
        );
        return;
      }
      const mapped = rawToDedup.get(answerCheck.index);
      const fallbackText = block.options[answerCheck.index]?.text
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const safeIndex =
        mapped !== undefined
          ? mapped
          : dedupedOptions.findIndex(
              (o) => o.text.toLowerCase() === fallbackText
            );

      if (safeIndex < 0 || safeIndex >= dedupedOptions.length) {
        skippedNotes.push(
          isBn
            ? `#${numLabel}: সঠিক উত্তরটি অপশন তালিকার সাথে মেলানো যায়নি।`
            : `#${numLabel}: Could not match correct answer to options list.`
        );
        return;
      }
      resolvedType = "quiz";
      correctOptionIndex = safeIndex;
    } else {
      resolvedType = "regular";
    }

    const rawExplanation = block.explanationLines
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (resolvedType === "quiz" && rawExplanation.length > 200) {
      skippedNotes.push(
        isBn
          ? `#${numLabel} ("${rawQuestion.slice(0, 30)}..."): ব্যাখ্যা ${rawExplanation.length} অক্ষর (সর্বোচ্চ ২০০ অক্ষর অনুমোদিত)।`
          : `#${numLabel} ("${rawQuestion.slice(0, 30)}..."): Explanation is ${rawExplanation.length} chars (Telegram max is 200).`
      );
      return;
    }

    polls.push({
      id: crypto.randomUUID(),
      question: rawQuestion,
      options: dedupedOptions.map((o) => o.text),
      type: resolvedType,
      correctOptionIndex,
      explanation: resolvedType === "quiz" ? rawExplanation : "",
      indexingKeywords: cleanKeywords.length > 0 ? cleanKeywords : undefined,
      isAnonymous,
      allowsMultipleAnswers: resolvedType === "regular" ? allowsMultiple : false,
      caption: "",
    });
  });

  const summary =
    polls.length > 0
      ? isBn
        ? `হুবহু আপনার লেখা থেকে ${polls.length}টি নির্ভুল ও উত্তর-যাচাইকৃত পোল সরাসরি প্রিভিউতে নেওয়া হয়েছে (কোনো বানান পরিবর্তন করা হয়নি)।${
            skippedNotes.length > 0
              ? ` ভুল এড়াতে ${skippedNotes.length}টি অস্পষ্ট/অসম্পূর্ণ প্রশ্ন বাদ দেওয়া হয়েছে।`
              : ""
          }`
        : `Parsed ${polls.length} verbatim poll(s) directly with verified answers (no AI rewriting).${
            skippedNotes.length > 0
              ? ` Skipped ${skippedNotes.length} item(s) due to validation checks.`
              : ""
          }`
      : isBn
        ? "প্রদত্ত লেখা থেকে কোনো সম্পূর্ণ পোল পাওয়া যায়নি।"
        : "No valid complete polls could be parsed from the input.";

  return {
    polls,
    skippedNotes,
    agentSummary: summary,
    matchedBlocksCount: blocks.length,
  };
}
