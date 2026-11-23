import crypto from "crypto";
import { ThinkingLevel, Type } from "@google/genai";
import { normalizeKeywordList } from "./channelIndexer.ts";
import {
  generateStructuredWithFallback,
  parseJsonSafePublic,
} from "./gemini.ts";
import { parseReadyPollsFromText } from "./directPollParser.ts";
import {
  addJobs,
  listJobs,
  readStore,
  updateConfig,
  updateJob,
} from "./store.ts";
import type {
  PollDraft,
  PollType,
  ScheduledPollJob,
  SourceKind,
  TelegramDialogSummary,
} from "./types.ts";

export interface AgentAttachment {
  name: string;
  mimeType: string;
  dataBase64: string;
  sourceKind: SourceKind;
}

export type ChannelVerifyResult =
  | { ok: true; channelId: string; channelTitle: string; channelType: string }
  | { ok: false; error: string };

export type ChannelIndexResult =
  | {
      ok: true;
      channelId: string;
      channelTitle: string;
      channelUsername?: string;
      indexText: string;
      matchedCount: number;
    }
  | { ok: false; error: string };

export interface TelegramAgentTurnInput {
  chatId: string;
  userText: string;
  file?: AgentAttachment;
  dispatchPollFn: (
    channelId: string | undefined,
    poll: PollDraft
  ) => Promise<{ messageId: number; channelUsed: string }>;
  sendReplyTextFn: (text: string) => Promise<void>;
  sendPreviewPollFn: (poll: PollDraft) => Promise<void>;
  listChannelsFn?: () => Promise<TelegramDialogSummary[]>;
  resolveAndVerifyChannelFn?: (
    identifier: string
  ) => Promise<ChannelVerifyResult>;
  indexChannelFn?: (
    targetChannel: string,
    keywords: string[]
  ) => Promise<ChannelIndexResult>;
}

interface ChatSessionState {
  history: Array<{ role: "user" | "agent"; text: string }>;
  drafts: PollDraft[];
  lastSourceKind: SourceKind;
  lastSourceLabel: string;
  lastFile?: AgentAttachment;
  lastChannels?: TelegramDialogSummary[];
}

const chatStates = new Map<string, ChatSessionState>();

function getChatState(chatId: string): ChatSessionState {
  let state = chatStates.get(chatId);
  if (!state) {
    state = {
      history: [],
      drafts: [],
      lastSourceKind: "text",
      lastSourceLabel: "Telegram chat",
    };
    chatStates.set(chatId, state);
  }
  return state;
}

const AGENT_BRAIN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      description:
        "One of: 'chat', 'generate_polls', 'generate_text_posts', 'generate_image_post', 'generate_content', 'index_channel', 'search_channel', 'refine_polls', 'post_to_channel', 'schedule_polls', 'list_schedules', 'cancel_schedule', 'resume_schedule', 'reschedule_job', 'trigger_scheduled_now', 'list_channels', 'set_target_channel', 'clear_drafts'.",
    },
    replyText: {
      type: Type.STRING,
      description:
        "Concise, natural response in the user's language (Bengali or English) to send in the Telegram group.",
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
      description:
        "Populated when action is 'generate_text_posts', 'generate_content', or 'refine_polls' for text post drafts. Each content <= 3800 chars, formatted cleanly for Telegram channel readers.",
    },
    polls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          type: { type: Type.STRING },
          correctOptionIndex: {
            type: Type.INTEGER,
            description:
              "0-based index of the 100% verified correct answer when type is 'quiz'. Use -1 if unsure (will be skipped). Use 0 for 'regular'.",
          },
          explanation: { type: Type.STRING },
          caption: { type: Type.STRING },
          verifiedAccurate: {
            type: Type.BOOLEAN,
            description:
              "True ONLY if the question, options, and answer are 100% clear from source and factually verified with zero guesswork. Set false if ANY part is blurry or ambiguous.",
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
      description:
        "Populated ONLY when action is 'generate_polls', 'generate_content', or 'refine_polls' for poll drafts. Each question <= 280 chars, 2-6 distinct options <= 90 chars each.",
    },
    skippedUnclearNotes: {
      type: Type.STRING,
      description:
        "Short note about any blurry, unclear, or ambiguous items ignored/skipped so no wrong answer is created. Empty string if everything was clear.",
    },
    imageCaption: {
      type: Type.STRING,
      description:
        "Caption for the attached/uploaded photo (<= 980 chars) using ONLY clearly visible/verified info when action is 'generate_image_post' or refining an image draft. Empty string otherwise.",
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Keyword list when user asks to index or search channel posts (action 'index_channel' or 'search_channel'), or hashtags requested for indexing.",
    },
    indexingKeywordsTag: {
      type: Type.STRING,
      description:
        "Optional space-separated hashtag string (e.g. '#BCS #Notice') to append to generated posts/captions if user requested keyword tagging. Empty string otherwise.",
    },
    alsoPostNow: {
      type: Type.BOOLEAN,
      description:
        "True if user asked to create/write/index AND immediately post polls, text posts, or image posts to the target channel in the same message.",
    },
    scheduleAtIso: {
      type: Type.STRING,
      description:
        "ISO 8601 UTC timestamp (e.g. 2026-11-18T15:00:00.000Z) when scheduling or rescheduling. Empty string if not scheduling.",
    },
    intervalMinutes: {
      type: Type.INTEGER,
      description:
        "Minutes between items when scheduling multiple polls/posts (default 0 or 15).",
    },
    pollIndices: {
      type: Type.ARRAY,
      items: { type: Type.INTEGER },
      description:
        "0-based indices of current drafts to post/schedule. Empty array [] applies to all current drafts.",
    },
    cancelJobId: {
      type: Type.STRING,
      description:
        "Job ID to cancel/pause when action is 'cancel_schedule'. Empty string otherwise.",
    },
    targetJobId: {
      type: Type.STRING,
      description:
        "Job ID (or 1-based schedule list index string) for 'resume_schedule', 'reschedule_job', 'trigger_scheduled_now', or 'cancel_schedule'. Empty string otherwise.",
    },
    targetChannelIdentifier: {
      type: Type.STRING,
      description:
        "Channel @username, numeric ID, title, or 1-based list number when action is 'set_target_channel'. Empty string otherwise.",
    },
    targetChannelOverride: {
      type: Type.STRING,
      description:
        "Channel or group @username, t.me link, numeric ID, title, or 1-based list number if the user specifically named a channel/group to post, schedule, or index (e.g. '@MyChannel', 'https://t.me/mission_campus', 'BCS Group'). Empty string if using the default channel.",
    },
  },
  required: [
    "action",
    "replyText",
    "textPosts",
    "polls",
    "skippedUnclearNotes",
    "imageCaption",
    "keywords",
    "indexingKeywordsTag",
    "alsoPostNow",
    "scheduleAtIso",
    "intervalMinutes",
    "pollIndices",
    "cancelJobId",
    "targetJobId",
    "targetChannelIdentifier",
    "targetChannelOverride",
  ],
};

function appendTagLine(text: string, tagStr?: string, maxLen = 4096): string {
  const cleanTag = (tagStr || "").trim();
  if (!cleanTag) return text.slice(0, maxLen);
  const tags = cleanTag
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
  if (tags.length === 0) return text.slice(0, maxLen);
  const lower = text.toLowerCase();
  const missing = tags.filter((t) => !lower.includes(t.toLowerCase()));
  if (missing.length === 0) return text.slice(0, maxLen);
  const suffix = `\n\n${missing.join(" ")}`;
  if (text.length + suffix.length <= maxLen) return `${text}${suffix}`;
  return `${text.slice(0, Math.max(0, maxLen - suffix.length))}${suffix}`.slice(
    0,
    maxLen
  );
}

const BRAIN_UNCERTAIN_RE =
  /(\[unclear\]|\[অস্পষ্ট\]|\[illegible\]|\[ambiguous\]|cannot determine|not enough information|নিশ্চিত ন[য়য়]|অস্পষ্ট তথ্য|তথ্য অস্পষ্ট)/i;

function sanitizeBrainTextPosts(
  raw: Array<{ title?: string; content?: string }>,
  indexingKeywordsTag?: string,
  keywordsArr?: string[]
): PollDraft[] {
  const cleanKws = normalizeKeywordList(keywordsArr);
  return raw
    .filter((p) => {
      const content = String(p.content ?? "").trim();
      const title = String(p.title ?? "").trim();
      if (!content) return false;
      if (BRAIN_UNCERTAIN_RE.test(content) || BRAIN_UNCERTAIN_RE.test(title)) {
        return false;
      }
      return true;
    })
    .map((p) => {
      const content = appendTagLine(
        String(p.content ?? "").trim(),
        indexingKeywordsTag,
        4096
      );
      const firstLine = content.split("\n")[0]?.trim() || content;
      const headline = (p.title ? String(p.title).trim() : firstLine).slice(0, 120);
      return {
        id: crypto.randomUUID(),
        question: headline,
        options: [],
        type: "text" as PollType,
        postText: content,
        indexingKeywords: cleanKws.length > 0 ? cleanKws : undefined,
        isAnonymous: false,
        allowsMultipleAnswers: false,
        caption: "",
      };
    });
}

