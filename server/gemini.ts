import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import crypto from "crypto";
import { normalizeKeywordList } from "./channelIndexer.ts";
import type {
  OutputFormat,
  PollCustomizationOptions,
  PollDraft,
  PollType,
} from "./types.ts";

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please check Settings > Secrets."
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return cachedClient;
}

export interface GeneratePollsInput {
  text?: string;
  file?: {
    name: string;
    mimeType: string;
    dataBase64: string;
  };
  agentInstruction?: string;
  persona?: string;
  outputFormat?: OutputFormat;
  indexingKeywords?: string[];
  pollCount: number | "all";
  pollType: "regular" | "quiz" | "auto";
  language: "bn" | "en" | "auto";
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  customization?: PollCustomizationOptions;
}

export interface GeneratePollsResult {
  agentSummary: string;
  recommendedCaption: string;
  polls: PollDraft[];
}

const POLL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    agentSummary: {
      type: Type.STRING,
      description:
        "Brief, helpful note from the personal AI agent explaining what key themes it extracted and how it crafted the verified polls/posts. Write in the same language as the output.",
    },
    skippedUnclearNotes: {
      type: Type.STRING,
      description:
        "Short summary of any unclear, blurry, incomplete, or ambiguous items ignored to prevent wrong answers. Empty string '' if everything was clear.",
    },
    recommendedCaption: {
      type: Type.STRING,
      description:
        "Optional short introductory channel message (1-2 sentences) to introduce poll(s) in Telegram. Leave empty string if unnecessary or when textPosts are already generated.",
    },
    textPosts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: "Short headline or label for the text post (<= 100 chars).",
          },
          content: {
            type: Type.STRING,
            description:
              "Full formatted Telegram channel text post body (<= 3800 chars) containing only clear, verified information.",
          },
        },
        required: ["title", "content"],
      },
      description:
        "Telegram channel text post(s). Empty array [] if only polls were requested.",
    },
    polls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: "Poll question, strictly <= 280 characters.",
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Between 2 and 6 concise answer options, each strictly <= 90 characters.",
          },
          type: {
            type: Type.STRING,
            description: "Either 'regular' or 'quiz'.",
          },
          correctOptionIndex: {
            type: Type.INTEGER,
            description:
              "0-based index of the 100% verified correct option when type is 'quiz' (use -1 if uncertain/ambiguous so it is safely skipped). Use 0 for regular polls.",
          },
          explanation: {
            type: Type.STRING,
            description:
              "Short accurate explanation shown after answering a quiz poll (<= 180 chars). Empty string for regular polls.",
          },
          verifiedAccurate: {
            type: Type.BOOLEAN,
            description:
              "True ONLY if the question, all options, and the quiz answer key (when quiz) are 100% clear and verified accurate; false if anything is blurry or uncertain.",
          },
        },
        required: [
          "question",
          "options",
          "type",
          "correctOptionIndex",
          "explanation",
          "verifiedAccurate",
        ],
      },
    },
  },
  required: [
    "agentSummary",
    "skippedUnclearNotes",
    "recommendedCaption",
    "textPosts",
    "polls",
  ],
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Track models whose daily free-tier quota is exhausted so we don't repeatedly hit 429
const modelQuotaBlockedUntil = new Map<string, number>();

function isModelQuotaBlocked(model: string): boolean {
  const until = modelQuotaBlockedUntil.get(model) ?? 0;
  if (until > Date.now()) return true;
  if (until > 0) modelQuotaBlockedUntil.delete(model);
  return false;
}

