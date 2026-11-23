import { useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  Type as TypeIcon,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { COPY } from "../i18n";
import type {
  OutputFormat,
  PollCustomizationOptions,
  PollDraft,
  PublicTelegramConfig,
  SourceKind,
  UiLang,
} from "../types";
import { TelegramPollPreview } from "./TelegramPollPreview";

interface AgentStudioProps {
  lang: UiLang;
  config: PublicTelegramConfig | null;
  onNotify: (type: "success" | "error", message: string) => void;
  onOpenChannelSettings: () => void;
  onSchedulesCreated: () => void;
  onOpenQueue: () => void;
}

interface AttachedFile {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
  previewUrl?: string;
}

function getDefaultLocalDateTime(): string {
  const target = new Date(Date.now() + 15 * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(
    target.getDate()
  )}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

export function AgentStudio({
  lang,
  config,
  onNotify,
  onOpenChannelSettings,
  onSchedulesCreated,
  onOpenQueue,
}: AgentStudioProps) {
  const t = COPY[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceKind, setSourceKind] = useState<SourceKind>("text");
  const [textInput, setTextInput] = useState("");
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [agentInstruction, setAgentInstruction] = useState("");

  const [outputFormat, setOutputFormat] = useState<OutputFormat>("polls");
  const [pollCount, setPollCount] = useState<number | "all">("all");
  const [pollMode, setPollMode] = useState<"auto" | "regular" | "quiz">("auto");
  const [outputLang, setOutputLang] = useState<"auto" | "bn" | "en">("auto");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);

  const [showAiCustom, setShowAiCustom] = useState(true);
  const [optionsPerPoll, setOptionsPerPoll] = useState<
    "auto" | 2 | 3 | 4 | 5 | 6
  >("auto");
  const [difficulty, setDifficulty] = useState<
    "auto" | "easy" | "medium" | "hard"
  >("auto");
  const [tone, setTone] = useState<"auto" | "exam" | "engaging" | "concise">(
    "auto"
  );
  const [explanationMode, setExplanationMode] = useState<
    "auto" | "include" | "omit"
  >("auto");
  const [sourceFidelity, setSourceFidelity] = useState<
    "balanced" | "strict_verbatim"
  >("balanced");
  const [numberingStyle, setNumberingStyle] = useState<"none" | "bn" | "en">(
    "none"
  );
  const [questionPrefix, setQuestionPrefix] = useState("");
  const [shuffleOptions, setShuffleOptions] = useState(false);

  const [indexingKeywords, setIndexingKeywords] = useState("");
  const [indexTargetChannel, setIndexTargetChannel] = useState("");
  const [isIndexing, setIsIndexing] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingDirect, setIsParsingDirect] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [isPostingAll, setIsPostingAll] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [showManualComposer, setShowManualComposer] = useState(false);
  const [manualType, setManualType] = useState<"quiz" | "regular">("quiz");
  const [manualQuestion, setManualQuestion] = useState("");
  const [manualOptions, setManualOptions] = useState<string[]>(["", "", "", ""]);
  const [manualCorrectIdx, setManualCorrectIdx] = useState<number | null>(null);
  const [manualExplanation, setManualExplanation] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [isSendingManual, setIsSendingManual] = useState(false);

  const [agentSummary, setAgentSummary] = useState("");
  const [drafts, setDrafts] = useState<PollDraft[]>([]);
  const [refinePrompt, setRefinePrompt] = useState("");

  const [scheduleStart, setScheduleStart] = useState(getDefaultLocalDateTime);
  const [intervalMinutes, setIntervalMinutes] = useState<number>(30);

  const channelDisplay =
    config?.channelTitle || config?.channelId || "@your_channel";
  const isChannelReady =
    config?.authMode === "user"
      ? Boolean(config?.hasUserSession && config?.channelId)
      : Boolean(config?.hasBotToken && config?.channelId);

  const handleLoadSample = () => {
    setInlineError(null);
    setSourceKind("text");
    if (lang === "bn") {
      setTextInput(
        "কৃত্রিম বুদ্ধিমত্তা (AI) ও অটোমেশন ২০২৬ সালে কনটেন্ট ক্রিয়েটরদের কাজের ধরন দ্রুত বদলে দিচ্ছে। রুটিন কাজগুলো এআই এজেন্টের হাতে ছেড়ে দিলে ক্রিয়েটররা মূল গবেষণা ও কৌশলগত পরিকল্পনায় বেশি সময় দিতে পারেন। তবে তথ্যের সঠিকতা যাচাই এবং মানবিক সৃজনশীলতা বজায় রাখা এখনও সবচেয়ে গুরুত্বপূর্ণ।"
      );
      setAgentInstruction(
        "পাঠকদের মতামত ও অংশগ্রহণ বাড়ানোর জন্য পসিবল সবগুলো আকর্ষণীয় পোল তৈরি করো।"
      );
    } else {
      setTextInput(
        "In 2026, personal AI agents are reshaping how independent publishers and educators manage communities. Automating routine summaries, quizzes, and polls frees up creators for deeper research while keeping audiences actively engaged."
      );
      setAgentInstruction(
        "Create all possible engaging polls tailored for a tech & productivity Telegram channel."
      );
    }
  };

  const handleLoadSampleReadyPoll = () => {
    setInlineError(null);
    setSourceKind("text");
    setOutputFormat("polls");
    if (lang === "bn") {
      setTextInput(
        [
          "১. বাংলাদেশের জাতীয় সংসদের আসন সংখ্যা মোট কতটি?",
          "ক) ৩০০টি",
          "খ) ৩৩০টি",
          "গ) ৩৫০টি",
          "ঘ) ৪০০টি",
          "উত্তর: গ",
          "ব্যাখ্যা: ৩০০টি সরাসরি নির্বাচিত আসন এবং ৫০টি সংরক্ষিত মহিলা আসনসহ মোট ৩৫০টি।",
          "",
          "২. কম্পিউটারের মস্তিষ্ক বলা হয় কোনটিকে?",
          "ক) RAM",
          "খ) CPU",
          "গ) ROM",
          "ঘ) Hard Disk",
          "উত্তর: খ",
        ].join("\n")
      );
    } else {
      setTextInput(
        [
          "1. Which planet is known as the Red Planet?",
          "A) Venus",
          "B) Mars",
          "C) Jupiter",
          "D) Saturn",
          "Answer: B",
          "Explanation: Iron oxide on Mars gives it its reddish appearance.",
          "",
          "2. What is the SI unit of electrical resistance?",
          "A) Volt",
          "B) Ampere",
          "C) Ohm",
          "D) Watt",
          "Answer: C",
        ].join("\n")
      );
    }
  };

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    setInlineError(null);
    const lowerName = file.name.toLowerCase();
    const isImage =
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif)$/i.test(lowerName);
    const isPdf =
      file.type === "application/pdf" || lowerName.endsWith(".pdf");

    if (sourceKind === "image" && !isImage) {
      const msg =
        lang === "bn"
          ? "অনুগ্রহ করে PNG, JPG অথবা WEBP ইমেজ নির্বাচন করুন।"
          : "Please select a PNG, JPG, or WEBP image.";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }
    if (sourceKind === "pdf" && !isPdf) {
      const msg =
        lang === "bn"
          ? "অনুগ্রহ করে একটি বৈধ PDF ফাইল নির্বাচন করুন।"
          : "Please select a valid PDF document.";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      const msg =
        lang === "bn"
          ? "ফাইলের আকার ২০ MB এর কম হতে হবে।"
          : "File size must be under 20 MB.";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }

    const resolvedMime =
      file.type ||
      (isPdf
        ? "application/pdf"
        : lowerName.endsWith(".png")
          ? "image/png"
          : lowerName.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg");

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      setAttachedFile({
        name: file.name,
        mimeType: resolvedMime,
        sizeBytes: file.size,
        dataBase64: base64,
        previewUrl: isImage ? result : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    setInlineError(null);
    if (outputFormat === "image_post") {
      if (
        sourceKind !== "image" ||
        !attachedFile ||
        !attachedFile.mimeType.startsWith("image/")
      ) {
        setInlineError(t.noImageWarning);
        onNotify("error", t.noImageWarning);
        return;
      }
    } else {
      if (sourceKind === "text" && !textInput.trim()) {
        const msg =
          lang === "bn"
            ? "অনুগ্রহ করে কিছু টেক্সট লিখুন বা পেস্ট করুন।"
            : "Please enter or paste some text first.";
        setInlineError(msg);
        onNotify("error", msg);
        return;
      }
      if ((sourceKind === "image" || sourceKind === "pdf") && !attachedFile) {
        const msg =
          lang === "bn"
            ? "অনুগ্রহ করে একটি ফাইল আপলোড করুন।"
            : "Please upload a file first.";
        setInlineError(msg);
        onNotify("error", msg);
        return;
      }
    }

    setIsGenerating(true);
    try {
      const res = await fetch("/api/agent/generate-polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textInput.trim() || undefined,
          file: attachedFile
            ? {
                name: attachedFile.name,
                mimeType: attachedFile.mimeType,
                dataBase64: attachedFile.dataBase64,
              }
            : undefined,
          agentInstruction: agentInstruction.trim() || undefined,
          outputFormat,
          indexingKeywords: indexingKeywords.trim() || undefined,
          pollCount,
          pollType: pollMode,
          language: outputLang,
          isAnonymous,
          allowsMultipleAnswers: allowsMultiple,
          customization: {
            optionsPerPoll,
            difficulty,
            tone,
            explanationMode,
            sourceFidelity,
            numberingStyle,
            questionPrefix: questionPrefix.trim() || undefined,
            shuffleOptions,
          } satisfies PollCustomizationOptions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Generation failed");
      }

      const generatedPolls: PollDraft[] = data.polls || [];
      const firstPoll = generatedPolls.find(
        (p) => p.type !== "text" && p.type !== "image"
      );
      if (data.recommendedCaption && firstPoll) {
        firstPoll.caption = data.recommendedCaption;
      }

      setAgentSummary(data.agentSummary || "");
      setDrafts(generatedPolls);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate content";
      setInlineError(msg);
      onNotify("error", msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIndexChannel = async () => {
    setInlineError(null);
    const targetCh = (indexTargetChannel || config?.channelId || "").trim();
    if (!targetCh) {
      const msg =
        lang === "bn"
          ? "ইনডেক্স করার জন্য চ্যানেলের @username অথবা t.me লিংক দিন (কিংবা আগে চ্যানেল সংযুক্ত করুন)।"
          : "Enter a channel @username or t.me link to index (or connect a channel first).";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }

    setIsIndexing(true);
    try {
      const res = await fetch("/api/agent/index-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: targetCh,
          keywords: indexingKeywords.trim(),
          language: outputLang === "auto" ? lang : outputLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Indexing failed");
      }

      if (data.draft) {
        setDrafts([data.draft]);
      }
      setAgentSummary(
        lang === "bn"
          ? `"${data.channelTitle || targetCh}" চ্যানেলে ${data.matchedCount ?? 0}টি ম্যাচিং পোস্ট খুঁজে ইনডেক্স তৈরি করা হয়েছে। এখন প্রিভিউ দেখে পোস্ট বা শিডিউল করতে পারেন।`
          : `Indexed ${data.matchedCount ?? 0} matching post(s) in "${data.channelTitle || targetCh}". Review and post or schedule below.`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Channel indexing failed";
      setInlineError(msg);
      onNotify("error", msg);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleAddDirectTextPost = () => {
    setInlineError(null);
    const content = textInput.trim().slice(0, 4096);
    if (!content) {
      const msg =
        lang === "bn"
          ? "অনুগ্রহ করে পোস্টের লেখা লিখুন বা পেস্ট করুন।"
          : "Please enter or paste your post text first.";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }
    const firstLine = content.split("\n")[0]?.trim() || content;
    const kwList = indexingKeywords
      .split(/[,;\n|]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const tagLine = kwList
      .map((k) => (k.startsWith("#") ? k : `#${k.replace(/\s+/g, "_")}`))
      .join(" ");
    const fullContent = tagLine
      ? `${content}\n\n${tagLine}`.slice(0, 4096)
      : content;

    const newDraft: PollDraft = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: firstLine.slice(0, 120),
      options: [],
      type: "text",
      postText: fullContent,
      indexingKeywords: kwList.length > 0 ? kwList : undefined,
      isAnonymous: false,
      allowsMultipleAnswers: false,
      caption: "",
    };
    setDrafts((prev) => [newDraft, ...prev]);
    if (!agentSummary) {
      setAgentSummary(
        lang === "bn"
          ? "আপনার লেখাটি সরাসরি টেলিগ্রাম টেক্সট পোস্ট হিসেবে প্রিভিউতে যোগ করা হয়েছে।"
          : "Your text has been added directly as a Telegram channel post draft."
      );
    }
  };

  const handleAddDirectImagePost = () => {
    setInlineError(null);
    if (!attachedFile || !attachedFile.mimeType.startsWith("image/")) {
      setInlineError(t.noImageWarning);
      onNotify("error", t.noImageWarning);
      return;
    }

    const kwList = indexingKeywords
      .split(/[,;\n|]+/)
      .map((k) => k.trim())
      .filter(Boolean);
    const tagLine = kwList
      .map((k) => (k.startsWith("#") ? k : `#${k.replace(/\s+/g, "_")}`))
      .join(" ");
    const rawCaption = textInput.trim();
    const fullCaption = [rawCaption, tagLine]
      .filter(Boolean)
      .join(rawCaption ? "\n\n" : "")
      .slice(0, 1024);

    const newDraft: PollDraft = {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question: (
        fullCaption.split("\n")[0] ||
        attachedFile.name ||
        "Photo Post"
      ).slice(0, 120),
      options: [],
      type: "image",
      postText: fullCaption,
      imageBase64: attachedFile.dataBase64,
      imageMimeType: attachedFile.mimeType,
      imageName: attachedFile.name,
      indexingKeywords: kwList.length > 0 ? kwList : undefined,
      isAnonymous: false,
      allowsMultipleAnswers: false,
      caption: fullCaption,
    };
    setDrafts((prev) => [newDraft, ...prev]);
    if (!agentSummary) {
      setAgentSummary(
        lang === "bn"
          ? "আপনার ছবিটি সরাসরি টেলিগ্রাম ছবি পোস্ট হিসেবে প্রিভিউতে যোগ করা হয়েছে।"
          : "Your photo has been added directly to preview as a Telegram photo post."
      );
    }
  };

  const handleRefine = async () => {
    if (!refinePrompt.trim() || drafts.length === 0) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/agent/refine-polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polls: drafts,
          instruction: refinePrompt.trim(),
          language: outputLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Refinement failed");
      }
      setAgentSummary(data.agentSummary || agentSummary);
      setDrafts(data.polls || drafts);
      setRefinePrompt("");
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Could not refine polls"
      );
    } finally {
      setIsRefining(false);
    }
  };

  const handlePostNow = async (poll: PollDraft) => {
    if (!isChannelReady) {
      onNotify("error", t.channelWarningBanner);
      onOpenChannelSettings();
      return;
    }
    setPostingId(poll.id);
    try {
      const res = await fetch("/api/telegram/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poll,
          sourceKind,
          sourceLabel:
            attachedFile?.name ||
            textInput.trim().slice(0, 40) ||
            "Direct post",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to post poll");
      }
      onNotify(
        "success",
        lang === "bn"
          ? `${
              poll.type === "image"
                ? "ছবি পোস্টটি"
                : poll.type === "text"
                  ? "টেক্সট পোস্টটি"
                  : "পোলটি"
            } সফলভাবে ${channelDisplay}-এ পোস্ট করা হয়েছে।`
          : `${
              poll.type === "image"
                ? "Photo post"
                : poll.type === "text"
                  ? "Text post"
                  : "Poll"
            } posted to ${channelDisplay}.`
      );
      onSchedulesCreated();
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Telegram post failed"
      );
    } finally {
      setPostingId(null);
    }
  };

  const handleBatchShuffleOptions = () => {
    setDrafts((prev) =>
      prev.map((poll) => {
        if (poll.type === "text" || poll.type === "image" || poll.options.length < 2) {
          return poll;
        }
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
      })
    );
    onNotify(
      "success",
      lang === "bn"
        ? "সঠিক উত্তর অক্ষুণ্ণ রেখে সব পোলের অপশন শাফেল করা হয়েছে।"
        : "Shuffled options across all polls while keeping verified answers aligned."
    );
  };

  const handleBatchApplyNumbering = (mode: "none" | "bn" | "en") => {
    const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    const toBn = (num: number) =>
      String(num)
        .split("")
        .map((c) => (c >= "0" && c <= "9" ? bnDigits[Number(c)] : c))
        .join("");

    let pollIdx = 0;
    setDrafts((prev) =>
      prev.map((poll) => {
        if (poll.type === "text" || poll.type === "image") return poll;
        pollIdx += 1;
        const stripped = poll.question
          .replace(/^\s*(?:প্রশ্ন\s*[০-৯\d]{1,3}\s*[:：\.\-]\s*|[০-৯\d]{1,3}\s*[\.\)]\s*)/, "")
          .trim();
        if (mode === "none") {
          return { ...poll, question: stripped };
        }
        const numPrefix = mode === "bn" ? `${toBn(pollIdx)}. ` : `${pollIdx}. `;
        return {
          ...poll,
          question: `${numPrefix}${stripped}`.slice(0, 300),
        };
      })
    );
  };

  const handleParseDirectReadyPolls = async () => {
    setInlineError(null);
    if (!textInput.trim()) {
      const msg =
        lang === "bn"
          ? "প্রশ্ন, অপশন এবং উত্তরসহ রেডি পোল টেক্সট লিখুন বা পেস্ট করুন।"
          : "Please enter or paste ready poll text first.";
      setInlineError(msg);
      onNotify("error", msg);
      return;
    }

    setIsParsingDirect(true);
    try {
      const res = await fetch("/api/agent/parse-ready-polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textInput,
          pollType: pollMode,
          isAnonymous,
          allowsMultipleAnswers: allowsMultiple,
          indexingKeywords: indexingKeywords.trim() || undefined,
          language: outputLang === "auto" ? lang : outputLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse ready polls");
      }

      const parsedPolls: PollDraft[] = data.polls || [];
      setDrafts(parsedPolls);
      setAgentSummary(data.agentSummary || "");
      if (Array.isArray(data.skippedNotes) && data.skippedNotes.length > 0) {
        onNotify(
          "error",
          lang === "bn"
            ? `${parsedPolls.length}টি সঠিক পোল নেওয়া হয়েছে; ভুল এড়াতে ${data.skippedNotes.length}টি বাদ গেছে (${data.skippedNotes[0]})`
            : `${parsedPolls.length} poll(s) loaded; skipped ${data.skippedNotes.length}: ${data.skippedNotes[0]}`
        );
      } else {
        onNotify(
          "success",
          lang === "bn"
            ? `হুবহু বানানে ${parsedPolls.length}টি যাচাইকৃত পোল প্রিভিউতে লোড হয়েছে।`
            : `${parsedPolls.length} verbatim poll(s) loaded to preview.`
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not parse ready polls";
      setInlineError(msg);
      onNotify("error", msg);
    } finally {
      setIsParsingDirect(false);
    }
  };

  const buildValidatedManualPoll = (): PollDraft | null => {
    setManualError(null);
    const question = manualQuestion.trim();
    if (!question) {
      setManualError(
        lang === "bn"
          ? "পোলের প্রশ্ন লিখুন।"
          : "Please enter a poll question."
      );
      return null;
    }
    if (question.length > 300) {
      setManualError(
        lang === "bn"
          ? `প্রশ্নটি ${question.length} অক্ষর — টেলিগ্রামে সর্বোচ্চ ৩০০ অক্ষর অনুমোদিত।`
          : `Question is ${question.length} chars (Telegram max 300).`
      );
      return null;
    }

    const indexedClean = manualOptions.map((raw, origIdx) => ({
      origIdx,
      text: raw.trim(),
    }));
    const nonEmpty = indexedClean.filter((o) => o.text.length > 0);
    if (nonEmpty.length < 2) {
      setManualError(
        lang === "bn"
          ? "অন্তত ২টি পূরণকৃত অপশন দিন।"
          : "Please provide at least 2 non-empty options."
      );
      return null;
    }

    const tooLongOpt = nonEmpty.find((o) => o.text.length > 100);
    if (tooLongOpt) {
      setManualError(
        lang === "bn"
          ? `একটি অপশন ${tooLongOpt.text.length} অক্ষরের বেশি (সর্বোচ্চ ১০০ অক্ষর অনুমোদিত)।`
          : `An option exceeds 100 characters (${tooLongOpt.text.length}/100).`
      );
      return null;
    }

    const seen = new Set<string>();
    for (const o of nonEmpty) {
      const key = o.text.toLowerCase();
      if (seen.has(key)) {
        setManualError(
          lang === "bn"
            ? `একই অপশন ("${o.text}") একাধিকবার রয়েছে — প্রতিটি অপশন আলাদা হতে হবে।`
            : `Duplicate option "${o.text}" — all options must be distinct.`
        );
        return null;
      }
      seen.add(key);
    }

    let resolvedCorrectIdx: number | undefined;
    if (manualType === "quiz") {
      if (
        manualCorrectIdx === null ||
        !manualOptions[manualCorrectIdx] ||
        !manualOptions[manualCorrectIdx].trim()
      ) {
        setManualError(
          lang === "bn"
            ? "ভুল এড়াতে কুইজের সঠিক উত্তর অপশনটির পাশে ক্লিক করে নির্বাচন করুন।"
            : "Select a valid non-empty option as the verified quiz answer."
        );
        return null;
      }
      const mapped = nonEmpty.findIndex((o) => o.origIdx === manualCorrectIdx);
      if (mapped < 0) {
        setManualError(
          lang === "bn"
            ? "সঠিক উত্তরটি সঠিকভাবে নির্বাচন করুন।"
            : "Could not resolve selected correct answer."
        );
        return null;
      }
      resolvedCorrectIdx = mapped;
    }

    const explanation = manualExplanation.trim();
    if (manualType === "quiz" && explanation.length > 200) {
      setManualError(
        lang === "bn"
          ? `কুইজ ব্যাখ্যা ${explanation.length} অক্ষর (সর্বোচ্চ ২০০ অক্ষর অনুমোদিত)।`
          : `Explanation is ${explanation.length} chars (Telegram max 200).`
      );
      return null;
    }

    const kwList = indexingKeywords
      .split(/[,;\n|]+/)
      .map((k) => k.trim())
      .filter(Boolean);

    return {
      id:
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      question,
      options: nonEmpty.map((o) => o.text),
      type: manualType,
      correctOptionIndex: resolvedCorrectIdx,
      explanation: manualType === "quiz" ? explanation : "",
      indexingKeywords: kwList.length > 0 ? kwList : undefined,
      isAnonymous,
      allowsMultipleAnswers: manualType === "regular" ? allowsMultiple : false,
      caption: "",
    };
  };

  const resetManualComposer = () => {
    setManualQuestion("");
    setManualOptions(["", "", "", ""]);
    setManualCorrectIdx(null);
    setManualExplanation("");
    setManualError(null);
  };

  const handleAddManualPollToPreview = () => {
    const built = buildValidatedManualPoll();
    if (!built) return;
    setDrafts((prev) => [...prev, built]);
    setAgentSummary(
      lang === "bn"
        ? "ম্যানুয়ালি তৈরি করা হুবহু বানান ও যাচাইকৃত সঠিক উত্তরসহ পোল প্রিভিউতে যুক্ত হয়েছে।"
        : "Your manually verified poll has been added to preview."
    );
    resetManualComposer();
    onNotify(
      "success",
      lang === "bn"
        ? "নির্ভুল পোল প্রিভিউতে যুক্ত হয়েছে।"
        : "Verified poll added to preview."
    );
  };

  const handleSendManualPollDirect = async () => {
    const built = buildValidatedManualPoll();
    if (!built) return;
    if (!isChannelReady) {
      onNotify("error", t.channelWarningBanner);
      onOpenChannelSettings();
      return;
    }

    setIsSendingManual(true);
    try {
      const res = await fetch("/api/telegram/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poll: built,
          sourceKind: "text",
          sourceLabel: "Manual ready poll",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send poll");
      }
      resetManualComposer();
      onNotify(
        "success",
        lang === "bn"
          ? `পোলটি যাচাই করে সরাসরি ${channelDisplay}-এ পাঠানো হয়েছে।`
          : `Verified poll sent directly to ${channelDisplay}.`
      );
      onSchedulesCreated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Telegram post failed";
      setManualError(msg);
      onNotify("error", msg);
    } finally {
      setIsSendingManual(false);
    }
  };

  const handlePostAllNow = async () => {
    if (drafts.length === 0) return;
    if (!isChannelReady) {
      onNotify("error", t.channelWarningBanner);
      onOpenChannelSettings();
      return;
    }

    setIsPostingAll(true);
    let sentCount = 0;
    try {
      for (let i = 0; i < drafts.length; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 300));
        }
        const poll = drafts[i];
        const res = await fetch("/api/telegram/send-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            poll,
            sourceKind,
            sourceLabel:
              attachedFile?.name ||
              textInput.trim().slice(0, 40) ||
              "Direct batch post",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Failed on item #${i + 1}`);
        }
        sentCount++;
      }
      onNotify(
        "success",
        lang === "bn"
          ? `সফলভাবে সবগুলো (${sentCount}টি) কনটেন্ট সরাসরি ${channelDisplay}-এ পোস্ট করা হয়েছে।`
          : `Successfully posted all ${sentCount} item(s) to ${channelDisplay}.`
      );
      onSchedulesCreated();
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error
          ? `${sentCount}/${drafts.length} posted. ${err.message}`
          : "Batch posting failed"
      );
    } finally {
      setIsPostingAll(false);
    }
  };

  const handleScheduleAll = async () => {
    if (drafts.length === 0) return;
    if (!config?.channelId) {
      onNotify("error", t.channelWarningBanner);
      onOpenChannelSettings();
      return;
    }

    const startIso = new Date(scheduleStart).toISOString();
    setIsScheduling(true);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          polls: drafts,
          startAt: startIso,
          intervalMinutes,
          sourceKind,
          sourceLabel:
            attachedFile?.name ||
            textInput.trim().slice(0, 40) ||
            "Scheduled batch",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Scheduling failed");
      }
      onNotify(
        "success",
        lang === "bn"
          ? `${drafts.length}টি আইটেম সময়সূচীতে যুক্ত হয়েছে।`
          : `${drafts.length} item(s) added to the schedule queue.`
      );
      onSchedulesCreated();
      onOpenQueue();
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Could not schedule items"
      );
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-emerald-300 hacker-glow-text">
          {t.studioTitle}
        </h1>
        <p className="mt-1 text-sm text-slate-400 max-w-3xl">
          {t.studioSubtitle}
        </p>
      </div>

      {/* Subtle connection reminder if unconfigured */}
      {!isChannelReady && (
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-amber-950/40 border border-amber-500/40 rounded-sm text-sm text-amber-200 backdrop-blur-sm">
          <span>{t.channelWarningBanner}</span>
          <button
            type="button"
            onClick={onOpenChannelSettings}
            className="px-3 py-1.5 text-xs font-semibold font-mono text-amber-950 bg-amber-400 rounded-sm hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.configureChannelLink}
          </button>
        </div>
      )}

      {/* Two-Column Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Multimodal Source Input & Agent Controls */}
        <div className="lg:col-span-5 hacker-panel rounded-sm p-5 space-y-5">
          {/* Source Type Segmented Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
            <button
              type="button"
              onClick={() => {
                setSourceKind("text");
                setAttachedFile(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                sourceKind === "text"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <TypeIcon className="w-3.5 h-3.5" />
              {t.tabText}
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceKind("image");
                setAttachedFile(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                sourceKind === "image"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {t.tabImage}
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceKind("pdf");
                setAttachedFile(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                sourceKind === "pdf"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              {t.tabPdf}
            </button>
          </div>

          {/* Input Body */}
          {sourceKind === "text" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-300">
                  {t.tabText}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLoadSampleReadyPoll}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                  >
                    {t.loadSampleReadyPollBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {t.loadSampleBtn}
                  </button>
                </div>
              </div>
              <textarea
                rows={7}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t.textPlaceholder}
                className="w-full px-3.5 py-2.5 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)] resize-y"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept={
                  sourceKind === "image"
                    ? "image/png,image/jpeg,image/webp"
                    : "application/pdf"
                }
                onChange={(e) => handleFileChange(e.target.files?.[0])}
                className="hidden"
              />

              {attachedFile ? (
                <div className="border border-slate-800 rounded-sm p-3.5 bg-[#070B10] space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        {attachedFile.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono tabular-nums">
                        {(attachedFile.sizeBytes / 1024).toFixed(1)} KB ·{" "}
                        {attachedFile.mimeType}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachedFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-[#111923] border border-slate-700 rounded-sm hover:text-rose-400 hover:border-rose-500/40 transition-colors shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      {t.removeFile}
                    </button>
                  </div>
                  {attachedFile.previewUrl && (
                    <img
                      src={attachedFile.previewUrl}
                      alt={attachedFile.name}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-48 object-contain rounded-sm border border-slate-800 bg-[#06090D]"
                    />
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFileChange(e.dataTransfer.files?.[0]);
                  }}
                  className="w-full py-10 px-4 border border-dashed border-slate-700 rounded-sm bg-[#070B10] hover:bg-[#0B1118] hover:border-emerald-500/50 transition-colors flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
                >
                  <Upload className="w-6 h-6 text-emerald-400/80" />
                  <span className="text-xs font-medium text-slate-300 max-w-xs">
                    {sourceKind === "image"
                      ? t.uploadImageHint
                      : t.uploadPdfHint}
                  </span>
                </button>
              )}

              <textarea
                rows={2}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={t.textPlaceholder}
                className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
              />
            </div>
          )}

          {/* Personal Agent Instruction */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.agentInstructionLabel}
            </label>
            <textarea
              rows={2}
              value={agentInstruction}
              onChange={(e) => setAgentInstruction(e.target.value)}
              placeholder={t.agentInstructionPlaceholder}
              className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
            />
          </div>

          {/* Output Format Switcher */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {t.outputFormatLabel}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
              {(
                [
                  ["polls", t.formatPolls],
                  ["text_post", t.formatTextPost],
                  ["image_post", t.formatImagePost],
                  ["both", t.formatBoth],
                  ["index", t.formatIndex],
                ] as const
              ).map(([fmt, label]) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    setOutputFormat(fmt);
                    if (fmt === "text_post") {
                      setPollCount(1);
                    } else if (fmt === "image_post") {
                      setSourceKind("image");
                    } else if (outputFormat === "text_post") {
                      setPollCount("all");
                    }
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    outputFormat === fmt
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {outputFormat === "index" ? (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t.indexTargetLabel}
                </label>
                <input
                  type="text"
                  value={indexTargetChannel}
                  onChange={(e) => setIndexTargetChannel(e.target.value)}
                  placeholder={
                    config?.channelId || "https://t.me/mission_campus or @channel"
                  }
                  className="w-full px-3 py-2 text-sm font-mono bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t.indexingKeywordsLabel}
                </label>
                <input
                  type="text"
                  value={indexingKeywords}
                  onChange={(e) => setIndexingKeywords(e.target.value)}
                  placeholder={t.indexingKeywordsPlaceholder}
                  className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
                />
              </div>

              {inlineError && (
                <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                  {inlineError}
                </div>
              )}

              <button
                type="button"
                onClick={handleIndexChannel}
                disabled={isIndexing}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {isIndexing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Hash className="w-4 h-4" />
                )}
                {isIndexing ? t.indexingBtn : t.indexChannelBtn}
              </button>
            </div>
          ) : (
            <>
              {/* Optional Keyword Hashtag Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t.indexingKeywordsLabel}
                </label>
                <input
                  type="text"
                  value={indexingKeywords}
                  onChange={(e) => setIndexingKeywords(e.target.value)}
                  placeholder={t.indexingKeywordsPlaceholder}
                  className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
                />
              </div>

              {/* Agent Parameters Grid */}
              <div
                className={`grid gap-3 ${
                  outputFormat === "image_post"
                    ? "grid-cols-1"
                    : outputFormat === "text_post"
                      ? "grid-cols-2"
                      : "grid-cols-3"
                }`}
              >
                {outputFormat !== "image_post" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {outputFormat === "text_post"
                        ? t.postCountLabel
                        : t.pollCountLabel}
                    </label>
                    <select
                      value={pollCount}
                      onChange={(e) =>
                        setPollCount(
                          e.target.value === "all" ? "all" : Number(e.target.value)
                        )
                      }
                      className="w-full px-2.5 py-2 text-xs font-medium border border-slate-800 rounded-sm bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    >
                      {outputFormat === "text_post" ? (
                        [1, 2, 3, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="all">{t.pollCountAll}</option>
                          {[1, 2, 3, 5, 10, 15, 20, 30].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                )}

                {outputFormat !== "text_post" && outputFormat !== "image_post" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.pollModeLabel}
                    </label>
                    <select
                      value={pollMode}
                      onChange={(e) =>
                        setPollMode(
                          e.target.value as "auto" | "regular" | "quiz"
                        )
                      }
                      className="w-full px-2.5 py-2 text-xs font-medium border border-slate-800 rounded-sm bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    >
                      <option value="auto">{t.modeAuto}</option>
                      <option value="regular">{t.modeRegular}</option>
                      <option value="quiz">{t.modeQuiz}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {t.outputLangLabel}
                  </label>
                  <select
                    value={outputLang}
                    onChange={(e) =>
                      setOutputLang(e.target.value as "auto" | "bn" | "en")
                    }
                    className="w-full px-2.5 py-2 text-xs font-medium border border-slate-800 rounded-sm bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                  >
                    <option value="auto">{t.langAuto}</option>
                    <option value="bn">{t.langBn}</option>
                    <option value="en">{t.langEn}</option>
                  </select>
                </div>
              </div>

              {outputFormat !== "text_post" && outputFormat !== "image_post" && (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-col gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                        className="rounded border-slate-700 bg-[#06090D] accent-emerald-500"
                      />
                      {t.anonymousLabel}
                    </label>
                    {pollMode !== "quiz" && (
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowsMultiple}
                          onChange={(e) => setAllowsMultiple(e.target.checked)}
                          className="rounded border-slate-700 bg-[#06090D] accent-emerald-500"
                        />
                        {t.multiAnswerLabel}
                      </label>
                    )}
                  </div>

                  {/* AI Poll Customization Options */}
                  <div className="border border-slate-800 rounded-sm bg-[#070B10] p-3.5 space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowAiCustom((v) => !v)}
                      className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100">
                            {t.aiCustomTitle}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {t.aiCustomHint}
                          </div>
                        </div>
                      </div>
                      {showAiCustom ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {showAiCustom && (
                      <div className="space-y-3 pt-2 border-t border-slate-800">
                        {/* Quick Presets */}
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setPollMode("quiz");
                              setOptionsPerPoll(4);
                              setDifficulty("hard");
                              setTone("exam");
                              setExplanationMode("include");
                              setNumberingStyle("bn");
                              setShuffleOptions(true);
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-[#0E1620] border border-slate-700 text-slate-200 rounded-md hover:border-emerald-400/60 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            {lang === "bn" ? "BCS / ভর্তি কুইজ" : "Exam / Admission"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPollMode("quiz");
                              setOptionsPerPoll(4);
                              setDifficulty("easy");
                              setTone("concise");
                              setExplanationMode("omit");
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-[#0E1620] border border-slate-700 text-slate-200 rounded-md hover:border-emerald-400/60 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            {lang === "bn" ? "দ্রুত রিভিশন" : "Quick Revision"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceFidelity("strict_verbatim");
                              setTone("auto");
                              setDifficulty("auto");
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-[#0E1620] border border-slate-700 text-slate-200 rounded-md hover:border-emerald-400/60 hover:text-emerald-300 transition-colors cursor-pointer"
                          >
                            {lang === "bn" ? "হুবহু সোর্স থেকে" : "Strict Source"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOptionsPerPoll("auto");
                              setDifficulty("auto");
                              setTone("auto");
                              setExplanationMode("auto");
                              setSourceFidelity("balanced");
                              setNumberingStyle("none");
                              setQuestionPrefix("");
                              setShuffleOptions(false);
                            }}
                            className="px-2 py-1 text-[11px] font-medium bg-[#0E1620] border border-slate-800 text-slate-400 rounded-md hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            {lang === "bn" ? "রিসেট" : "Reset"}
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.optionsPerPollLabel}
                            </label>
                            <select
                              value={optionsPerPoll}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOptionsPerPoll(
                                  v === "auto"
                                    ? "auto"
                                    : (Number(v) as 2 | 3 | 4 | 5 | 6)
                                );
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="auto">{t.modeAuto}</option>
                              {[2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.difficultyLabel}
                            </label>
                            <select
                              value={difficulty}
                              onChange={(e) =>
                                setDifficulty(
                                  e.target.value as
                                    | "auto"
                                    | "easy"
                                    | "medium"
                                    | "hard"
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="auto">{t.difficultyAuto}</option>
                              <option value="easy">{t.difficultyEasy}</option>
                              <option value="medium">{t.difficultyMedium}</option>
                              <option value="hard">{t.difficultyHard}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.toneLabel}
                            </label>
                            <select
                              value={tone}
                              onChange={(e) =>
                                setTone(
                                  e.target.value as
                                    | "auto"
                                    | "exam"
                                    | "engaging"
                                    | "concise"
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="auto">{t.toneAuto}</option>
                              <option value="exam">{t.toneExam}</option>
                              <option value="engaging">{t.toneEngaging}</option>
                              <option value="concise">{t.toneConcise}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.explanationModeLabel}
                            </label>
                            <select
                              value={explanationMode}
                              onChange={(e) =>
                                setExplanationMode(
                                  e.target.value as "auto" | "include" | "omit"
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="auto">{t.explanationAuto}</option>
                              <option value="include">{t.explanationInclude}</option>
                              <option value="omit">{t.explanationOmit}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.sourceFidelityLabel}
                            </label>
                            <select
                              value={sourceFidelity}
                              onChange={(e) =>
                                setSourceFidelity(
                                  e.target.value as "balanced" | "strict_verbatim"
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="balanced">{t.fidelityBalanced}</option>
                              <option value="strict_verbatim">{t.fidelityStrict}</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">
                              {t.numberingStyleLabel}
                            </label>
                            <select
                              value={numberingStyle}
                              onChange={(e) =>
                                setNumberingStyle(
                                  e.target.value as "none" | "bn" | "en"
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                            >
                              <option value="none">{t.numberingNone}</option>
                              <option value="bn">{t.numberingBn}</option>
                              <option value="en">{t.numberingEn}</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            {t.questionPrefixLabel}
                          </label>
                          <input
                            type="text"
                            maxLength={40}
                            value={questionPrefix}
                            onChange={(e) => setQuestionPrefix(e.target.value)}
                            placeholder={t.questionPrefixPlaceholder}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-800 rounded-md bg-[#06090D] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                          />
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={shuffleOptions}
                            onChange={(e) => setShuffleOptions(e.target.checked)}
                            className="rounded border-slate-700 bg-[#06090D] accent-emerald-500"
                          />
                          {t.shuffleOptionsLabel}
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {inlineError && (
                <div className="px-3.5 py-2.5 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                  {inlineError}
                </div>
              )}

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  {isGenerating
                    ? t.generatingBtn
                    : outputFormat === "image_post"
                      ? t.generateImagePostBtn
                      : outputFormat === "text_post"
                        ? t.generateTextPostBtn
                        : outputFormat === "both"
                          ? t.generateBothBtn
                          : t.generateBtn}
                </button>

                {sourceKind === "text" &&
                  (outputFormat === "polls" || outputFormat === "both") && (
                    <button
                      type="button"
                      onClick={handleParseDirectReadyPolls}
                      disabled={isParsingDirect}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-cyan-300 bg-cyan-950/35 border border-cyan-500/35 rounded-sm hover:bg-cyan-950/60 disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {isParsingDirect ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ListChecks className="w-3.5 h-3.5" />
                      )}
                      {t.addDirectReadyPollsBtn}
                    </button>
                  )}

                {sourceKind === "text" && outputFormat !== "polls" && (
                  <button
                    type="button"
                    onClick={handleAddDirectTextPost}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    {t.addDirectTextPostBtn}
                  </button>
                )}

                {sourceKind === "image" &&
                  outputFormat === "image_post" &&
                  attachedFile && (
                    <button
                      type="button"
                      onClick={handleAddDirectImagePost}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors cursor-pointer"
                    >
                      {t.addDirectImagePostBtn}
                    </button>
                  )}
              </div>
            </>
          )}

          {/* Direct Manual Poll Composer (Zero AI, exact text + verified answer) */}
          <div className="pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setShowManualComposer((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left py-1 cursor-pointer"
            >
              <div>
                <h3 className="text-xs font-semibold text-slate-100">
                  {t.manualPollSectionTitle}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {t.manualPollSectionHint}
                </p>
              </div>
              {showManualComposer ? (
                <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showManualComposer && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-800">
                {/* Quiz vs Regular Toggle */}
                <div className="flex items-center gap-1 p-1 bg-[#06090D] border border-slate-800 rounded-sm">
                  <button
                    type="button"
                    onClick={() => setManualType("quiz")}
                    className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      manualType === "quiz"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t.quizLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualType("regular");
                      setManualCorrectIdx(null);
                    }}
                    className={`flex-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      manualType === "regular"
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                        : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t.regularPollLabel}
                  </button>
                </div>

                {/* Exact Question Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-slate-300">
                      {lang === "bn" ? "প্রশ্ন (হুবহু)" : "Question (Exact)"}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {manualQuestion.length}/300
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={300}
                    value={manualQuestion}
                    onChange={(e) => {
                      setManualQuestion(e.target.value);
                      setManualError(null);
                    }}
                    placeholder={t.manualPollQuestionPlaceholder}
                    className="w-full px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
                  />
                </div>

                {/* Options with Verified Correct Answer Picker */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    {manualType === "quiz"
                      ? t.manualPollSelectCorrectHint
                      : lang === "bn"
                        ? "পোলের অপশনসমূহ (২–১০টি):"
                        : "Poll Options (2–10):"}
                  </div>
                  {manualOptions.map((opt, idx) => {
                    const isSelectedRight =
                      manualType === "quiz" && manualCorrectIdx === idx;
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        {manualType === "quiz" && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualCorrectIdx(idx);
                              setManualError(null);
                            }}
                            title={t.correctAnswerLabel}
                            className={`p-1.5 rounded-sm border transition-colors shrink-0 cursor-pointer ${
                              isSelectedRight
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                                : "border-slate-800 bg-[#06090D] text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <input
                          type="text"
                          maxLength={100}
                          value={opt}
                          onChange={(e) => {
                            const next = [...manualOptions];
                            next[idx] = e.target.value;
                            setManualOptions(next);
                            setManualError(null);
                          }}
                          placeholder={`${t.manualPollOptionPlaceholder} ${idx + 1}`}
                          className={`flex-1 px-2.5 py-1.5 text-sm bg-[#06090D] text-slate-100 placeholder:text-slate-500 border rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 ${
                            isSelectedRight
                              ? "border-emerald-500 bg-emerald-950/30"
                              : "border-slate-800"
                          }`}
                        />
                        {manualOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = manualOptions.filter(
                                (_, i) => i !== idx
                              );
                              setManualOptions(next);
                              if (manualCorrectIdx === idx) {
                                setManualCorrectIdx(null);
                              } else if (
                                manualCorrectIdx !== null &&
                                manualCorrectIdx > idx
                              ) {
                                setManualCorrectIdx(manualCorrectIdx - 1);
                              }
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded-sm hover:bg-rose-950/40 transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {manualOptions.length < 10 && (
                    <button
                      type="button"
                      onClick={() => setManualOptions([...manualOptions, ""])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 py-0.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t.addOption}
                    </button>
                  )}
                </div>

                {/* Optional Quiz Explanation */}
                {manualType === "quiz" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-slate-300">
                        {t.explanationLabel}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {manualExplanation.length}/200
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={200}
                      value={manualExplanation}
                      onChange={(e) => setManualExplanation(e.target.value)}
                      placeholder={t.explanationPlaceholder}
                      className="w-full px-2.5 py-1.5 text-xs bg-[#06090D] text-slate-100 placeholder:text-slate-500 border border-slate-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
                    />
                  </div>
                )}

                {manualError && (
                  <div className="px-3 py-2 text-xs text-rose-200 bg-rose-950/40 border border-rose-500/35 rounded-sm">
                    {manualError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAddManualPollToPreview}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.addManualPollToPreviewBtn}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendManualPollDirect}
                    disabled={isSendingManual}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {isSendingManual ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {t.sendManualPollDirectBtn}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Agent Summary + Refinement + Live Telegram Poll Previews + Scheduler */}
        <div className="lg:col-span-7 space-y-5">
          {drafts.length === 0 ? (
            <div className="hacker-panel rounded-sm p-12 text-center space-y-3 shadow-[0_0_24px_rgba(0,0,0,0.45)]">
              <div className="w-12 h-12 mx-auto rounded-xl overflow-hidden border border-emerald-500/40 bg-[#06090D] flex items-center justify-center">
                <img
                  src="/src/assets/images/agent_avatar_1794991339003.jpg"
                  alt="Personal AI Agent"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <h3 className="text-base font-semibold text-slate-100">
                {t.emptyPreviewTitle}
              </h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {t.emptyPreviewBody}
              </p>
            </div>
          ) : (
            <>
              {/* Personal AI Agent Summary & Refinement Bar */}
              <div className="hacker-panel rounded-sm p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-sm overflow-hidden border border-emerald-500/40 shrink-0 bg-[#06090D]">
                    <img
                      src="/src/assets/images/agent_avatar_1794991339003.jpg"
                      alt="Agent"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-semibold text-emerald-400 font-mono">
                      {t.agentSummaryHeading}
                    </h3>
                    <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                      {agentSummary ||
                        `${drafts.length} Telegram poll(s) ready for review.`}
                    </p>
                  </div>
                </div>

                {/* Conversational Agent Refinement + Quick Customize Chips */}
                <div className="space-y-2.5 pt-3 border-t border-slate-800">
                  <div className="flex flex-wrap gap-1.5">
                    {(lang === "bn"
                      ? [
                          "প্রশ্ন ও অপশন আরও সংক্ষিপ্ত করো",
                          "ব্যাখ্যা যোগ করো",
                          "কঠিন মানের প্রশ্ন করো",
                          "বাংলায় অনুবাদ করো",
                        ]
                      : [
                          "Make questions more concise",
                          "Add short explanations",
                          "Increase difficulty",
                          "Translate to English",
                        ]
                    ).map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setRefinePrompt(chip)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-300 bg-[#070B10] border border-slate-800 rounded-md hover:border-emerald-500/50 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                    <input
                      type="text"
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRefine();
                      }}
                      placeholder={t.refinePlaceholder}
                      className="flex-1 px-3 py-2 text-sm bg-[#04080C] text-slate-100 placeholder:text-slate-500 border border-emerald-500/25 rounded-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 focus:shadow-[0_0_10px_rgba(16,185,129,0.18)]"
                    />
                    <button
                      type="button"
                      onClick={handleRefine}
                      disabled={isRefining || !refinePrompt.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-[#111923] border border-slate-700 rounded-sm hover:border-emerald-500/40 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isRefining ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {isRefining ? t.refiningBtn : t.refineBtn}
                    </button>
                  </div>

                  {drafts.some((d) => d.type !== "text" && d.type !== "image") && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                      <span className="text-[11px] font-medium text-slate-400">
                        {t.batchCustomTitle}:
                      </span>
                      <button
                        type="button"
                        onClick={handleBatchShuffleOptions}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#070B10] border border-slate-800 rounded-md hover:border-cyan-500/40 hover:text-cyan-300 transition-colors cursor-pointer"
                      >
                        <Shuffle className="w-3 h-3" />
                        {t.batchShuffleBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchApplyNumbering("bn")}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#070B10] border border-slate-800 rounded-md hover:border-emerald-500/40 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        {t.batchNumberBnBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchApplyNumbering("en")}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#070B10] border border-slate-800 rounded-md hover:border-emerald-500/40 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        {t.batchNumberEnBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchApplyNumbering("none")}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-400 bg-[#070B10] border border-slate-800 rounded-md hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        {t.batchStripNumbersBtn}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Poll Preview List */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-100 font-mono">
                    {t.previewHeading} ({drafts.length})
                  </h2>
                  {drafts.length > 1 && (
                    <button
                      type="button"
                      onClick={handlePostAllNow}
                      disabled={isPostingAll}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 rounded-sm hover:bg-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.28)] disabled:opacity-60 transition-colors cursor-pointer"
                    >
                      {isPostingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      {isPostingAll ? t.postingAllBtn : t.postAllNowBtn}
                    </button>
                  )}
                </div>

                {drafts.map((poll, idx) => (
                  <TelegramPollPreview
                    key={poll.id}
                    poll={poll}
                    index={idx}
                    channelLabel={channelDisplay}
                    lang={lang}
                    isPosting={postingId === poll.id}
                    onChange={(updated) =>
                      setDrafts((prev) =>
                        prev.map((item) =>
                          item.id === poll.id ? updated : item
                        )
                      )
                    }
                    onRemove={() =>
                      setDrafts((prev) =>
                        prev.filter((item) => item.id !== poll.id)
                      )
                    }
                    onPostNow={() => handlePostNow(poll)}
                  />
                ))}
              </div>

              {/* Automated Schedule Bar */}
              <div className="hacker-panel rounded-sm p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-slate-100">
                    {t.scheduleSectionTitle}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.scheduleStartLabel}
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleStart}
                      onChange={(e) => setScheduleStart(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-[#06090D] text-slate-100 border border-slate-800 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      {t.intervalLabel}
                    </label>
                    <select
                      value={intervalMinutes}
                      onChange={(e) =>
                        setIntervalMinutes(Number(e.target.value))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-800 rounded-sm bg-[#06090D] text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-400"
                    >
                      <option value={0}>{t.intervalNone}</option>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={180}>3 hours</option>
                      <option value={360}>6 hours</option>
                      <option value={720}>12 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleScheduleAll}
                    disabled={isScheduling}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-cyan-200 bg-cyan-950/50 border border-cyan-500/40 rounded-sm hover:bg-cyan-950/80 disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isScheduling ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CalendarClock className="w-4 h-4" />
                    )}
                    {isScheduling ? t.schedulingBtn : t.scheduleAllBtn}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