function summarizeDraftCountsBn(items: PollDraft[]): string {
  const imageCount = items.filter((d) => d.type === "image").length;
  const textCount = items.filter((d) => d.type === "text").length;
  const pollCount = items.length - textCount - imageCount;
  const parts: string[] = [];
  if (imageCount > 0) parts.push(`${imageCount}টি ছবি পোস্ট`);
  if (textCount > 0) parts.push(`${textCount}টি টেক্সট পোস্ট`);
  if (pollCount > 0) parts.push(`${pollCount}টি পোল`);
  return parts.join(" ও ") || `${items.length}টি কনটেন্ট`;
}

function sanitizeBrainPolls(
  raw: Array<{
    question?: string;
    options?: string[];
    type?: string;
    correctOptionIndex?: number;
    explanation?: string;
    caption?: string;
    verifiedAccurate?: boolean;
    isAnonymous?: boolean;
    allowsMultipleAnswers?: boolean;
  }>,
  keywordsArr?: string[]
): PollDraft[] {
  const cleanKws = normalizeKeywordList(keywordsArr);
  const results: PollDraft[] = [];

  for (const p of raw) {
    if (p.verifiedAccurate === false) continue;
    const question = String(p.question ?? "").trim().slice(0, 300);
    if (!question || BRAIN_UNCERTAIN_RE.test(question)) continue;
    if (!Array.isArray(p.options)) continue;

    const rawOptions = p.options.map((o) => String(o).trim().slice(0, 100));
    if (rawOptions.some((o) => BRAIN_UNCERTAIN_RE.test(o))) continue;

    const dedupedOptions: string[] = [];
    const seen = new Set<string>();
    const rawToDedupIdx = new Map<number, number>();
    rawOptions.forEach((opt, origIdx) => {
      if (!opt) return;
      const key = opt.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      rawToDedupIdx.set(origIdx, dedupedOptions.length);
      dedupedOptions.push(opt);
    });

    if (dedupedOptions.length < 2 || dedupedOptions.length > 10) continue;

    const resolvedType: PollType = p.type === "quiz" ? "quiz" : "regular";
    let safeIdx: number | undefined;
    if (resolvedType === "quiz") {
      const origIdx = Number(p.correctOptionIndex);
      if (
        !Number.isInteger(origIdx) ||
        origIdx < 0 ||
        origIdx >= rawOptions.length
      ) {
        // Never force/clamp uncertain quiz answer to index 0
        continue;
      }
      const mapped = rawToDedupIdx.get(origIdx);
      if (mapped === undefined) {
        const targetKey = rawOptions[origIdx]?.toLowerCase();
        const fallbackIdx = dedupedOptions.findIndex(
          (o) => o.toLowerCase() === targetKey
        );
        if (fallbackIdx < 0) continue;
        safeIdx = fallbackIdx;
      } else {
        safeIdx = mapped;
      }
    }

    results.push({
      id: crypto.randomUUID(),
      question,
      options: dedupedOptions,
      type: resolvedType,
      correctOptionIndex: safeIdx,
      explanation:
        resolvedType === "quiz" && p.explanation
          ? String(p.explanation).trim().slice(0, 200)
          : "",
      indexingKeywords: cleanKws.length > 0 ? cleanKws : undefined,
      isAnonymous: p.isAnonymous ?? true,
      allowsMultipleAnswers:
        resolvedType === "regular" ? Boolean(p.allowsMultipleAnswers) : false,
      caption: p.caption ? String(p.caption).trim() : "",
    });
  }

  return results;
}

function getLocalClockHint(offsetMinutes: number): string {
  // offsetMinutes follows JS Date.getTimezoneOffset() (e.g. -360 for UTC+6 Dhaka)
  const localMs = Date.now() - offsetMinutes * 60_000;
  const localDate = new Date(localMs);
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const absMins = Math.abs(offsetMinutes);
  const hh = String(Math.floor(absMins / 60)).padStart(2, "0");
  const mm = String(absMins % 60).padStart(2, "0");
  return `UTC: ${new Date().toISOString()} | Local (UTC${sign}${hh}:${mm}): ${localDate
    .toISOString()
    .replace("Z", "")}`;
}