function getDailyQuotaCooldownMs(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED")) {
    return 0;
  }
  const isPerDay =
    msg.includes("PerDay") ||
    msg.includes("GenerateRequestsPerDay") ||
    msg.includes("requests per day");

  const retryMatch = msg.match(/"retryDelay"\s*:\s*"(\d+)s"/i);
  if (retryMatch) {
    const secs = Number(retryMatch[1]);
    if (secs > 60 || isPerDay) {
      return Math.min(Math.max(secs * 1000, 60_000), 24 * 60 * 60_000);
    }
  }
  if (isPerDay) {
    return 60 * 60_000;
  }
  return 0;
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.includes("PerDay") ||
    raw.includes("GenerateRequestsPerDay") ||
    raw.includes("requests per day")
  ) {
    return "ফ্রি-টিয়ার এআই মডেলের দৈনিক কোটা (Daily Limit) শেষ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন অথবা Settings > Secrets থেকে বিলিং-সক্রিয় API Key নির্বাচন করুন।";
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; message?: string; status?: string };
    };
    if (parsed?.error?.message) {
      if (parsed.error.code === 503 || parsed.error.status === "UNAVAILABLE") {
        return "Google Gemini-এর ফ্রি-টিয়ার এআই সার্ভার এই মুহূর্তে অতিরিক্ত ব্যস্ত (503 High Demand — ৫ বার চেষ্টা করেও সাড়া মেলেনি)। অনুগ্রহ করে ১০-১৫ সেকেন্ড পর আবার চেষ্টা করুন অথবা Settings > Secrets থেকে বিলিং-সক্রিয় API Key ব্যবহার করুন।";
      }
      if (parsed.error.code === 429) {
        return "এআই রেট লিমিট পূর্ণ হয়েছে (429)। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন, অথবা Settings > Secrets-এ API Key চেক করুন।";
      }
      if (parsed.error.code === 400 || parsed.error.code === 403) {
        return "Gemini API key error. Please check Settings > Secrets.";
      }
      return parsed.error.message;
    }
  } catch {
    // Not a JSON string; continue
  }
  if (raw.includes("503") || raw.includes("UNAVAILABLE")) {
    return "Google Gemini-এর ফ্রি-টিয়ার এআই সার্ভার এই মুহূর্তে অতিরিক্ত ব্যস্ত (503 High Demand — ৫ বার চেষ্টা করেও সাড়া মেলেনি)। অনুগ্রহ করে ১০-১৫ সেকেন্ড পর আবার চেষ্টা করুন অথবা Settings > Secrets থেকে বিলিং-সক্রিয় API Key ব্যবহার করুন।";
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED")) {
    return "এআই রেট লিমিট পূর্ণ হয়েছে (429)। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন, অথবা Settings > Secrets-এ API Key চেক করুন।";
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  if (getDailyQuotaCooldownMs(err) > 0) {
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("500") ||
    msg.includes("INTERNAL") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out (503)`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function callModelOnce(params: {
  model: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  contents:
    | string
    | { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
}): Promise<string> {
  const ai = getAiClient();
  const isGemini4 = params.model.startsWith("gemini-4-");
  const config: Record<string, unknown> = {
    systemInstruction: params.systemInstruction,
    responseMimeType: "application/json",
    responseSchema: params.responseSchema,
  };
  if (!isGemini4) {
    config.temperature = params.temperature ?? 0.1;
  }
  if (params.thinkingLevel) {
    config.thinkingConfig = { thinkingLevel: params.thinkingLevel };
  }

  const t0 = Date.now();
  const response = await withTimeout(
    ai.models.generateContent({
      model: params.model,
      contents: params.contents,
      config,
    }),
    params.timeoutMs,
    params.model
  );
  const text = (response.text ?? "").trim();
  if (!text) {
    throw new Error(`${params.model} returned an empty response (503)`);
  }
  console.log(
    `[Gemini] ${params.model} (${params.thinkingLevel ?? "default"}) ok in ${Date.now() - t0}ms`
  );
  return text;
}

export async function generateStructuredWithFallback(params: {
  contents:
    | string
    | { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  fastMode?: boolean;
  exhaustive?: boolean;
  thinkingLevel?: ThinkingLevel;
}): Promise<string> {
  const baseTimeoutMs = params.exhaustive ? 16_000 : 10_000;
  const maxWaves = 5;
  let lastError: unknown;
  let hydrogenAttempts = 0;

  const getThinkingFor = (model: string, wave: number): ThinkingLevel => {
    if (model === "gemini-4-hydrogen") {
      return params.thinkingLevel === ThinkingLevel.MINIMAL || !params.thinkingLevel
        ? ThinkingLevel.LOW
        : params.thinkingLevel;
    }
    if (wave >= 1) return ThinkingLevel.MINIMAL;
    return (
      params.thinkingLevel ??
      (params.exhaustive ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL)
    );
  };

  for (let wave = 0; wave < maxWaves; wave++) {
    // Prioritize gemini-3.1-flash-lite first to protect gemini-4-hydrogen's 20 RPD free-tier quota,
    // and only try gemini-4-hydrogen as fallback on up to 2 waves if not quota-blocked.
    const candidateModels: string[] = [];
    if (!isModelQuotaBlocked("gemini-3.1-flash-lite")) {
      candidateModels.push("gemini-3.1-flash-lite");
    }
    const allowHydrogenThisWave =
      !isModelQuotaBlocked("gemini-4-hydrogen") &&
      hydrogenAttempts < 2 &&
      (wave === 0 || wave === 2 || isModelQuotaBlocked("gemini-3.1-flash-lite"));
    if (allowHydrogenThisWave) {
      candidateModels.push("gemini-4-hydrogen");
    }

    if (candidateModels.length === 0) {
      break;
    }

    let waveHitRetryableError = false;

    for (const model of candidateModels) {
      if (model === "gemini-4-hydrogen") {
        hydrogenAttempts += 1;
      }
      try {
        return await callModelOnce({
          model,
          thinkingLevel: getThinkingFor(model, wave),
          contents: params.contents,
          systemInstruction: params.systemInstruction,
          responseSchema: params.responseSchema,
          timeoutMs: baseTimeoutMs + wave * 3500,
        });
      } catch (err) {
        lastError = err;
        const dailyMs = getDailyQuotaCooldownMs(err);
        if (dailyMs > 0) {
          modelQuotaBlockedUntil.set(model, Date.now() + dailyMs);
          console.warn(
            `[Gemini] ${model} daily quota reached; pausing calls to ${model} for ${Math.round(
              dailyMs / 60_000
            )}m and using fallback.`
          );
          waveHitRetryableError = true;
          continue;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[Gemini] ${model} attempt failed: ${errMsg.slice(0, 180)}`);

        if (!isTransientError(err)) {
          throw new Error(formatGeminiError(err));
        }
        waveHitRetryableError = true;
      }
    }

    if (!waveHitRetryableError || wave === maxWaves - 1) {
      break;
    }

    // Abort early only if no unblocked model remains
    if (
      isModelQuotaBlocked("gemini-3.1-flash-lite") &&
      (hydrogenAttempts >= 2 || isModelQuotaBlocked("gemini-4-hydrogen"))
    ) {
      break;
    }

    const backoffMs =
      Math.min(800 * Math.pow(1.65, wave), 4000) + Math.floor(Math.random() * 450);
    await sleep(backoffMs);
  }

  throw new Error(formatGeminiError(lastError ?? new Error("Gemini request failed.")));
}