function formatLocalDateTime(iso: string, offsetMinutes: number): string {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const local = new Date(ms - offsetMinutes * 60_000);
  const yyyy = local.getUTCFullYear();
  const mon = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  let hr = local.getUTCHours();
  const min = String(local.getUTCMinutes()).padStart(2, "0");
  const ampm = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${yyyy}-${mon}-${dd} ${hr}:${min} ${ampm}`;
}

function resolveFutureScheduleMs(iso: string): number {
  let ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return NaN;
  const now = Date.now();
  // If time-of-day parsed slightly in the past (within 24h), bump +1 day automatically
  if (ms < now - 60_000 && now - ms < 24 * 60 * 60_000) {
    ms += 24 * 60 * 60_000;
  }
  return ms;
}

function shouldReusePreviousFile(text: string, hasLastFile: boolean): boolean {
  if (!hasLastFile) return false;
  if (!text.trim()) return true;
  return /(ছবি|ইমেজ|ফটো|পিডিএফ|ফাইল|ডকুমেন্ট|আগের|আরো|আরও|এটা|পোল|কুইজ|প্রশ্ন|ক্যাপশন|পোস্ট|দাও|image|photo|pic|picture|pdf|file|document|more|another|poll|quiz|question|caption|post)/i.test(
    text
  );
}

function resolveJobByIdOrIndex(
  candidate: string | undefined,
  visibleJobs: Array<{ id: string }>
): ScheduledPollJob | undefined {
  const raw = (candidate || "").trim();
  if (!raw) return undefined;
  const all = listJobs();
  const byId = all.find((j) => j.id === raw);
  if (byId) return byId;
  if (/^\d{1,2}$/.test(raw)) {
    const picked = visibleJobs[Number(raw) - 1];
    if (picked) {
      return all.find((j) => j.id === picked.id);
    }
  }
  return undefined;
}

async function resolveTargetForAction(params: {
  override?: string;
  defaultChannelId?: string;
  defaultChannelTitle?: string;
  state: ChatSessionState;
  resolveAndVerifyChannelFn?: (
    identifier: string
  ) => Promise<ChannelVerifyResult>;
}): Promise<ChannelVerifyResult> {
  let candidate = (params.override || "").trim();
  const isOverride = Boolean(candidate);

  if (!candidate) {
    candidate = (params.defaultChannelId || "").trim();
  }

  if (!candidate) {
    return {
      ok: false,
      error:
        '⚠️ কোনো চ্যানেল বা গ্রুপ নির্বাচন করা হয়নি। বলুন কোন চ্যানেলে পোস্ট করবো (যেমন: "@channel_name এ পোস্ট করো") অথবা লিখুন: "চ্যানেল লিস্ট দেখাও"।',
    };
  }

  // Translate 1-based list index from lastChannels if user specified e.g. "2"
  if (/^\d{1,2}$/.test(candidate) && params.state.lastChannels?.length) {
    const picked = params.state.lastChannels[Number(candidate) - 1];
    if (picked) {
      candidate = picked.username ? `@${picked.username}` : picked.id;
    }
  }

  if (params.resolveAndVerifyChannelFn) {
    return params.resolveAndVerifyChannelFn(candidate);
  }

  return {
    ok: true,
    channelId: candidate,
    channelTitle:
      !isOverride && params.defaultChannelTitle
        ? params.defaultChannelTitle
        : candidate,
    channelType: "channel",
  };
}

export async function processTelegramAgentMessage(
  input: TelegramAgentTurnInput
): Promise<void> {
  const store = readStore();
  const state = getChatState(input.chatId);
  const offsetMinutes = store.config.timezoneOffsetMinutes ?? -360;
  const targetChannelLabel =
    store.config.channelTitle && store.config.channelTitle !== store.config.channelId
      ? `${store.config.channelTitle} (${store.config.channelId})`
      : store.config.channelId || "Not selected";

  if (input.file) {
    // Store latest image/PDF (under ~10MB) so follow-up messages can reference it
    if (input.file.dataBase64.length < 13_500_000) {
      state.lastFile = input.file;
    }
    state.lastSourceKind = input.file.sourceKind;
    state.lastSourceLabel = input.file.name;
  }

  const fileForGemini: AgentAttachment | undefined =
    input.file ??
    (shouldReusePreviousFile(input.userText, Boolean(state.lastFile))
      ? state.lastFile
      : undefined);

  const rawPendingJobs = listJobs().filter(
    (j) => j.status === "pending" || j.status === "paused" || j.status === "failed"
  );
  const pendingJobs = rawPendingJobs.slice(0, 10).map((j, idx) => ({
    index: idx + 1,
    id: j.id,
    type: j.type,
    question: j.question.slice(0, 70),
    scheduledLocal: formatLocalDateTime(j.scheduledAt, offsetMinutes),
    status: j.status,
  }));

  const historyText = state.history
    .slice(-6)
    .map((h) => `${h.role === "user" ? "User" : "Agent"}: ${h.text}`)
    .join("\n");

  const draftsSummary = state.drafts.map((d, idx) =>
    d.type === "image"
      ? {
          index: idx,
          type: "image_post",
          imageName: d.imageName || "photo.jpg",
          caption: (d.postText || d.caption || "").slice(0, 400),
        }
      : d.type === "text"
        ? {
            index: idx,
            type: "text_post",
            title: d.question,
            content: (d.postText || d.question).slice(0, 400),
          }
        : {
            index: idx,
            question: d.question,
            options: d.options,
            type: d.type,
          }
  );

  const systemInstruction = [
    store.config.agentPersona ||
      "You are the user's fast, universal Personal Telegram AI Agent inside their Telegram group.",
    "Reply naturally in Bengali (বাংলা) or English matching the user. Keep replyText concise and helpful.",
    "Available Actions:",
    "- 'chat': normal conversation, Q&A, or explaining capabilities.",
    "- 'generate_polls': extract ALL possible polls from text/photo/PDF.",
    "- 'generate_text_posts': write or format Telegram channel text post(s).",
    "- 'generate_image_post': prepare an uploaded/attached photo with a crisp caption (<= 980 chars) for posting/scheduling.",
    "- 'generate_content': create BOTH text post(s) and poll(s).",
    "- 'index_channel' or 'search_channel': search the target channel's message history & local history by keyword(s) and build a clickable Index Post.",
    "- 'refine_polls': edit existing poll, text post, or image caption drafts.",
    "- 'post_to_channel': publish current drafts immediately to target channel.",
    "- 'schedule_polls': schedule current drafts.",
    "- 'list_schedules', 'cancel_schedule' (pause), 'resume_schedule', 'reschedule_job', 'trigger_scheduled_now' (send scheduled item right now).",
    "- 'list_channels', 'set_target_channel', 'clear_drafts'.",
    `Current target publish channel: ${targetChannelLabel}.`,
    getLocalClockHint(offsetMinutes),
    "SCHEDULING: Convert local/relative time (e.g. '১০ মিনিট পর', 'রাত ৯টায়', 'tomorrow 10am') accurately into ISO 8601 UTC in 'scheduleAtIso'. Always pick a future timestamp.",
    "PHOTO POSTING RULE: If user attaches/sends a photo and asks to post/publish/schedule/caption it (e.g. 'ছবিটা পোস্ট করো', 'ক্যাপশন লিখে দাও', 'রাত ৯টায় ছবিটা শিডিউল করো'), use action='generate_image_post' with a crisp caption in 'imageCaption' (<= 980 chars). If user asks you to generate/create a brand-new AI image without sending a photo, DO NOT call generate_image_post; set action='chat' and politely explain in Bengali that creating new AI images requires a Paid API Key (which is disabled), but if they send any photo here you can caption and post/schedule it immediately!",
    "KEYWORD INDEXING RULE: When user asks to index or search a channel by keyword(s) (e.g. 'BCS কিওয়ার্ড দিয়ে চ্যানেল ইনডেক্স করো', '#Notice পোস্টগুলোর ইনডেক্স বানাও', 'https://t.me/mission_campus এ Physics লিখে সার্চ দাও'), set action='index_channel' (or 'search_channel'), put all requested keywords into 'keywords', and put any named channel link/@username into 'targetChannelOverride'. Leave 'keywords' as [] if they asked for a general/recent index without specific keywords. When generating new posts/captions/polls and the user asks to tag them for indexing, also include hashtags in 'indexingKeywordsTag' and 'keywords'.",
    "TEXT POSTS: Use action='generate_text_posts' (or 'generate_content' if both text + polls). Preserve verbatim text if user says 'এই লেখাটা হুবহু পোস্ট করো'.",
    "POLL COUNT RULE: When generating polls, unless user specifies a number, ALWAYS generate ALL possible distinct, non-duplicate Telegram polls from the entire source (up to 35 polls—never stop at 2 or 3). Each question <= 280 chars, 2-6 options <= 90 chars.",
    "TARGET CHANNEL OVERRIDE: If user names ANY channel/group (e.g. '@MyChannel', 'https://t.me/mission_campus', 'BCS Group'), put it into 'targetChannelOverride'.",
    "STRICT ACCURACY & ZERO-GUESSING POLICY (CRITICAL):",
    "- When creating polls, quiz answers, text posts, or image captions, NEVER allow even a single wrong answer or fabricated fact.",
    "- Double-check every quiz's options[correctOptionIndex] and explanation before outputting so that the marked correct answer is 100% factually right.",
    "- IGNORE AMBIGUOUS OR UNCLEAR INFO: If any text, handwriting, blurry photo, cut-off option, or fact in the source is unclear or uncertain, COMPLETELY SKIP IT. Never guess missing details! Summarize any ignored unclear parts briefly in 'skippedUnclearNotes'.",
    "- For quiz polls, if you are not 100% sure of the right answer, skip that poll (or set verifiedAccurate=false / correctOptionIndex=-1). NEVER guess an answer.",
    "- NO UNRELATED FALLBACK: If the entire provided text/photo/PDF is blurry, unreadable, or ambiguous, return polls=[] and textPosts=[] (do NOT invent unrelated general-knowledge fallback questions or filler posts) and explain clearly in 'skippedUnclearNotes'/'replyText'.",
    "IMMEDIATE POST / SCHEDULE COMBO: If user says 'create/write/index AND post now', set 'alsoPostNow=true'. If they include a schedule time, set 'scheduleAtIso'.",
    "Leave 'polls' and 'textPosts' as [] unless generating or refining drafts.",
  ].join("\n");

  const effectiveUserMessage =
    input.userText.trim() ||
    (input.file
      ? input.file.sourceKind === "image"
        ? `[User uploaded image: ${input.file.name} with no caption. Inspect the image carefully! If it contains clear, readable study/MCQ notes, extract ONLY verified, unambiguous Telegram quiz/polls (skip anything blurry); if it looks like a standalone photo/poster/banner, prepare an accurate image post preview with a short engaging caption using generate_image_post without inventing unclear facts.]`
        : `[User uploaded ${input.file.sourceKind}: ${input.file.name} with no caption. Analyze the file and generate ALL clear, verified Telegram polls, skipping anything blurry or ambiguous, then ask whether to post or schedule them.]`
      : "");

  const contextBlock = [
    historyText ? `Recent chat:\n${historyText}` : "",
    fileForGemini
      ? `Active attachment available: ${fileForGemini.name} (${fileForGemini.sourceKind}, ${fileForGemini.mimeType})`
      : "Active attachment: none",
    draftsSummary.length > 0
      ? `Drafts in memory:\n${JSON.stringify(draftsSummary)}`
      : "Drafts in memory: none",
    pendingJobs.length > 0
      ? `Scheduled jobs:\n${JSON.stringify(pendingJobs)}`
      : "",
    state.lastChannels && state.lastChannels.length > 0
      ? `Known channels (1-based):\n${state.lastChannels
          .slice(0, 15)
          .map(
            (c, i) =>
              `${i + 1}. ${c.title} (${c.username ? `@${c.username}` : c.id}, ${c.type})`
          )
          .join("\n")}`
      : "",
    `New user message:\n${effectiveUserMessage}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (fileForGemini?.dataBase64) {
    parts.push({
      inlineData: {
        mimeType: fileForGemini.mimeType,
        data: fileForGemini.dataBase64,
      },
    });
  }
  parts.push({ text: contextBlock });

  type ParsedBrainOutput = {
    action?: string;
    replyText?: string;
    skippedUnclearNotes?: string;
    textPosts?: Array<{
      title?: string;
      content?: string;
    }>;
    polls?: Array<{
      question?: string;
      options?: string[];
      type?: string;
      correctOptionIndex?: number;
      explanation?: string;
      caption?: string;
      verifiedAccurate?: boolean;
      isAnonymous?: boolean;
      allowsMultipleAnswers?: boolean;
    }>;
    imageCaption?: string;
    keywords?: string[];
    indexingKeywordsTag?: string;
    alsoPostNow?: boolean;
    scheduleAtIso?: string;
    intervalMinutes?: number;
    pollIndices?: number[];
    cancelJobId?: string;
    targetJobId?: string;
    targetChannelIdentifier?: string;
    targetChannelOverride?: string;
  };

  const tryDeterministicParsedAction = (): ParsedBrainOutput | null => {
    const rawText = input.userText.trim();
    if (!rawText && !input.file) return null;
    const lower = rawText.toLowerCase();

    const urlMatchLocal = rawText.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/i);
    const mentionMatch = rawText.match(/@([a-zA-Z0-9_]{4,})/);
    const extractedTarget = urlMatchLocal
      ? `@${urlMatchLocal[1]}`
      : mentionMatch
        ? `@${mentionMatch[1]}`
        : "";

    if (
      !input.file &&
      (/^\/(start|help)\b/i.test(rawText) ||
        (rawText.length <= 45 &&
          /(^help$|হেল্প|সাহায্য|কিভাবে|কী কী পারো|কি কি পারো)/i.test(rawText)))
    ) {
      return {
        action: "chat",
        replyText: [
          "🤖 আমি আপনার পার্সোনাল TelePoll AI Agent!",
          "",
          "আমার মাধ্যমে যা যা করতে পারবেন:",
          "• টেক্সট, ছবি বা পিডিএফ পাঠিয়ে সঠিক কুইজ/পোল তৈরি ও পোস্ট",
          '• বানান না বদলে সরাসরি রেডি পোল পোস্ট (যেমন: "রেডি পোল এখনই পোস্ট করো:" + প্রশ্ন, ক/খ/গ/ঘ ও উত্তর: খ)',
          "• চ্যানেলের জন্য নির্ভুল টেক্সট পোস্ট বা ছবির ক্যাপশন তৈরি",
          '• কিওয়ার্ড দিয়ে চ্যানেল ইনডেক্সিং (যেমন: "BCS কিওয়ার্ড দিয়ে ইনডেক্স করো")',
          '• চ্যানেল লিস্ট ("চ্যানেল লিস্ট দেখাও"), শিডিউল ("শিডিউল দেখাও") ও সরাসরি পোস্ট ("এখনই পোস্ট করো")',
        ].join("\n"),
      };
    }

    if (
      !input.file &&
      rawText.length <= 50 &&
      /(চ্যানেল|গ্রুপ).*(লিস্ট|তালিকা|দেখাও)|^(channels|list channels)$/i.test(lower)
    ) {
      return { action: "list_channels" };
    }

    if (
      !input.file &&
      rawText.length <= 50 &&
      /(শিডিউল|সময়সূচী|কিউ).*(লিস্ট|তালিকা|দেখাও)|^(schedules|list schedules)$/i.test(
        lower
      )
    ) {
      return { action: "list_schedules" };
    }

    if (
      !input.file &&
      rawText.length <= 45 &&
      /(ড্রাফট|খসড়া).*(মুছ|ক্লিয়ার|বাদ|clear)|^(clear drafts)$/i.test(lower)
    ) {
      return { action: "clear_drafts" };
    }

    if (
      !input.file &&
      rawText.length <= 85 &&
      extractedTarget &&
      /(সেট|টার্গেট|নির্বাচন|ব্যবহার|set|target|use)/i.test(lower) &&
      !/(পোল|কুইজ|পোস্ট|ইনডেক্স|সার্চ|শিডিউল|poll|quiz|post|index|search|schedule)/i.test(
        lower
      )
    ) {
      return {
        action: "set_target_channel",
        targetChannelIdentifier: extractedTarget,
        targetChannelOverride: extractedTarget,
      };
    }

    if (
      !input.file &&
      state.drafts.length > 0 &&
      rawText.length <= 65 &&
      /(এখনই পোস্ট|এখন পোস্ট|পাবলিশ কর|post now|publish now)/i.test(lower) &&
      !/(তৈরি|বানা|লিখ|নতুন|পোল|কুইজ|শিডিউল|create|make|write|schedule)/i.test(lower)
    ) {
      return {
        action: "post_to_channel",
        targetChannelOverride: extractedTarget,
      };
    }

    // Deterministic job pause/resume/trigger by 1-based list number (e.g. "১ নম্বর পজ করো", "2 number post now")
    if (!input.file && rawText.length <= 60) {
      const bnDigitsToEn = rawText.replace(/[০-৯]/g, (d) =>
        String("০১২৩৪৫৬৭৮৯".indexOf(d))
      );
      const numMatch = bnDigitsToEn.match(/(?:^|\s)(\d{1,2})\s*(?:নম্বর|নং|number|#)?/i);
      if (numMatch) {
        const idxStr = numMatch[1];
        if (/(পজ|থামা|বন্ধ|বাতিল|pause|cancel|stop)/i.test(lower)) {
          return { action: "cancel_schedule", targetJobId: idxStr };
        }
        if (/(চালু|রিসিউম|resume|start)/i.test(lower)) {
          return { action: "resume_schedule", targetJobId: idxStr };
        }
        if (/(এখনই|এখন|পোস্ট|পাঠা|trigger|post now)/i.test(lower)) {
          return { action: "trigger_scheduled_now", targetJobId: idxStr };
        }
      }
    }

    // Deterministic relative-time scheduling for existing drafts (e.g. "১০ মিনিট পর শিডিউল করো", "in 30 minutes")
    if (
      !input.file &&
      state.drafts.length > 0 &&
      rawText.length <= 90 &&
      !/(তৈরি|বানা|লিখ|নতুন|পোল|কুইজ|create|make|write)/i.test(lower)
    ) {
      const bnDigitsToEn = rawText.replace(/[০-৯]/g, (d) =>
        String("০১২৩৪৫৬৭৮৯".indexOf(d))
      );
      const relMinMatch = bnDigitsToEn.match(
        /(\d{1,3})\s*(?:মিনিট|min|minute|minutes)\s*(?:পর|পরে|later|from now)/i
      );
      const relHrMatch = bnDigitsToEn.match(
        /(\d{1,2})\s*(?:ঘণ্টা|ঘন্টা|hr|hour|hours)\s*(?:পর|পরে|later|from now)/i
      );
      const deltaMs = relMinMatch
        ? Number(relMinMatch[1]) * 60_000
        : relHrMatch
          ? Number(relHrMatch[1]) * 3_600_000
          : 0;
      if (deltaMs > 0) {
        return {
          action: "schedule_polls",
          scheduleAtIso: new Date(Date.now() + deltaMs).toISOString(),
          targetChannelOverride: extractedTarget,
        };
      }
    }

    // Deterministic direct photo posting when user attaches an image and explicitly asks to post it as-is
    if (
      input.file?.sourceKind === "image" &&
      /(পোস্ট|পাঠাও|post|publish)/i.test(lower) &&
      !/(পোল|কুইজ|প্রশ্ন|ক্যাপশন লিখ|ক্যাপশন বানা|বিশ্লেষণ|এআই|poll|quiz|question|write caption|generate)/i.test(
        lower
      )
    ) {
      const capMatch = rawText.match(/(?:ক্যাপশন|caption)\s*[:：]\s*([\s\S]+)$/i);
      const explicitCap = capMatch?.[1]?.trim() || "";
      return {
        action: "generate_image_post",
        imageCaption: explicitCap.slice(0, 980),
        alsoPostNow: true,
        targetChannelOverride: extractedTarget,
      };
    }

    // Deterministic verbatim text post when user explicitly specifies "হুবহু"
    if (!input.file && /হুবহু/i.test(rawText)) {
      const splitMatch = rawText.match(
        /^.*?(?:হুবহু\s*(?:পোস্ট|মেসেজ)?\s*(?:করো|লিখো|দাও)?\s*[:：\n-]\s*)([\s\S]+)$/i
      );
      const verbatimBody = splitMatch?.[1]?.trim();
      if (verbatimBody && verbatimBody.length >= 3) {
        const shouldPostNow = /(এখন|সরাসরি|পোস্ট করো|পোস্ট কর)/i.test(
          rawText.slice(0, rawText.indexOf(verbatimBody))
        );
        return {
          action: "generate_text_posts",
          textPosts: [
            {
              title: verbatimBody.split("\n")[0]?.slice(0, 90) || "Post",
              content: verbatimBody.slice(0, 3800),
            },
          ],
          alsoPostNow: shouldPostNow,
          targetChannelOverride: extractedTarget,
          replyText: shouldPostNow
            ? ""
            : "📝 আপনার লেখা হুবহু টেক্সট পোস্ট হিসেবে প্রস্তুত করেছি।",
        };
      }
    }

    // Deterministic keyword channel indexing (uses MTProto scanner, zero LLM needed)
    if (
      !input.file &&
      rawText.length <= 160 &&
      /(ইনডেক্স|index)/i.test(lower) &&
      !/(পোল|কুইজ|ছবি|poll|quiz|image)/i.test(lower)
    ) {
      const quoted = [...rawText.matchAll(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/g)]
        .map((m) => m[1].trim())
        .filter(Boolean);
      const hashTags = [...rawText.matchAll(/#([a-zA-Z0-9_\u0980-\u09FF]+)/g)].map(
        (m) => m[1]
      );
      let keywords = [...new Set([...quoted, ...hashTags])];
      if (keywords.length === 0) {
        const beforeKw = rawText.match(
          /([a-zA-Z0-9_\u0980-\u09FF,\s]+?)\s*(?:কিওয়ার্ড|keyword|keywords|লিখে)/i
        );
        if (beforeKw?.[1]) {
          const cleaned = beforeKw[1]
            .replace(/(?:https?:\/\/)?t\.me\/[a-zA-Z0-9_]+/gi, "")
            .replace(/@[a-zA-Z0-9_]+/g, "")
            .replace(/\b(এই|চ্যানেলে|চ্যানেল|গ্রুপে|এ|তে|থেকে|দিয়ে|নিয়ে)\b/gi, " ")
            .split(/[,،]+|\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 2);
          keywords = [...new Set(cleaned)].slice(0, 8);
        }
      }
      const alsoPostNow = /(পোস্ট|পাঠাও|post now|publish)/i.test(lower);
      return {
        action: "index_channel",
        keywords,
        alsoPostNow,
        targetChannelOverride: extractedTarget,
      };
    }

    // Deterministic Ready-Poll Fast-Path (zero AI, 100% verbatim text & verified quiz answers)
    if (!input.file) {
      const lines = rawText.replace(/\r\n/g, "\n").split("\n");
      const firstLine = lines[0]?.trim() || "";
      const firstLineLooksLikeCommand =
        lines.length > 1 &&
        !firstLine.includes("?") &&
        !firstLine.includes("？") &&
        !/^(?:প্রশ্ন\s*[০-৯\d]|Q\s*\d|[০-৯\d]+[\.\)])/i.test(firstLine) &&
        /(রেডি\s*পোল|সরাসরি\s*পোল|হুবহু\s*পোল|পোল\s*পোস্ট|পোস্ট\s*করো|শিডিউল\s*করো|ready\s*poll|direct\s*poll|exact\s*poll|post\s*now|schedule|t\.me\/|@[a-zA-Z0-9_]{4,})/i.test(
          firstLine
        );

      const headerLine = firstLineLooksLikeCommand ? firstLine : "";
      const bodyText = firstLineLooksLikeCommand
        ? lines.slice(1).join("\n").trim()
        : rawText;

      const explicitDirectPollCmd =
        /(রেডি\s*পোল|হুবহু\s*পোল|সরাসরি\s*পোল|ready\s*poll|direct\s*poll|exact\s*poll)/i.test(
          headerLine || rawText.slice(0, 120)
        );

      const hasOptionLabels =
        /(?:^|[\n\s])(?:\([ক-ঞA-Da-d]\)|[ক-ঞA-Da-d][\)\.])\s+\S/m.test(
          bodyText
        );
      const hasExplicitAnswerSignal =
        /(?:সঠিক\s*উত্তর|উত্তর|উঃ|Ans(?:wer)?|Correct)\s*[:：=-]|[✓✔✅☑️]/iu.test(
          bodyText
        );
      const headerAsksAiCreation =
        /(নতুন\s*প্রশ্ন|বানাও|তৈরি\s*কর|অনুবাদ|ব্যাখ্যা\s*লিখ|summarize|translate|generate\s+new|invent)/i.test(
          headerLine
        );

      if (
        explicitDirectPollCmd ||
        (hasOptionLabels &&
          !headerAsksAiCreation &&
          (hasExplicitAnswerSignal || firstLineLooksLikeCommand))
      ) {
        const parsedReady = parseReadyPollsFromText({
          text: bodyText,
          pollType: "auto",
          isAnonymous: true,
          allowsMultipleAnswers: false,
          language: "bn",
        });

        if (parsedReady.polls.length === 0) {
          if (explicitDirectPollCmd) {
            return {
              action: "chat",
              replyText: [
                "⚠️ রেডি পোল থেকে কোনো বৈধ প্রশ্ন পাওয়া যায়নি:",
                ...parsedReady.skippedNotes.slice(0, 5).map((n) => `• ${n}`),
                "",
                "সঠিক ফরম্যাট উদাহরণ:",
                "বাংলাদেশের রাজধানী কোনটি?",
                "ক) খুলনা",
                "খ) ঢাকা",
                "গ) সিলেট",
                "ঘ) চট্টগ্রাম",
                "উত্তর: খ",
              ].join("\n"),
            };
          }
        } else {
          const headerLower = headerLine.toLowerCase();
          const alsoPostNow = /(এখনই|এখন|সরাসরি|পোস্ট\s*কর|পাবলিশ|post\s*now|publish|send\s*now)/i.test(
            headerLower
          );
          const bnDigitsHeader = headerLine.replace(/[০-৯]/g, (d) =>
            String("০১২৩৪৫৬৭৮৯".indexOf(d))
          );
          const relMinMatch = bnDigitsHeader.match(
            /(\d{1,3})\s*(?:মিনিট|min|minute|minutes)\s*(?:পর|পরে|later|from now)/i
          );
          const relHrMatch = bnDigitsHeader.match(
            /(\d{1,2})\s*(?:ঘণ্টা|ঘন্টা|hr|hour|hours)\s*(?:পর|পরে|later|from now)/i
          );
          const deltaMs = relMinMatch
            ? Number(relMinMatch[1]) * 60_000
            : relHrMatch
              ? Number(relHrMatch[1]) * 3_600_000
              : 0;
          const scheduleAtIso =
            deltaMs > 0 ? new Date(Date.now() + deltaMs).toISOString() : "";

          return {
            action: "generate_polls",
            polls: parsedReady.polls.map((p) => ({
              question: p.question,
              options: p.options,
              type: p.type,
              correctOptionIndex: p.correctOptionIndex ?? 0,
              explanation: p.explanation || "",
              caption: p.caption || "",
              verifiedAccurate: true,
              isAnonymous: p.isAnonymous,
              allowsMultipleAnswers: p.allowsMultipleAnswers,
            })),
            skippedUnclearNotes: parsedReady.skippedNotes.join(" | "),
            alsoPostNow,
            scheduleAtIso,
            targetChannelOverride: extractedTarget,
            replyText:
              alsoPostNow || scheduleAtIso
                ? ""
                : `✅ আপনার লেখা থেকে হুবহু ${parsedReady.polls.length}টি নির্ভুল ও উত্তর-যাচাইকৃত রেডি পোল প্রিভিউতে পাঠানো হয়েছে। চাইলে লিখুন: "এখনই চ্যানেলে পোস্ট করো" অথবা সময় দিয়ে শিডিউল করুন।`,
          };
        }
      }
    }

    return null;
  };

  const deterministicParsed = tryDeterministicParsedAction();
  let parsed: ParsedBrainOutput;

  if (deterministicParsed) {
    parsed = deterministicParsed;
  } else {
    const mightGeneratePolls =
      Boolean(fileForGemini) ||
      /(পোল|কুইজ|প্রশ্ন|পোস্ট|মেসেজ|ক্যাপশন|সব|যত|poll|quiz|question|post|message|caption)/i.test(
        effectiveUserMessage
      );

    const rawJson = await generateStructuredWithFallback({
      contents: { parts },
      systemInstruction,
      responseSchema: AGENT_BRAIN_SCHEMA,
      fastMode: !fileForGemini,
      thinkingLevel: mightGeneratePolls
        ? ThinkingLevel.LOW
        : ThinkingLevel.MINIMAL,
      exhaustive: mightGeneratePolls,
    });

    parsed = parseJsonSafePublic(rawJson) as ParsedBrainOutput;
  }

  const urlMatch = input.userText.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/i);
  if (!parsed.targetChannelOverride?.trim() && urlMatch) {
    parsed.targetChannelOverride = `@${urlMatch[1]}`;
  }

  const action = parsed.action || "chat";
  let replyText = (parsed.replyText || "").trim();

  // Save user turn
  state.history.push({
    role: "user",
    text:
      input.userText ||
      (input.file ? `[Attached ${input.file.name}]` : "Message"),
  });

  const dispatchAndRecordDrafts = async (
    channelId: string,
    draftsToSend: PollDraft[]
  ) => {
    for (let i = 0; i < draftsToSend.length; i++) {
      const draft = draftsToSend[i];
      if (i > 0 && draftsToSend.length > 3) {
        await new Promise((r) => setTimeout(r, 250));
      }
      const { messageId, channelUsed } = await input.dispatchPollFn(
        channelId,
        draft
      );
      addJobs([
        {
          ...draft,
          scheduledAt: new Date().toISOString(),
          postedAt: new Date().toISOString(),
          channelId: channelUsed,
          status: "posted",
          sourceKind: state.lastSourceKind,
          sourceLabel: state.lastSourceLabel,
          createdAt: new Date().toISOString(),
          telegramMessageId: messageId,
        },
      ]);
    }
  };

  if (action === "list_channels") {
    if (!input.listChannelsFn) {
      replyText =
        "চ্যানেল তালিকা এই মোডে পাওয়া যায়নি। ওয়েব ড্যাশবোর্ড থেকে চ্যানেল নির্বাচন করুন।";
    } else {
      const channels = await input.listChannelsFn();
      state.lastChannels = channels;
      if (channels.length === 0) {
        replyText = "আপনার অ্যাকাউন্টে কোনো চ্যানেল বা গ্রুপ পাওয়া যায়নি।";
      } else {
        const lines = channels.slice(0, 25).map((c, idx) => {
          const handle = c.username ? `@${c.username}` : c.id;
          const isCur =
            store.config.channelId === c.id ||
            (c.username && store.config.channelId === `@${c.username}`);
          const adminBadge =
            c.isAdmin === true
              ? c.canPost === false
                ? "⚠️ Admin (পোস্ট পারমিশন নেই)"
                : "👑 Admin"
              : "👤 Member (এডমিন নন)";
          return `${idx + 1}. ${c.title} (${handle}) [${c.type}] · ${adminBadge}${
            isCur ? " ✅ বর্তমান" : ""
          }`;
        });
        replyText = [
          "📋 আপনার টেলিগ্রাম চ্যানেল ও গ্রুপের তালিকা:",
          "",
          ...lines,
          "",
          'যে চ্যানেলে আপনি 👑 Admin, সেগুলোর যেকোনোটিতে পোস্ট করতে লিখুন: "@username এ পোস্ট করো" অথবা "১ নম্বরে সেট করো"।',
        ].join("\n");
      }
    }
  } else if (action === "set_target_channel") {
    const query = (
      parsed.targetChannelIdentifier ||
      parsed.targetChannelOverride ||
      input.userText ||
      ""
    ).trim();
    const verified = await resolveTargetForAction({
      override: query,
      state,
      resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
    });

    if (verified.ok) {
      updateConfig({
        channelId: verified.channelId,
        channelTitle: verified.channelTitle,
        channelType: verified.channelType,
        verifiedAt: new Date().toISOString(),
      });
      replyText = `✅ এখন থেকে ডিফল্ট টার্গেট চ্যানেল/গ্রুপ: "${verified.channelTitle}" (${verified.channelId})।`;
    } else {
      replyText = verified.error;
    }
  } else if (action === "clear_drafts") {
    state.drafts = [];
    if (!replyText) {
      replyText = "🗑️ বর্তমান সব খসড়া (ড্রাফট) মুছে ফেলা হয়েছে।";
    }
  } else if (action === "index_channel" || action === "search_channel") {
    if (!input.indexChannelFn) {
      replyText =
        "⚠️ চ্যানেল ইনডেক্সিং এই মুহূর্তে উপলব্ধ নয়। ওয়েব স্টুডিওর Keyword Indexing ট্যাব ব্যবহার করুন।";
    } else {
      let targetCandidate = (
        parsed.targetChannelOverride ||
        parsed.targetChannelIdentifier ||
        store.config.channelId ||
        ""
      ).trim();

      if (/^\d{1,2}$/.test(targetCandidate) && state.lastChannels?.length) {
        const picked = state.lastChannels[Number(targetCandidate) - 1];
        if (picked) {
          targetCandidate = picked.username ? `@${picked.username}` : picked.id;
        }
      }

      if (!targetCandidate) {
        replyText =
          '⚠️ কোন চ্যানেল ইনডেক্স করবো? অনুগ্রহ করে চ্যানেলের @username বা লিংক দিন (যেমন: "https://t.me/mission_campus এ BCS লিখে ইনডেক্স করো")।';
      } else {
        const cleanKeywords = normalizeKeywordList(parsed.keywords);
        const idxRes = await input.indexChannelFn(targetCandidate, cleanKeywords);
        if (!idxRes.ok) {
          replyText = idxRes.error;
        } else {
          const indexDraft: PollDraft = {
            id: crypto.randomUUID(),
            question: `📌 ইনডেক্স: ${idxRes.channelTitle}${
              cleanKeywords.length ? ` (${cleanKeywords.join(", ")})` : ""
            }`.slice(0, 120),
            options: [],
            type: "text",
            postText: idxRes.indexText.slice(0, 4096),
            indexingKeywords: cleanKeywords.length > 0 ? cleanKeywords : undefined,
            isAnonymous: false,
            allowsMultipleAnswers: false,
            caption: "",
          };
          state.drafts = [indexDraft];
          state.lastSourceKind = "text";
          state.lastSourceLabel = `Index: ${idxRes.channelTitle}`.slice(0, 40);

          if (parsed.alsoPostNow) {
            const verified = await resolveTargetForAction({
              override: parsed.targetChannelOverride,
              defaultChannelId: store.config.channelId,
              defaultChannelTitle: store.config.channelTitle,
              state,
              resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
            });
            if (!verified.ok) {
              replyText = `${idxRes.indexText}\n\n${verified.error}`;
            } else {
              await dispatchAndRecordDrafts(verified.channelId, [indexDraft]);
              replyText = `✅ ইনডেক্স পোস্ট তৈরি করে সরাসরি "${verified.channelTitle}" (${verified.channelId})-এ প্রকাশ করা হয়েছে! (${idxRes.matchedCount}টি ম্যাচিং পোস্ট)`;
            }
          } else if (
            parsed.scheduleAtIso &&
            !Number.isNaN(new Date(parsed.scheduleAtIso).getTime())
          ) {
            const verified = await resolveTargetForAction({
              override: parsed.targetChannelOverride,
              defaultChannelId: store.config.channelId,
              defaultChannelTitle: store.config.channelTitle,
              state,
              resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
            });
            if (!verified.ok) {
              replyText = `${idxRes.indexText}\n\n${verified.error}`;
            } else {
              const startMs = resolveFutureScheduleMs(parsed.scheduleAtIso);
              const nowIso = new Date().toISOString();
              const job: ScheduledPollJob = {
                ...indexDraft,
                id: crypto.randomUUID(),
                scheduledAt: new Date(startMs).toISOString(),
                channelId: verified.channelId,
                status: "pending",
                sourceKind: "text",
                sourceLabel: state.lastSourceLabel,
                createdAt: nowIso,
              };
              addJobs([job]);
              const firstLocal = formatLocalDateTime(job.scheduledAt, offsetMinutes);
              replyText = `⏰ ইনডেক্স পোস্ট "${verified.channelTitle}" (${verified.channelId})-এর জন্য ${firstLocal} সময়ে শিডিউল করা হয়েছে। (${idxRes.matchedCount}টি ম্যাচিং পোস্ট)`;
            }
          } else {
            await input.sendReplyTextFn(idxRes.indexText);
            replyText =
              replyText ||
              `📌 উপরের ইনডেক্স পোস্টটি ড্রাফট হিসেবে প্রস্তুত (${idxRes.matchedCount}টি ম্যাচিং পোস্ট)। চাইলে লিখুন: "এখনই চ্যানেলে পোস্ট করো" অথবা সময় দিয়ে শিডিউল করতে বলুন।`;
          }
        }
      }
    }
  } else if (action === "generate_image_post") {
    const activeImage =
      fileForGemini?.sourceKind === "image" ? fileForGemini : undefined;
    if (!activeImage?.dataBase64) {
      replyText =
        replyText ||
        "📷 ছবি পোস্ট তৈরি করতে অনুগ্রহ করে এই গ্রুপে যেকোনো একটি ছবি পাঠান (নতুন এআই ছবি তৈরি করতে Paid API Key প্রয়োজন হয়, যা বর্তমানে বন্ধ আছে)। ছবি পাঠালেই আমি সুন্দর ক্যাপশন লিখে চ্যানেলে পোস্ট বা শিডিউল করে দেবো!";
    } else {
      const cleanKws = normalizeKeywordList(parsed.keywords);
      const rawCap = (
        parsed.imageCaption ||
        parsed.textPosts?.[0]?.content ||
        input.userText ||
        ""
      ).trim();
      const finalCaption = appendTagLine(
        rawCap,
        parsed.indexingKeywordsTag,
        1024
      );
      const imageDraft: PollDraft = {
        id: crypto.randomUUID(),
        question: (
          finalCaption.split("\n")[0] ||
          activeImage.name ||
          "Photo Post"
        )
          .trim()
          .slice(0, 120),
        options: [],
        type: "image",
        postText: finalCaption,
        imageBase64: activeImage.dataBase64,
        imageMimeType: activeImage.mimeType,
        imageName: activeImage.name,
        indexingKeywords: cleanKws.length > 0 ? cleanKws : undefined,
        isAnonymous: false,
        allowsMultipleAnswers: false,
        caption: finalCaption,
      };
      state.drafts = [imageDraft];
      state.lastSourceKind = "image";
      state.lastSourceLabel = activeImage.name;

      if (parsed.alsoPostNow) {
        const verified = await resolveTargetForAction({
          override: parsed.targetChannelOverride,
          defaultChannelId: store.config.channelId,
          defaultChannelTitle: store.config.channelTitle,
          state,
          resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
        });
        if (!verified.ok) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}${verified.error}`;
        } else {
          await dispatchAndRecordDrafts(verified.channelId, [imageDraft]);
          replyText = `✅ ছবি ও ক্যাপশন সরাসরি "${verified.channelTitle}" (${verified.channelId})-এ পোস্ট করা হয়েছে!`;
        }
      } else if (
        parsed.scheduleAtIso &&
        !Number.isNaN(new Date(parsed.scheduleAtIso).getTime())
      ) {
        const verified = await resolveTargetForAction({
          override: parsed.targetChannelOverride,
          defaultChannelId: store.config.channelId,
          defaultChannelTitle: store.config.channelTitle,
          state,
          resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
        });
        if (!verified.ok) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}${verified.error}`;
        } else {
          const startMs = resolveFutureScheduleMs(parsed.scheduleAtIso);
          const nowIso = new Date().toISOString();
          const job: ScheduledPollJob = {
            ...imageDraft,
            id: crypto.randomUUID(),
            scheduledAt: new Date(startMs).toISOString(),
            channelId: verified.channelId,
            status: "pending",
            sourceKind: "image",
            sourceLabel: activeImage.name,
            createdAt: nowIso,
          };
          addJobs([job]);
          const firstLocal = formatLocalDateTime(job.scheduledAt, offsetMinutes);
          replyText = `⏰ ছবি পোস্টটি "${verified.channelTitle}" (${verified.channelId})-এর জন্য ${firstLocal} সময়ে শিডিউল করা হয়েছে।`;
        }
      } else {
        await input.sendReplyTextFn(
          `🖼️ ছবি পোস্ট প্রিভিউ (${activeImage.name}):\n\n${
            finalCaption || "(ক্যাপশন ছাড়া শুধু ছবি)"
          }`
        );
        if (!replyText) {
          replyText =
            'ক্যাপশন পরিবর্তন করতে চাইলে লিখুন, অথবা পোস্ট করতে বলুন: "এখনই চ্যানেলে পোস্ট করো" কিংবা সময় দিয়ে শিডিউল করুন।';
        }
      }
      if (parsed.skippedUnclearNotes?.trim()) {
        const skipTxt = parsed.skippedUnclearNotes.trim();
        if (!replyText.includes(skipTxt)) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}ℹ️ অস্পষ্ট/অনিশ্চিত হওয়ায় ইগনোর করা হয়েছে: ${skipTxt}`;
        }
      }
    }
  } else if (
    action === "generate_polls" ||
    action === "generate_text_posts" ||
    action === "generate_content" ||
    action === "refine_polls"
  ) {
    const cleanKws = normalizeKeywordList(parsed.keywords);
    const prevImageDrafts = state.drafts.filter((d) => d.type === "image");

    // Preserve attached photo if refining an existing image post caption
    let refinedImageDrafts: PollDraft[] = [];
    if (
      action === "refine_polls" &&
      prevImageDrafts.length > 0 &&
      (parsed.imageCaption?.trim() ||
        (parsed.polls ?? []).length === 0)
    ) {
      refinedImageDrafts = prevImageDrafts.map((orig, idx) => {
        const rawCap =
          (idx === 0 && parsed.imageCaption?.trim()) ||
          parsed.textPosts?.[idx]?.content ||
          orig.postText ||
          orig.caption ||
          "";
        const finalCap = appendTagLine(
          rawCap.trim(),
          parsed.indexingKeywordsTag,
          1024
        );
        return {
          ...orig,
          question: (finalCap.split("\n")[0] || orig.question).slice(0, 120),
          postText: finalCap,
          caption: finalCap,
          indexingKeywords:
            cleanKws.length > 0 ? cleanKws : orig.indexingKeywords,
        };
      });
    }

    const nextTexts =
      action === "refine_polls" && refinedImageDrafts.length > 0 && prevImageDrafts.length === state.drafts.length
        ? []
        : sanitizeBrainTextPosts(
            parsed.textPosts ?? [],
            parsed.indexingKeywordsTag,
            cleanKws
          );
    const nextPolls = sanitizeBrainPolls(parsed.polls ?? [], cleanKws);
    const combinedDrafts = [...refinedImageDrafts, ...nextTexts, ...nextPolls];

    if (combinedDrafts.length > 0) {
      state.drafts = combinedDrafts;
      if (input.file) {
        state.lastSourceKind = input.file.sourceKind;
        state.lastSourceLabel = input.file.name;
      } else if (input.userText.trim()) {
        state.lastSourceKind = "text";
        state.lastSourceLabel = input.userText.trim().slice(0, 40);
      }

      if (parsed.alsoPostNow) {
        const verified = await resolveTargetForAction({
          override: parsed.targetChannelOverride,
          defaultChannelId: store.config.channelId,
          defaultChannelTitle: store.config.channelTitle,
          state,
          resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
        });

        if (!verified.ok) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}${verified.error}`;
        } else {
          await dispatchAndRecordDrafts(verified.channelId, combinedDrafts);
          replyText = `✅ ${summarizeDraftCountsBn(combinedDrafts)} সরাসরি "${verified.channelTitle}" (${verified.channelId})-এ পোস্ট করা হয়েছে।`;
        }
      } else if (
        parsed.scheduleAtIso &&
        !Number.isNaN(new Date(parsed.scheduleAtIso).getTime())
      ) {
        const verified = await resolveTargetForAction({
          override: parsed.targetChannelOverride,
          defaultChannelId: store.config.channelId,
          defaultChannelTitle: store.config.channelTitle,
          state,
          resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
        });

        if (!verified.ok) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}${verified.error}`;
        } else {
          const startMs = resolveFutureScheduleMs(parsed.scheduleAtIso);
          const intervalMs =
            Math.max(0, Number(parsed.intervalMinutes ?? 0)) * 60_000;
          const nowIso = new Date().toISOString();
          const jobs: ScheduledPollJob[] = combinedDrafts.map((draft, idx) => ({
            ...draft,
            id: crypto.randomUUID(),
            scheduledAt: new Date(startMs + idx * intervalMs).toISOString(),
            channelId: verified.channelId,
            status: "pending",
            sourceKind: draft.type === "image" ? "image" : state.lastSourceKind,
            sourceLabel: draft.imageName || state.lastSourceLabel,
            createdAt: nowIso,
          }));
          addJobs(jobs);
          const firstLocal = formatLocalDateTime(
            jobs[0].scheduledAt,
            offsetMinutes
          );
          replyText = `${replyText ? `${replyText}\n\n` : ""}⏰ ${summarizeDraftCountsBn(combinedDrafts)} "${verified.channelTitle}" (${verified.channelId})-এর জন্য শিডিউল হয়েছে (${firstLocal})।`;
        }
      } else {
        for (let i = 0; i < refinedImageDrafts.length; i++) {
          const imgDraft = refinedImageDrafts[i];
          await input.sendReplyTextFn(
            `🖼️ ছবি পোস্ট প্রিভিউ (${imgDraft.imageName || "photo"}):\n\n${
              imgDraft.postText || imgDraft.caption || ""
            }`
          );
        }

        for (let i = 0; i < nextTexts.length; i++) {
          const textDraft = nextTexts[i];
          const label =
            nextTexts.length > 1
              ? `📝 টেক্সট পোস্ট প্রিভিউ #${i + 1}:\n\n`
              : "📝 টেক্সট পোস্ট প্রিভিউ:\n\n";
          await input.sendReplyTextFn(
            `${label}${textDraft.postText || textDraft.question}`
          );
        }

        for (let i = 0; i < nextPolls.length; i++) {
          const poll = nextPolls[i];
          if (i > 0 && nextPolls.length > 4) {
            await new Promise((r) => setTimeout(r, 250));
          }
          try {
            await input.sendPreviewPollFn(poll);
          } catch {
            replyText += `\n\n📊 ${i + 1}. ${poll.question}\n${poll.options
              .map((o, idx) => `${idx + 1}. ${o}`)
              .join("\n")}`;
          }
        }
      }

      if (parsed.skippedUnclearNotes?.trim()) {
        const skipTxt = parsed.skippedUnclearNotes.trim();
        if (!replyText.includes(skipTxt)) {
          replyText = `${replyText ? `${replyText}\n\n` : ""}ℹ️ অস্পষ্ট/অনিশ্চিত হওয়ায় ইগনোর করা হয়েছে: ${skipTxt}`;
        }
      }
    } else if (
      parsed.skippedUnclearNotes?.trim() ||
      (parsed.polls?.length ?? 0) > 0 ||
      (parsed.textPosts?.length ?? 0) > 0
    ) {
      const skipDetail = parsed.skippedUnclearNotes?.trim();
      replyText = skipDetail
        ? `⚠️ তথ্য অস্পষ্ট বা অনিশ্চিত হওয়ায় ভুল এড়াতে কোনো পোল বা পোস্ট তৈরি করা হয়নি (${skipDetail})। অনুগ্রহ করে আরও স্পষ্ট তথ্য দিন।`
        : "⚠️ কিছু তথ্য অস্পষ্ট বা সঠিক উত্তর নিশ্চিত না হওয়ায় ভুল এড়াতে সেগুলো ইগনোর করা হয়েছে। অনুগ্রহ করে আরও স্পষ্ট প্রশ্ন বা তথ্য দিন।";
    }
  } else if (action === "post_to_channel") {
    if (state.drafts.length === 0) {
      replyText =
        "এখনও কোনো পোল, ছবি বা টেক্সট পোস্ট ড্রাফট নেই। আগে টেক্সট, ছবি বা পিডিএফ পাঠিয়ে পোল, ছবি পোস্ট অথবা টেক্সট পোস্ট তৈরি করতে বলুন।";
    } else {
      const verified = await resolveTargetForAction({
        override: parsed.targetChannelOverride,
        defaultChannelId: store.config.channelId,
        defaultChannelTitle: store.config.channelTitle,
        state,
        resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
      });

      if (!verified.ok) {
        replyText = verified.error;
      } else {
        const indices =
          Array.isArray(parsed.pollIndices) && parsed.pollIndices.length > 0
            ? parsed.pollIndices
            : state.drafts.map((_, i) => i);
        const selected = indices
          .map((i) => state.drafts[i])
          .filter((p): p is PollDraft => Boolean(p));

        await dispatchAndRecordDrafts(verified.channelId, selected);
        replyText = `✅ ${summarizeDraftCountsBn(selected)} "${verified.channelTitle}" (${verified.channelId})-এ সফলভাবে পোস্ট করা হয়েছে।`;
      }
    }
  } else if (action === "schedule_polls") {
    if (state.drafts.length === 0) {
      replyText =
        "শিডিউল করার জন্য কোনো পোল, ছবি বা টেক্সট পোস্ট ড্রাফট নেই। আগে টেক্সট, ছবি বা পিডিএফ পাঠিয়ে কনটেন্ট তৈরি করুন।";
    } else if (
      !parsed.scheduleAtIso ||
      Number.isNaN(new Date(parsed.scheduleAtIso).getTime())
    ) {
      replyText =
        "কোন সময় শিডিউল করবো তা বুঝতে পারিনি। অনুগ্রহ করে নির্দিষ্ট সময় উল্লেখ করুন (যেমন: 'রাত ৯টায়' বা '৩০ মিনিট পর')।";
    } else {
      const verified = await resolveTargetForAction({
        override: parsed.targetChannelOverride,
        defaultChannelId: store.config.channelId,
        defaultChannelTitle: store.config.channelTitle,
        state,
        resolveAndVerifyChannelFn: input.resolveAndVerifyChannelFn,
      });

      if (!verified.ok) {
        replyText = verified.error;
      } else {
        const indices =
          Array.isArray(parsed.pollIndices) && parsed.pollIndices.length > 0
            ? parsed.pollIndices
            : state.drafts.map((_, i) => i);
        const selected = indices
          .map((i) => state.drafts[i])
          .filter((p): p is PollDraft => Boolean(p));

        const startMs = resolveFutureScheduleMs(parsed.scheduleAtIso);
        const intervalMs =
          Math.max(0, Number(parsed.intervalMinutes ?? 0)) * 60_000;
        const nowIso = new Date().toISOString();
        const created: ScheduledPollJob[] = selected.map((draft, idx) => ({
          ...draft,
          id: crypto.randomUUID(),
          scheduledAt: new Date(startMs + idx * intervalMs).toISOString(),
          channelId: verified.channelId,
          status: "pending",
          sourceKind: draft.type === "image" ? "image" : state.lastSourceKind,
          sourceLabel: draft.imageName || state.lastSourceLabel,
          createdAt: nowIso,
        }));
        addJobs(created);
        const firstLocal = formatLocalDateTime(
          created[0].scheduledAt,
          offsetMinutes
        );
        replyText = `${replyText ? `${replyText}\n\n` : ""}⏰ নিশ্চিত হয়েছে: ${summarizeDraftCountsBn(selected)} "${verified.channelTitle}" (${verified.channelId})-এ ${firstLocal} সময়ে পোস্ট হবে।`;
      }
    }
  } else if (action === "list_schedules") {
    if (pendingJobs.length === 0) {
      replyText = "বর্তমানে কোনো আসন্ন শিডিউল করা পোল বা পোস্ট নেই।";
    } else {
      const lines = pendingJobs.map(
        (j) =>
          `${j.index}. [${j.status} · ${j.type}] ${j.scheduledLocal} — ${j.question}`
      );
      replyText = `📅 আসন্ন শিডিউল তালিকা:\n\n${lines.join("\n")}\n\nযেকোনো নম্বর বলে পজ, রিসিউম, সময় বদলানো বা এখনই পোস্ট করতে বলতে পারেন।`;
    }
  } else if (action === "cancel_schedule") {
    const job = resolveJobByIdOrIndex(
      parsed.targetJobId || parsed.cancelJobId,
      pendingJobs
    );
    if (!job) {
      replyText =
        replyText || "কোন শিডিউলটি পজ/বাতিল করবো তা খুঁজে পাওয়া যায়নি। আগে 'শিডিউল দেখাও' লিখুন।";
    } else {
      updateJob(job.id, (cur) => ({ ...cur, status: "paused" }));
      replyText = replyText || `⏸️ "${job.question}" শিডিউলটি বিরতিতে (Paused) রাখা হয়েছে।`;
    }
  } else if (action === "resume_schedule") {
    const job = resolveJobByIdOrIndex(
      parsed.targetJobId || parsed.cancelJobId,
      pendingJobs
    );
    if (!job) {
      replyText =
        replyText || "চালু করার মতো শিডিউল খুঁজে পাওয়া যায়নি।";
    } else {
      updateJob(job.id, (cur) => ({
        ...cur,
        status: "pending",
        errorMessage: undefined,
      }));
      replyText = replyText || `▶️ "${job.question}" শিডিউলটি পুনরায় চালু করা হয়েছে।`;
    }
  } else if (action === "reschedule_job") {
    const job = resolveJobByIdOrIndex(
      parsed.targetJobId || parsed.cancelJobId,
      pendingJobs
    );
    if (!job) {
      replyText = replyText || "সময় পরিবর্তনের জন্য শিডিউলটি খুঁজে পাওয়া যায়নি।";
    } else if (
      !parsed.scheduleAtIso ||
      Number.isNaN(new Date(parsed.scheduleAtIso).getTime())
    ) {
      replyText = "নতুন কোন সময়ে শিডিউল করবো তা স্পষ্ট করে বলুন।";
    } else {
      const nextMs = resolveFutureScheduleMs(parsed.scheduleAtIso);
      const nextIso = new Date(nextMs).toISOString();
      updateJob(job.id, (cur) => ({
        ...cur,
        scheduledAt: nextIso,
        status: "pending",
        errorMessage: undefined,
      }));
      replyText = `⏰ "${job.question}"-এর নতুন সময় নির্ধারিত হয়েছে: ${formatLocalDateTime(
        nextIso,
        offsetMinutes
      )}।`;
    }
  } else if (action === "trigger_scheduled_now") {
    const job = resolveJobByIdOrIndex(
      parsed.targetJobId || parsed.cancelJobId,
      pendingJobs
    );
    if (!job) {
      replyText = replyText || "এখনই পোস্ট করার জন্য শিডিউলটি খুঁজে পাওয়া যায়নি।";
    } else {
      const { messageId } = await input.dispatchPollFn(job.channelId, job);
      updateJob(job.id, (cur) => ({
        ...cur,
        status: "posted",
        postedAt: new Date().toISOString(),
        telegramMessageId: messageId,
        errorMessage: undefined,
      }));
      replyText = `✅ "${job.question}" নির্ধারিত সময়ের আগেই ${job.channelId}-এ পোস্ট করা হয়েছে!`;
    }
  }

  if (replyText) {
    await input.sendReplyTextFn(replyText);
    state.history.push({ role: "agent", text: replyText });
  }

  if (state.history.length > 16) {
    state.history = state.history.slice(-12);
  }
}