async function generateWithRetryAndFallback(params: {
  contents:
    | string
    | { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> };
  systemInstruction: string;
  fastMode?: boolean;
  exhaustive?: boolean;
  thinkingLevel?: ThinkingLevel;
}): Promise<string> {
  return generateStructuredWithFallback({
    ...params,
    responseSchema: POLL_RESPONSE_SCHEMA,
  });
}

export function parseJsonSafePublic(rawText: string): Record<string, unknown> {
  return parseJsonSafe(rawText);
}

function parseJsonSafe(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{}") as Record<string, unknown>;
}

const UNCERTAIN_MARKER_RE =
  /(\[unclear\]|\[অস্পষ্ট\]|\[illegible\]|\[ambiguous\]|cannot determine|not enough information|নিশ্চিত ন[য়য়]|অস্পষ্ট তথ্য|তথ্য অস্পষ্ট)/i;

function sanitizePolls(
  rawPolls: Array<{
    question?: string;
    options?: string[];
    type?: string;
    correctOptionIndex?: number;
    explanation?: string;
    verifiedAccurate?: boolean;
  }>,
  defaults: {
    pollType: "regular" | "quiz" | "auto";
    isAnonymous: boolean;
    allowsMultipleAnswers: boolean;
  }
): PollDraft[] {
  const results: PollDraft[] = [];

  for (const p of rawPolls) {
    if (p.verifiedAccurate === false) continue;
    const question = String(p.question ?? "").trim().slice(0, 300);
    if (!question || UNCERTAIN_MARKER_RE.test(question)) continue;
    if (!Array.isArray(p.options)) continue;

    // Preserve distinct options in order while keeping correctOptionIndex aligned
    const rawOptions = p.options.map((o) => String(o).trim().slice(0, 100));
    if (rawOptions.some((o) => UNCERTAIN_MARKER_RE.test(o))) continue;

    const dedupedOptions: string[] = [];
    const seenOpts = new Set<string>();
    const rawToDedupIdx = new Map<number, number>();
    rawOptions.forEach((opt, origIdx) => {
      if (!opt) return;
      const key = opt.toLowerCase();
      if (seenOpts.has(key)) return;
      seenOpts.add(key);
      rawToDedupIdx.set(origIdx, dedupedOptions.length);
      dedupedOptions.push(opt);
    });

    if (dedupedOptions.length < 2 || dedupedOptions.length > 10) continue;

    const resolvedType: PollType =
      defaults.pollType === "auto"
        ? p.type === "quiz"
          ? "quiz"
          : "regular"
        : defaults.pollType;

    let safeCorrectIdx: number | undefined;
    if (resolvedType === "quiz") {
      const origIdx = Number(p.correctOptionIndex);
      if (
        !Number.isInteger(origIdx) ||
        origIdx < 0 ||
        origIdx >= rawOptions.length
      ) {
        // Never guess or clamp an uncertain quiz answer to index 0
        continue;
      }
      const mapped = rawToDedupIdx.get(origIdx);
      if (mapped === undefined) {
        const targetKey = rawOptions[origIdx]?.toLowerCase();
        const fallbackIdx = dedupedOptions.findIndex(
          (o) => o.toLowerCase() === targetKey
        );
        if (fallbackIdx < 0) continue;
        safeCorrectIdx = fallbackIdx;
      } else {
        safeCorrectIdx = mapped;
      }
    }

    results.push({
      id: crypto.randomUUID(),
      question,
      options: dedupedOptions,
      type: resolvedType,
      correctOptionIndex: safeCorrectIdx,
      explanation:
        resolvedType === "quiz" && p.explanation
          ? String(p.explanation).trim().slice(0, 200)
          : "",
      isAnonymous: defaults.isAnonymous,
      allowsMultipleAnswers:
        resolvedType === "regular" ? defaults.allowsMultipleAnswers : false,
      caption: "",
    });
  }

  return results;
}

function sanitizeTextPosts(
  rawPosts: Array<{
    title?: string;
    content?: string;
  }>
): PollDraft[] {
  return rawPosts
    .filter((p) => {
      const content = String(p.content ?? "").trim();
      const title = String(p.title ?? "").trim();
      if (!content) return false;
      if (UNCERTAIN_MARKER_RE.test(content) || UNCERTAIN_MARKER_RE.test(title)) {
        return false;
      }
      return true;
    })
    .map((p) => {
      const content = String(p.content ?? "").trim().slice(0, 4096);
      const firstLine = content.split("\n")[0]?.trim() || content;
      const headline = (p.title ? String(p.title).trim() : firstLine).slice(0, 120);
      return {
        id: crypto.randomUUID(),
        question: headline,
        options: [],
        type: "text" as PollType,
        postText: content,
        isAnonymous: false,
        allowsMultipleAnswers: false,
        caption: "",
      };
    });
}

function formatHashtagsLine(keywords: string[]): string {
  const clean = normalizeKeywordList(keywords);
  if (clean.length === 0) return "";
  return clean
    .map((kw) => `#${kw.replace(/^#/, "").replace(/\s+/g, "_")}`)
    .join(" ");
}

function appendMissingHashtags(text: string, keywords: string[], maxLen: number): string {
  const clean = normalizeKeywordList(keywords);
  if (clean.length === 0) return text.slice(0, maxLen);
  const lower = text.toLowerCase();
  const missing = clean
    .map((kw) => `#${kw.replace(/^#/, "").replace(/\s+/g, "_")}`)
    .filter((tag) => !lower.includes(tag.toLowerCase()));
  if (missing.length === 0) return text.slice(0, maxLen);
  const suffix = `\n\n${missing.join(" ")}`;
  if (text.length + suffix.length <= maxLen) {
    return `${text}${suffix}`;
  }
  return `${text.slice(0, Math.max(0, maxLen - suffix.length))}${suffix}`.slice(
    0,
    maxLen
  );
}

const BN_NUMBERS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBnDigits(n: number): string {
  return String(n)
    .split("")
    .map((c) => (c >= "0" && c <= "9" ? BN_NUMBERS[Number(c)] : c))
    .join("");
}

function shufflePollOptionsSafely(poll: PollDraft): PollDraft {
  if (poll.options.length < 2) return poll;
  const tagged = poll.options.map((text, idx) => ({
    text,
    isCorrect: poll.type === "quiz" && poll.correctOptionIndex === idx,
  }));
  for (let i = tagged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tagged[i], tagged[j]] = [tagged[j], tagged[i]];
  }
  const newCorrectIdx =
    poll.type === "quiz" ? tagged.findIndex((item) => item.isCorrect) : undefined;
  return {
    ...poll,
    options: tagged.map((t) => t.text),
    correctOptionIndex:
      poll.type === "quiz" && newCorrectIdx !== undefined && newCorrectIdx >= 0
        ? newCorrectIdx
        : poll.correctOptionIndex,
  };
}

function applyQuestionCustomization(
  question: string,
  index: number,
  customization?: PollCustomizationOptions
): string {
  if (!customization) return question;
  const parts: string[] = [];
  const customPrefix = (customization.questionPrefix || "").trim();
  if (customPrefix) {
    parts.push(customPrefix);
  }
  if (customization.numberingStyle === "bn") {
    parts.push(`${toBnDigits(index + 1)}.`);
  } else if (customization.numberingStyle === "en") {
    parts.push(`${index + 1}.`);
  }
  if (parts.length === 0) return question;
  // Avoid duplicating existing prefix/numbering if question already starts with it
  const prefixStr = `${parts.join(" ")} `;
  if (question.startsWith(prefixStr.trim())) return question;
  return `${prefixStr}${question}`.trim().slice(0, 300);
}

export async function generatePollsWithAgent(
  input: GeneratePollsInput
): Promise<GeneratePollsResult> {
  const outputFormat: OutputFormat = input.outputFormat ?? "polls";
  const isAll = input.pollCount === "all" || input.pollCount === 0;
  const count = isAll ? 0 : Math.min(Math.max(1, Number(input.pollCount) || 1), 40);
  const cleanKeywords = normalizeKeywordList(input.indexingKeywords);
  const hashtagsHint = formatHashtagsLine(cleanKeywords);

  if (outputFormat === "image_post") {
    if (!input.file?.dataBase64 || !input.file.mimeType.startsWith("image/")) {
      throw new Error(
        input.language === "en"
          ? "Please upload an image first to create an image post (AI image generation requires a paid API key)."
          : "ছবি পোস্ট তৈরি করতে অনুগ্রহ করে আগে একটি ছবি আপলোড করুন (নতুন এআই ছবি জেনারেট করতে Paid API Key প্রয়োজন হয়)।"
      );
    }
  }

  const languageDirective =
    input.language === "bn"
      ? "Write all questions, options, explanations, text posts, captions, and agentSummary in natural, idiomatic Bengali (বাংলা)."
      : input.language === "en"
        ? "Write all questions, options, explanations, text posts, captions, and agentSummary in clear English."
        : "Match the primary language of the user's input source (Bengali if the input/instruction is in Bengali, English if in English).";

  const typeDirective =
    input.pollType === "quiz"
      ? "Every poll MUST be type 'quiz' with a factually accurate correctOptionIndex and a concise explanation."
      : input.pollType === "regular"
        ? "Every poll MUST be type 'regular' (opinion/engagement poll, no right or wrong answer)."
        : "Choose 'quiz' if the source material is educational, factual, or study-oriented; choose 'regular' if it is discussion, news, feedback, or opinion-oriented.";

  let formatDirective = "";
  if (outputFormat === "image_post") {
    formatDirective = [
      "OUTPUT MODE: IMAGE POST CAPTION. Write 1 crisp, engaging Telegram photo caption in 'textPosts[0]' (with a short descriptive label in 'title' <= 90 chars and the Telegram photo caption in 'content' <= 950 chars). Leave 'polls' as [].",
      "Describe or complement the attached photo naturally for Telegram channel readers. Keep it under 950 characters so it fits Telegram's 1024-char photo caption limit.",
    ].join("\n");
  } else if (outputFormat === "text_post") {
    const postCount = isAll ? 1 : Math.min(Math.max(1, count), 10);
    formatDirective = [
      `OUTPUT MODE: TEXT POST ONLY. Generate ${postCount} engaging, well-structured Telegram channel text post(s) in 'textPosts' and leave 'polls' as [].`,
      "Format each text post cleanly for Telegram readers (clear headline/hook, readable paragraphs or bullet points, relevant emojis/hashtags if helpful, <= 3800 chars). Do NOT wrap text in broken Markdown syntax.",
    ].join("\n");
  } else if (outputFormat === "both") {
    const pollDirective = isAll
      ? "ALL possible distinct, non-duplicate Telegram polls (up to 35 polls) from the entire source"
      : `${count} distinct Telegram poll(s)`;
    formatDirective = [
      `OUTPUT MODE: BOTH TEXT POST AND POLLS. Generate 1 cohesive, well-formatted Telegram channel text post in 'textPosts' summarizing or introducing the topic, AND generate ${pollDirective} in 'polls'.`,
      typeDirective,
      "Strict Telegram Poll limits: each question <= 280 chars; 2 to 6 options <= 90 chars; quiz explanation <= 180 chars.",
    ].join("\n");
  } else {
    const countDirective = isAll
      ? "Analyze the ENTIRE source thoroughly (every page, paragraph, question, and key point) and generate ALL possible distinct, non-duplicate Telegram polls (up to 40 polls if the source supports it—never stop at 2 or 3 if more distinct questions or topics exist). If the source is a question bank or MCQ list, extract EVERY question."
      : `Generate exactly ${count} distinct Telegram poll(s).`;
    formatDirective = [
      "OUTPUT MODE: POLLS ONLY. Populate 'polls' and leave 'textPosts' as [].",
      typeDirective,
      countDirective,
      "Strict Telegram Bot API limits: each question <= 280 characters; 2 to 6 options per poll; each option <= 90 characters; quiz explanation <= 180 characters.",
      "Make options distinct, balanced, and non-overlapping.",
    ].join("\n");
  }

  const keywordDirective = hashtagsHint
    ? `KEYWORD INDEXING TAGS: Include these search/index hashtags cleanly at the end of generated posts or captions: ${hashtagsHint}`
    : "";

  const cust = input.customization;
  const customLines: string[] = [];
  if (
    cust?.optionsPerPoll &&
    cust.optionsPerPoll !== "auto" &&
    Number(cust.optionsPerPoll) >= 2 &&
    Number(cust.optionsPerPoll) <= 6
  ) {
    customLines.push(
      `EXACT OPTION COUNT: Every poll MUST have EXACTLY ${Number(
        cust.optionsPerPoll
      )} distinct answer options.`
    );
  }
  if (cust?.difficulty && cust.difficulty !== "auto") {
    const diffDesc =
      cust.difficulty === "easy"
        ? "EASY / foundational level (clear, direct recall questions with straightforward distractors)."
        : cust.difficulty === "medium"
          ? "MEDIUM / standard practice level (balanced conceptual understanding and plausible distractors)."
          : "HARD / competitive exam (BCS / university admission) level with subtle, clever distractors—still 100% factually verifiable.";
    customLines.push(`DIFFICULTY LEVEL: ${diffDesc}`);
  }
  if (cust?.tone && cust.tone !== "auto") {
    const toneDesc =
      cust.tone === "exam"
        ? "Formal academic / exam-paper phrasing."
        : cust.tone === "engaging"
          ? "Engaging, conversational Telegram community style."
          : "Ultra-concise, crisp phrasing with no unnecessary words.";
    customLines.push(`TONE & STYLE: ${toneDesc}`);
  }
  if (cust?.explanationMode === "include") {
    customLines.push(
      "EXPLANATION REQUIREMENT: For every quiz poll, include a brief, clear, verified 1-sentence explanation (<= 180 chars)."
    );
  } else if (cust?.explanationMode === "omit") {
    customLines.push(
      "EXPLANATION REQUIREMENT: Leave 'explanation' as an empty string '' for all polls."
    );
  }
  if (cust?.sourceFidelity === "strict_verbatim") {
    customLines.push(
      "SOURCE FIDELITY (STRICT): Preserve the wording/questions from the user's source material as closely as possible without rewriting or paraphrasing unnecessarily; only structure into valid Telegram polls within character limits."
    );
  }
  const customizationDirective =
    customLines.length > 0
      ? `USER CUSTOMIZATION PREFERENCES:\n${customLines.join("\n")}`
      : "";

  const STRICT_ACCURACY_POLICY = [
    "STRICT ACCURACY & ZERO-GUESSING POLICY (CRITICAL):",
    "1. ZERO WRONG ANSWERS: Double-check every factual claim, calculation, grammar point, option, and answer key BEFORE outputting. Verify that options[correctOptionIndex] is 100% factually correct and matches the explanation cleanly.",
    "2. IGNORE UNCLEAR OR AMBIGUOUS CONTENT: If ANY question, handwriting, blurry/cut-off image region, scanned table, option, or detail in the source is unclear, incomplete, contradictory, or ambiguous, COMPLETELY SKIP IT. Never guess missing words, never hallucinate facts, and never invent unverified numbers, dates, or claims.",
    "3. QUIZ VERIFICATION GATE: Only emit a quiz poll if you are 100% certain of the single correct answer. If an MCQ's correct answer cannot be confirmed with 100% certainty, skip it completely (or set verifiedAccurate=false and correctOptionIndex=-1). NEVER mark an uncertain or wrong option as correct.",
    "4. MESSAGES & CAPTIONS: Only write statements that are 100% clear from the source/image or verified truth; omit anything doubtful and briefly note ignored unclear sections in 'skippedUnclearNotes'.",
    "5. NO UNRELATED FALLBACK CONTENT: Strictly use ONLY the clear facts/questions from the provided source or user prompt. If the ENTIRE source/file is blurry, unreadable, or ambiguous, return empty arrays (polls: [], textPosts: []) and explain in 'skippedUnclearNotes'—NEVER invent unrelated general-knowledge fallback polls or filler text.",
  ].join("\n");

  const systemInstruction = [
    input.persona ||
      "You are a personal Telegram AI Agent specializing in turning documents, images, and notes into engaging Telegram polls, image captions, and channel text posts.",
    languageDirective,
    formatDirective,
    customizationDirective,
    keywordDirective,
    STRICT_ACCURACY_POLICY,
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (input.file && input.file.dataBase64) {
    parts.push({
      inlineData: {
        mimeType: input.file.mimeType,
        data: input.file.dataBase64,
      },
    });
  }

  const promptSegments: string[] = [];
  if (input.text && input.text.trim()) {
    promptSegments.push(`Source content:\n${input.text.trim()}`);
  } else if (input.file) {
    promptSegments.push(
      outputFormat === "image_post"
        ? `Inspect the attached image (${input.file.name}) and write a clear, engaging Telegram photo caption (<= 950 chars) for channel readers using only clearly visible details.`
        : outputFormat === "text_post"
          ? `Analyze the attached file (${input.file.name}) and write a clear, engaging Telegram channel text post based strictly on clear, verified information in it.`
          : `Analyze the attached file (${input.file.name}) and extract all clearly readable, verified content for Telegram, skipping anything blurry or ambiguous.`
    );
  }

  if (input.agentInstruction && input.agentInstruction.trim()) {
    promptSegments.push(
      `Personal agent instructions from user:\n${input.agentInstruction.trim()}`
    );
  }

  if (promptSegments.length === 0) {
    throw new Error("Please provide text, an image, or a PDF document.");
  }

  parts.push({ text: promptSegments.join("\n\n") });

  const rawText = await generateWithRetryAndFallback({
    contents: { parts },
    systemInstruction,
    fastMode: !input.file?.dataBase64 || outputFormat === "image_post",
    thinkingLevel: ThinkingLevel.LOW,
    exhaustive:
      outputFormat !== "text_post" &&
      outputFormat !== "image_post" &&
      (isAll || count > 4 || Boolean(input.file?.dataBase64)),
  });

  const parsed = parseJsonSafe(rawText) as {
    agentSummary?: string;
    skippedUnclearNotes?: string;
    recommendedCaption?: string;
    textPosts?: Array<{ title?: string; content?: string }>;
    polls?: Array<{
      question?: string;
      options?: string[];
      type?: string;
      correctOptionIndex?: number;
      explanation?: string;
      verifiedAccurate?: boolean;
    }>;
  };

  const skippedNote = (parsed.skippedUnclearNotes || "").trim();
  const formatSummaryWithSkipped = (baseSummary: string) => {
    if (!skippedNote) return baseSummary;
    const prefix =
      input.language === "en"
        ? "Ignored unclear/ambiguous items:"
        : "অস্পষ্ট বা অনিশ্চিত হওয়ায় বাদ দেওয়া হয়েছে:";
    return baseSummary
      ? `${baseSummary}\n\nℹ️ ${prefix} ${skippedNote}`
      : `ℹ️ ${prefix} ${skippedNote}`;
  };

  if (outputFormat === "image_post" && input.file) {
    const first = (parsed.textPosts ?? [])[0];
    const rawCaption = (first?.content || input.text || parsed.recommendedCaption || "").trim();
    const finalCaption = appendMissingHashtags(rawCaption, cleanKeywords, 1024);
    const title = (
      first?.title ||
      finalCaption.split("\n")[0] ||
      input.file.name ||
      "Photo Post"
    )
      .trim()
      .slice(0, 120);

    const imageDraft: PollDraft = {
      id: crypto.randomUUID(),
      question: title,
      options: [],
      type: "image",
      postText: finalCaption,
      imageBase64: input.file.dataBase64,
      imageMimeType: input.file.mimeType,
      imageName: input.file.name,
      indexingKeywords: cleanKeywords.length > 0 ? cleanKeywords : undefined,
      isAnonymous: false,
      allowsMultipleAnswers: false,
      caption: finalCaption,
    };

    return {
      agentSummary: formatSummaryWithSkipped(parsed.agentSummary || ""),
      recommendedCaption: "",
      polls: [imageDraft],
    };
  }

  const textDrafts =
    outputFormat === "polls"
      ? []
      : sanitizeTextPosts(parsed.textPosts ?? []).map((d) => ({
          ...d,
          postText: appendMissingHashtags(
            d.postText || d.question,
            cleanKeywords,
            4096
          ),
          indexingKeywords: cleanKeywords.length > 0 ? cleanKeywords : undefined,
        }));

  const polls =
    outputFormat === "text_post"
      ? []
      : sanitizePolls(parsed.polls ?? [], {
          pollType: input.pollType,
          isAnonymous: input.isAnonymous,
          allowsMultipleAnswers: input.allowsMultipleAnswers,
        }).map((d, idx) => {
          let customized: PollDraft = {
            ...d,
            question: applyQuestionCustomization(d.question, idx, cust),
            explanation: cust?.explanationMode === "omit" ? "" : d.explanation,
            indexingKeywords:
              cleanKeywords.length > 0 ? cleanKeywords : undefined,
          };
          if (cust?.shuffleOptions) {
            customized = shufflePollOptionsSafely(customized);
          }
          return customized;
        });

  const combined = [...textDrafts, ...polls];

  if (combined.length === 0) {
    if (skippedNote) {
      throw new Error(
        input.language === "en"
          ? `No output created because all detected parts were unclear or ambiguous: ${skippedNote}`
          : `তথ্যগুলো অস্পষ্ট বা অনিশ্চিত হওয়ায় ভুল এড়াতে কোনো পোল বা পোস্ট তৈরি করা হয়নি (${skippedNote})। অনুগ্রহ করে আরও স্পষ্ট তথ্য দিন।`
      );
    }
    throw new Error(
      outputFormat === "text_post"
        ? "The AI agent could not craft a verified text post from this input. Try adding clearer context."
        : "The AI agent could not extract verified polls from this input. Try adding clearer context."
    );
  }

  let recommendedCaption =
    outputFormat === "polls" ? parsed.recommendedCaption || "" : "";
  if (recommendedCaption && cleanKeywords.length > 0) {
    recommendedCaption = appendMissingHashtags(
      recommendedCaption,
      cleanKeywords,
      1024
    );
  }

  return {
    agentSummary: formatSummaryWithSkipped(parsed.agentSummary || ""),
    recommendedCaption,
    polls: combined,
  };
}

const REFINE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    agentSummary: {
      type: Type.STRING,
    },
    skippedUnclearNotes: {
      type: Type.STRING,
      description:
        "Short note listing any unclear/ambiguous items ignored during refinement (empty string '' if none).",
    },
    textPosts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          content: { type: Type.STRING },
        },
        required: ["title", "content"],
      },
    },
    imagePosts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          caption: { type: Type.STRING },
        },
        required: ["title", "caption"],
      },
      description:
        "Refined photo captions matching original imagePosts in order. Each caption <= 980 chars.",
    },
    polls: POLL_RESPONSE_SCHEMA.properties.polls,
  },
  required: [
    "agentSummary",
    "skippedUnclearNotes",
    "textPosts",
    "imagePosts",
    "polls",
  ],
};

export async function refinePollsWithAgent(input: {
  polls: PollDraft[];
  instruction: string;
  language: "bn" | "en" | "auto";
  persona?: string;
}): Promise<{ agentSummary: string; polls: PollDraft[] }> {
  const languageDirective =
    input.language === "bn"
      ? "Output items and agentSummary in Bengali (বাংলা) unless the refinement explicitly asks for another language."
      : input.language === "en"
        ? "Output items and agentSummary in English unless the refinement explicitly asks for another language."
        : "Preserve or match the user's requested language.";

  const systemInstruction = [
    input.persona || "You are a personal Telegram channel AI agent.",
    languageDirective,
    "Apply the user's refinement instruction to the current drafts (textPosts, imagePosts captions, and/or polls). Keep textPosts <= 3800 chars, imagePosts captions <= 980 chars, and polls within Telegram limits (question <= 280 chars, 2-8 options each <= 90 chars, explanation <= 180 chars).",
    "STRICT ACCURACY & ZERO-GUESSING POLICY: Verify every single quiz answer (correctOptionIndex) and message fact is 100% accurate. Never introduce unverified claims or wrong answers; if any requested detail is ambiguous or uncertain, omit/ignore it instead of guessing.",
    "Preserve each item's format (textPosts vs imagePosts vs polls) unless the user explicitly asks to convert between text posts and polls.",
  ].join("\n");

  const originalTexts = input.polls.filter((p) => p.type === "text");
  const originalImages = input.polls.filter((p) => p.type === "image");
  const originalPolls = input.polls.filter(
    (p) => p.type !== "text" && p.type !== "image"
  );

  const textItems = originalTexts.map((p) => ({
    title: p.question,
    content: p.postText || p.question,
  }));
  const imageItems = originalImages.map((p) => ({
    title: p.question,
    imageName: p.imageName || "photo.jpg",
    caption: p.postText || p.caption || "",
  }));
  const pollItems = originalPolls.map((p) => ({
    question: p.question,
    options: p.options,
    type: p.type,
    correctOptionIndex: p.correctOptionIndex ?? 0,
    explanation: p.explanation ?? "",
  }));

  const contents = `Current drafts (JSON):\n${JSON.stringify(
    { textPosts: textItems, imagePosts: imageItems, polls: pollItems },
    null,
    2
  )}\n\nUser refinement command:\n${input.instruction}`;

  const rawText = await generateStructuredWithFallback({
    contents,
    systemInstruction,
    responseSchema: REFINE_RESPONSE_SCHEMA,
    fastMode: true,
    thinkingLevel: ThinkingLevel.LOW,
  });

  const parsed = parseJsonSafe(rawText) as {
    agentSummary?: string;
    skippedUnclearNotes?: string;
    textPosts?: Array<{ title?: string; content?: string }>;
    imagePosts?: Array<{ title?: string; caption?: string }>;
    polls?: Array<{
      question?: string;
      options?: string[];
      type?: string;
      correctOptionIndex?: number;
      explanation?: string;
      verifiedAccurate?: boolean;
    }>;
  };

  const refinedTexts = sanitizeTextPosts(parsed.textPosts ?? []).map((d, i) => ({
    ...d,
    indexingKeywords: originalTexts[i]?.indexingKeywords,
  }));

  const refinedImages: PollDraft[] = originalImages.map((orig, idx) => {
    const upd = (parsed.imagePosts ?? [])[idx];
    const candidateCap = (upd?.caption ?? "").trim();
    const safeCap =
      candidateCap && !UNCERTAIN_MARKER_RE.test(candidateCap)
        ? candidateCap
        : (orig.postText ?? orig.caption ?? "").trim();
    const nextCap = safeCap.slice(0, 1024);
    const nextTitle = (
      upd?.title ||
      orig.question ||
      nextCap.split("\n")[0] ||
      orig.imageName ||
      "Photo Post"
    )
      .trim()
      .slice(0, 120);
    return {
      ...orig,
      question: nextTitle,
      postText: nextCap,
      caption: nextCap,
    };
  });

  const firstOriginalPoll = originalPolls[0];
  const refinedPolls = sanitizePolls(parsed.polls ?? [], {
    pollType: "auto",
    isAnonymous: firstOriginalPoll?.isAnonymous ?? true,
    allowsMultipleAnswers: firstOriginalPoll?.allowsMultipleAnswers ?? false,
  }).map((d, i) => ({
    ...d,
    indexingKeywords:
      originalPolls[i]?.indexingKeywords ?? firstOriginalPoll?.indexingKeywords,
  }));

  const combined = [...refinedImages, ...refinedTexts, ...refinedPolls];

  if (combined.length === 0) {
    throw new Error(
      "Could not apply refinement cleanly without risking accuracy. Please rephrase with clearer details."
    );
  }

  const skippedNote = (parsed.skippedUnclearNotes || "").trim();
  const baseSummary = parsed.agentSummary || "";
  const finalSummary = skippedNote
    ? `${baseSummary ? `${baseSummary}\n\n` : ""}ℹ️ ${
        input.language === "en"
          ? "Ignored unclear/ambiguous items:"
          : "অস্পষ্ট বা অনিশ্চিত হওয়ায় বাদ দেওয়া হয়েছে:"
      } ${skippedNote}`
    : baseSummary;

  return {
    agentSummary: finalSummary,
    polls: combined,
  };
}
