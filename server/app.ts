import express from "express";
import path from "path";
import crypto from "crypto";
import {
  addJobs,
  createBackupBundle,
  deleteJob,
  getPublicConfig,
  listJobs,
  readStore,
  restoreBackupBundle,
  updateConfig,
  updateJob,
} from "./store.ts";
import { generatePollsWithAgent, refinePollsWithAgent } from "./gemini.ts";
import { parseReadyPollsFromText } from "./directPollParser.ts";
import {
  buildTelegramPostLink,
  formatChannelIndexPost,
  normalizeKeywordList,
  type IndexedChannelMessage,
} from "./channelIndexer.ts";
import {
  normalizeChannelId,
  postPhotoToTelegram,
  postPollToTelegram,
  postTextToTelegram,
  verifyTelegramConnection,
} from "./telegram.ts";
import {
  checkTelegramQrLogin,
  disconnectCachedClient,
  importTelegramSession,
  isUserListenerActive,
  listUserTelegramChannels,
  postPhotoAsUser,
  postPollAsUser,
  postTextAsUser,
  resendTelegramAuthCode,
  searchAndIndexChannelPostsAsUser,
  sendTelegramAuthCode,
  sendUserGroupGreeting,
  startTelegramQrLogin,
  startUserGroupListener,
  stopUserGroupListener,
  verifyTelegramAuthCode,
  verifyUserAdminAndResolveTarget,
} from "./telegramUser.ts";
import {
  isBotListenerActive,
  startBotGroupListener,
  stopBotGroupListener,
} from "./telegramBotListener.ts";
import type {
  AgentTriggerMode,
  OutputFormat,
  PollCustomizationOptions,
  PollDraft,
  ScheduledPollJob,
  SourceKind,
  TelegramAuthMode,
  TelegramConfig,
  TelegramDialogSummary,
} from "./types.ts";

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);

let isProcessingQueue = false;

export async function dispatchPoll(
  config: TelegramConfig,
  channelIdOverride: string | undefined,
  poll: PollDraft
): Promise<{ messageId: number; channelUsed: string }> {
  const targetChannel = (channelIdOverride || config.channelId || "").trim();
  if (!targetChannel) {
    throw new Error(
      "Target Telegram channel is not selected. Open Telegram Connection settings first."
    );
  }

  if (
    config.authMode === "user" &&
    config.sessionString &&
    config.apiId &&
    config.apiHash
  ) {
    const res =
      poll.type === "text"
        ? await postTextAsUser(
            config.apiId,
            config.apiHash,
            config.sessionString,
            targetChannel,
            poll.postText || poll.question
          )
        : poll.type === "image"
          ? await postPhotoAsUser(
              config.apiId,
              config.apiHash,
              config.sessionString,
              targetChannel,
              poll.imageBase64 || "",
              poll.imageMimeType || "image/jpeg",
              poll.postText || poll.caption || "",
              poll.imageName
            )
          : await postPollAsUser(
              config.apiId,
              config.apiHash,
              config.sessionString,
              targetChannel,
              poll
            );
    return { messageId: res.messageId, channelUsed: targetChannel };
  }

  if (config.botToken.trim()) {
    const normalized = normalizeChannelId(targetChannel);
    const res =
      poll.type === "text"
        ? await postTextToTelegram(
            config.botToken,
            normalized,
            poll.postText || poll.question
          )
        : poll.type === "image"
          ? await postPhotoToTelegram(
              config.botToken,
              normalized,
              poll.imageBase64 || "",
              poll.imageMimeType || "image/jpeg",
              poll.postText || poll.caption || ""
            )
          : await postPollToTelegram(config.botToken, normalized, poll);
    return { messageId: res.messageId, channelUsed: normalized };
  }

  throw new Error(
    "Telegram account is not connected yet. Sign in with your Telegram account or configure a Bot Token."
  );
}

export async function processDueSchedules(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const store = readStore();
    const now = Date.now();
    const dueJobs = store.jobs.filter(
      (job) =>
        job.status === "pending" && new Date(job.scheduledAt).getTime() <= now
    );

    if (dueJobs.length === 0) return;

    for (const job of dueJobs) {
      try {
        const { messageId } = await dispatchPoll(
          store.config,
          job.channelId,
          job
        );
        updateJob(job.id, (current) => ({
          ...current,
          status: "posted",
          postedAt: new Date().toISOString(),
          telegramMessageId: messageId,
          errorMessage: undefined,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to post to Telegram";
        updateJob(job.id, (current) => ({
          ...current,
          status: "failed",
          errorMessage: message,
        }));
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

export async function syncAgentListeners(): Promise<{
  active: boolean;
  mode: TelegramAuthMode;
}> {
  const store = readStore();
  const cfg = store.config;

  if (!cfg.agentListenerEnabled) {
    stopUserGroupListener();
    stopBotGroupListener();
    return { active: false, mode: cfg.authMode };
  }

  if (
    cfg.authMode === "user" &&
    cfg.sessionString &&
    cfg.apiId &&
    cfg.apiHash &&
    cfg.controlGroupId
  ) {
    stopBotGroupListener();
    const ok = await startUserGroupListener();
    return { active: ok, mode: "user" };
  }

  if (cfg.authMode === "bot" && cfg.botToken.trim()) {
    stopUserGroupListener();
    startBotGroupListener();
    return { active: isBotListenerActive(), mode: "bot" };
  }

  stopUserGroupListener();
  stopBotGroupListener();
  return { active: false, mode: cfg.authMode };
}

export function createExpressApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "35mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      runtime: IS_VERCEL ? "vercel-serverless" : "node",
      time: new Date().toISOString(),
    });
  });

  // Trigger due scheduled jobs (used by Vercel Cron / external cron or manual sync)
  const handleCronSchedules = async (
    req: express.Request,
    res: express.Response
  ) => {
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    if (cronSecret) {
      const authHeader = req.headers.authorization || "";
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized cron trigger" });
      }
    }
    await processDueSchedules();
    const store = readStore();
    const pendingCount = store.jobs.filter(
      (j) => j.status === "pending"
    ).length;
    res.json({
      ok: true,
      pendingCount,
      checkedAt: new Date().toISOString(),
    });
  };
  app.get("/api/cron/run-schedules", handleCronSchedules);
  app.post("/api/cron/run-schedules", handleCronSchedules);

  // Get Telegram & Agent Configuration (masked credentials)
  app.get("/api/telegram/config", (_req, res) => {
    const store = readStore();
    res.json(getPublicConfig(store.config));
  });

  // Persistent Session Vault Backup & Silent Auto-Restore
  app.get("/api/telegram/backup", (_req, res) => {
    res.json({ bundle: createBackupBundle() });
  });

  app.post("/api/telegram/restore", async (req, res) => {
    try {
      const { bundle } = req.body as {
        bundle?: ReturnType<typeof createBackupBundle>;
      };
      if (!bundle || typeof bundle !== "object") {
        return res.status(400).json({ error: "Invalid restore bundle." });
      }
      const result = restoreBackupBundle(bundle);
      const listener = IS_VERCEL
        ? { active: false, mode: result.store.config.authMode }
        : await syncAgentListeners().catch(() => ({
            active: false,
            mode: result.store.config.authMode,
          }));
      res.json({
        restored: result.restored,
        config: getPublicConfig(result.store.config),
        jobs: result.store.jobs,
        listenerActive: listener.active,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to restore session",
      });
    }
  });

  // Save General Agent Preferences / Auth Mode / Bot Config
  app.post("/api/telegram/config", (req, res) => {
    try {
      const {
        authMode,
        botToken,
        channelId,
        agentPersona,
        defaultLanguage,
        timezoneOffsetMinutes,
      } = req.body as {
        authMode?: TelegramAuthMode;
        botToken?: string;
        channelId?: string;
        agentPersona?: string;
        defaultLanguage?: "bn" | "en" | "auto";
        timezoneOffsetMinutes?: number;
      };

      const store = readStore();
      const nextBotToken =
        typeof botToken === "string" && botToken.trim().length > 0
          ? botToken.trim()
          : store.config.botToken;

      const nextChannelId =
        typeof channelId === "string"
          ? channelId.trim()
          : store.config.channelId;

      const updated = updateConfig({
        authMode:
          authMode === "user" || authMode === "bot"
            ? authMode
            : store.config.authMode,
        botToken: nextBotToken,
        channelId: nextChannelId,
        agentPersona:
          typeof agentPersona === "string" && agentPersona.trim().length > 0
            ? agentPersona.trim()
            : store.config.agentPersona,
        defaultLanguage:
          defaultLanguage === "bn" ||
          defaultLanguage === "en" ||
          defaultLanguage === "auto"
            ? defaultLanguage
            : store.config.defaultLanguage,
        timezoneOffsetMinutes:
          typeof timezoneOffsetMinutes === "number" &&
          !Number.isNaN(timezoneOffsetMinutes)
            ? timezoneOffsetMinutes
            : store.config.timezoneOffsetMinutes,
      });

      res.json(getPublicConfig(updated));
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to save configuration",
      });
    }
  });

  // --- Telegram Group Agent Listener Controls ---

  app.get("/api/telegram/agent/status", (_req, res) => {
    const store = readStore();
    const active =
      store.config.authMode === "user"
        ? isUserListenerActive()
        : isBotListenerActive();
    res.json({
      active,
      mode: store.config.authMode,
      controlGroupId: store.config.controlGroupId || "",
      controlGroupTitle: store.config.controlGroupTitle || "",
    });
  });

  app.post("/api/telegram/agent/listener", async (req, res) => {
    try {
      const {
        controlGroupId,
        controlGroupTitle,
        agentListenerEnabled,
        agentTriggerMode,
      } = req.body as {
        controlGroupId?: string;
        controlGroupTitle?: string;
        agentListenerEnabled?: boolean;
        agentTriggerMode?: AgentTriggerMode;
      };

      const store = readStore();
      const nextGroupId =
        controlGroupId !== undefined
          ? controlGroupId.trim()
          : store.config.controlGroupId || "";
      const nextGroupTitle =
        controlGroupTitle !== undefined
          ? controlGroupTitle.trim()
          : store.config.controlGroupTitle || nextGroupId;
      const nextEnabled =
        agentListenerEnabled !== undefined
          ? Boolean(agentListenerEnabled)
          : Boolean(store.config.agentListenerEnabled);

      if (nextEnabled && store.config.authMode === "user" && !nextGroupId) {
        return res.status(400).json({
          error:
            "Please select a Telegram group (or Saved Messages) where the agent will operate.",
        });
      }

      const updated = updateConfig({
        controlGroupId: nextGroupId,
        controlGroupTitle: nextGroupTitle,
        agentListenerEnabled: nextEnabled,
        agentTriggerMode:
          agentTriggerMode === "prefix" || agentTriggerMode === "all"
            ? agentTriggerMode
            : store.config.agentTriggerMode || "all",
      });

      const status = await syncAgentListeners();

      let greetingSent = false;
      if (
        nextEnabled &&
        status.active &&
        updated.authMode === "user" &&
        nextGroupId
      ) {
        try {
          await sendUserGroupGreeting(nextGroupId);
          greetingSent = true;
        } catch (greetErr) {
          console.warn("Could not send group greeting:", greetErr);
        }
      }

      res.json({
        config: getPublicConfig(updated),
        listenerActive: status.active,
        greetingSent,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to configure Telegram group agent",
      });
    }
  });

  // --- Direct Telegram Account (MTProto) Auth Flow (Stateless & Vercel-safe) ---

  app.post("/api/telegram/user/send-code", async (req, res) => {
    try {
      const { apiId, apiHash, phoneNumber } = req.body as {
        apiId?: number | string;
        apiHash?: string;
        phoneNumber?: string;
      };
      const store = readStore();
      const resolvedApiId = Number(apiId || store.config.apiId);
      const resolvedApiHash = (apiHash || store.config.apiHash || "").trim();

      const result = await sendTelegramAuthCode({
        apiId: resolvedApiId,
        apiHash: resolvedApiHash,
        phoneNumber: String(phoneNumber || ""),
      });

      updateConfig({
        apiId: resolvedApiId,
        apiHash: resolvedApiHash,
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to send verification code",
      });
    }
  });

  app.post("/api/telegram/user/resend-code", async (req, res) => {
    try {
      const { authId } = req.body as { authId?: string };
      if (!authId) {
        return res.status(400).json({ error: "Missing login session ID." });
      }
      const result = await resendTelegramAuthCode(authId);
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to resend verification code",
      });
    }
  });

  app.post("/api/telegram/user/verify-code", async (req, res) => {
    try {
      const { authId, code, password } = req.body as {
        authId?: string;
        code?: string;
        password?: string;
      };
      if (!authId) {
        return res.status(400).json({ error: "Missing login session ID." });
      }

      const result = await verifyTelegramAuthCode({
        authId,
        code,
        password,
      });

      if (result.requires2FA) {
        return res.json({
          requires2FA: true,
          signedIn: false,
          authId: result.authId,
        });
      }

      const updated = updateConfig({
        authMode: "user",
        apiId: result.apiId,
        apiHash: result.apiHash,
        sessionString: result.sessionString,
        userId: result.user.id,
        userDisplayName: result.user.displayName,
        userUsername: result.user.username,
        userPhone: result.user.phone,
      });

      let channels: TelegramDialogSummary[] = [];
      try {
        channels = await listUserTelegramChannels(
          result.apiId,
          result.apiHash,
          result.sessionString
        );
      } catch {
        // Non-fatal if dialog listing takes longer; user can click refresh
      }

      res.json({
        requires2FA: false,
        signedIn: true,
        config: getPublicConfig(updated),
        channels,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Verification failed",
      });
    }
  });

  app.post("/api/telegram/user/qr-start", async (req, res) => {
    try {
      const { apiId, apiHash } = (req.body || {}) as {
        apiId?: number | string;
        apiHash?: string;
      };
      const store = readStore();
      const resolvedApiId = Number(apiId || store.config.apiId);
      const resolvedApiHash = String(apiHash || store.config.apiHash || "").trim();

      const result = await startTelegramQrLogin({
        apiId: resolvedApiId,
        apiHash: resolvedApiHash,
      });

      updateConfig({
        apiId: resolvedApiId,
        apiHash: resolvedApiHash,
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to start QR login session",
      });
    }
  });

  app.post("/api/telegram/user/qr-check", async (req, res) => {
    try {
      const { qrAuthId, password } = (req.body || {}) as {
        qrAuthId?: string;
        password?: string;
      };
      if (!qrAuthId || typeof qrAuthId !== "string") {
        return res.status(400).json({ error: "Missing QR login session ID." });
      }

      const result = await checkTelegramQrLogin({
        qrAuthId,
        password: typeof password === "string" ? password : undefined,
      });

      if (result.status !== "signed_in") {
        return res.json(result);
      }

      const updated = updateConfig({
        authMode: "user",
        apiId: result.apiId,
        apiHash: result.apiHash,
        sessionString: result.sessionString,
        userId: result.user.id,
        userDisplayName: result.user.displayName,
        userUsername: result.user.username,
        userPhone: result.user.phone,
      });

      let channels: TelegramDialogSummary[] = [];
      try {
        channels = await listUserTelegramChannels(
          result.apiId,
          result.apiHash,
          result.sessionString
        );
      } catch {
        // Non-fatal if dialog listing takes longer; user can click refresh
      }

      res.json({
        status: "signed_in",
        config: getPublicConfig(updated),
        channels,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "QR login check failed",
      });
    }
  });

  app.post("/api/telegram/user/import-session", async (req, res) => {
    try {
      const { apiId, apiHash, sessionString } = (req.body || {}) as {
        apiId?: number | string;
        apiHash?: string;
        sessionString?: string;
      };
      const store = readStore();
      const resolvedApiId = Number(apiId || store.config.apiId);
      const resolvedApiHash = String(apiHash || store.config.apiHash || "").trim();
      const cleanedSession = String(sessionString || "").trim();

      const result = await importTelegramSession({
        apiId: resolvedApiId,
        apiHash: resolvedApiHash,
        sessionString: cleanedSession,
      });

      const updated = updateConfig({
        authMode: "user",
        apiId: result.apiId,
        apiHash: result.apiHash,
        sessionString: result.sessionString,
        userId: result.user.id,
        userDisplayName: result.user.displayName,
        userUsername: result.user.username,
        userPhone: result.user.phone,
      });

      let channels: TelegramDialogSummary[] = [];
      try {
        channels = await listUserTelegramChannels(
          result.apiId,
          result.apiHash,
          result.sessionString
        );
      } catch {
        // Non-fatal
      }

      res.json({
        signedIn: true,
        config: getPublicConfig(updated),
        channels,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to import Telegram session string",
      });
    }
  });

  app.get("/api/telegram/user/export-session", (_req, res) => {
    const store = readStore();
    if (
      !store.config.sessionString ||
      !store.config.apiId ||
      !store.config.apiHash
    ) {
      return res.status(400).json({
        error: "Telegram account is not signed in yet.",
      });
    }
    res.json({
      apiId: store.config.apiId,
      apiHash: store.config.apiHash,
      sessionString: store.config.sessionString,
      channelId: store.config.channelId || "",
    });
  });

  app.get("/api/telegram/user/channels", async (_req, res) => {
    try {
      const store = readStore();
      if (
        !store.config.sessionString ||
        !store.config.apiId ||
        !store.config.apiHash
      ) {
        return res.status(400).json({
          error: "Telegram account is not signed in yet.",
        });
      }
      const channels = await listUserTelegramChannels(
        store.config.apiId,
        store.config.apiHash,
        store.config.sessionString
      );
      res.json({ channels });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to fetch channels",
      });
    }
  });

  app.post("/api/telegram/user/select-channel", async (req, res) => {
    try {
      const { channelId, channelTitle, channelType } = req.body as {
        channelId?: string;
        channelTitle?: string;
        channelType?: string;
      };
      if (!channelId || !channelId.trim()) {
        return res.status(400).json({ error: "Channel ID is required." });
      }

      const store = readStore();
      let resolvedId = channelId.trim();
      let resolvedTitle = channelTitle?.trim() || resolvedId;
      let resolvedType = channelType || "channel";

      if (
        store.config.sessionString &&
        store.config.apiId &&
        store.config.apiHash
      ) {
        const check = await verifyUserAdminAndResolveTarget(
          store.config.apiId,
          store.config.apiHash,
          store.config.sessionString,
          resolvedId
        );
        if (!check.ok) {
          return res.status(403).json({ error: check.error });
        }
        resolvedId = check.channelId;
        resolvedTitle = check.channelTitle;
        resolvedType = check.channelType;
      }

      const updated = updateConfig({
        authMode: "user",
        channelId: resolvedId,
        channelTitle: resolvedTitle,
        channelType: resolvedType,
        verifiedAt: new Date().toISOString(),
      });
      res.json({ config: getPublicConfig(updated) });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to select channel",
      });
    }
  });

  app.delete("/api/telegram/user/session", async (_req, res) => {
    const store = readStore();
    await disconnectCachedClient(store.config.sessionString);
    const updated = updateConfig({
      sessionString: undefined,
      userId: undefined,
      userDisplayName: undefined,
      userUsername: undefined,
      userPhone: undefined,
      verifiedAt:
        store.config.authMode === "user" ? undefined : store.config.verifiedAt,
    });
    res.json(getPublicConfig(updated));
  });

  // --- Bot Token Verification (Optional Mode) ---

  app.post("/api/telegram/verify", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as { botToken?: string; channelId?: string };
      const tokenToUse =
        body.botToken && body.botToken.trim().length > 0
          ? body.botToken.trim()
          : store.config.botToken;
      const channelToUse =
        body.channelId && body.channelId.trim().length > 0
          ? body.channelId.trim()
          : store.config.channelId;

      const verified = await verifyTelegramConnection(tokenToUse, channelToUse);
      const updated = updateConfig({
        authMode: "bot",
        botToken: tokenToUse,
        channelId: verified.channelId,
        botUsername: verified.botUsername,
        channelTitle: verified.channelTitle,
        channelType: verified.channelType,
        verifiedAt: new Date().toISOString(),
      });

      res.json({
        verified: true,
        config: getPublicConfig(updated),
      });
    } catch (err) {
      res.status(400).json({
        verified: false,
        error:
          err instanceof Error ? err.message : "Telegram verification failed",
      });
    }
  });

  app.delete("/api/telegram/token", (_req, res) => {
    const updated = updateConfig({
      botToken: "",
      botUsername: undefined,
      channelTitle: undefined,
      channelType: undefined,
      verifiedAt: undefined,
    });
    res.json(getPublicConfig(updated));
  });

  // --- Personal AI Agent Poll Generation & Refinement ---

  app.post("/api/agent/generate-polls", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        text?: string;
        file?: { name: string; mimeType: string; dataBase64: string };
        agentInstruction?: string;
        outputFormat?: OutputFormat;
        indexingKeywords?: string[] | string;
        pollCount?: number | "all";
        pollType?: "regular" | "quiz" | "auto";
        language?: "bn" | "en" | "auto";
        isAnonymous?: boolean;
        allowsMultipleAnswers?: boolean;
        customization?: PollCustomizationOptions;
      };

      const resolvedPollCount: number | "all" =
        body.pollCount === "all" || body.pollCount === 0
          ? "all"
          : Number(body.pollCount ?? "all") || "all";

      const result = await generatePollsWithAgent({
        text: body.text,
        file: body.file,
        agentInstruction: body.agentInstruction,
        persona: store.config.agentPersona,
        outputFormat: body.outputFormat ?? "polls",
        indexingKeywords: normalizeKeywordList(body.indexingKeywords),
        pollCount: resolvedPollCount,
        pollType: body.pollType ?? "auto",
        language: body.language ?? store.config.defaultLanguage ?? "auto",
        isAnonymous: body.isAnonymous ?? true,
        allowsMultipleAnswers: body.allowsMultipleAnswers ?? false,
        customization: body.customization,
      });

      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI generation failed";
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/agent/parse-ready-polls", (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        text?: string;
        pollType?: "regular" | "quiz" | "auto";
        isAnonymous?: boolean;
        allowsMultipleAnswers?: boolean;
        indexingKeywords?: string[] | string;
        language?: "bn" | "en" | "auto";
      };

      const rawText = String(body.text ?? "").trim();
      const reqLang =
        body.language && body.language !== "auto"
          ? body.language
          : store.config.defaultLanguage && store.config.defaultLanguage !== "auto"
            ? store.config.defaultLanguage
            : "bn";

      if (!rawText) {
        return res.status(400).json({
          error:
            reqLang === "bn"
              ? "প্রশ্ন, অপশন এবং উত্তরসহ রেডি পোল টেক্সট লিখুন বা পেস্ট করুন।"
              : "Please enter or paste your ready poll questions and options first.",
        });
      }

      const result = parseReadyPollsFromText({
        text: rawText,
        pollType: body.pollType ?? "auto",
        isAnonymous: body.isAnonymous ?? true,
        allowsMultipleAnswers: Boolean(body.allowsMultipleAnswers),
        indexingKeywords: body.indexingKeywords,
        language: reqLang,
      });

      if (result.polls.length === 0) {
        const detail = result.skippedNotes.slice(0, 3).join(" | ");
        return res.status(400).json({
          error:
            detail ||
            (reqLang === "bn"
              ? "প্রদত্ত লেখা থেকে কোনো বৈধ পোল পাওয়া যায়নি। প্রতিটি প্রশ্নের নিচে ক) খ) গ) ঘ) অপশন এবং কুইজের জন্য উত্তর: খ দিন।"
              : "No valid polls found. Include options (A/B/C/D or ক/খ/গ/ঘ) and Answer: B for quiz mode."),
          skippedNotes: result.skippedNotes,
        });
      }

      res.json(result);
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to parse ready polls",
      });
    }
  });

  app.post("/api/agent/index-channel", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        channelId?: string;
        keywords?: string[] | string;
        language?: "bn" | "en" | "auto";
      };

      const targetChannel = (
        body.channelId ||
        store.config.channelId ||
        ""
      ).trim();
      if (!targetChannel) {
        return res.status(400).json({
          error:
            "Target Telegram channel is required for indexing. Select or enter a channel first.",
        });
      }

      const keywords = normalizeKeywordList(body.keywords);
      const resolvedLang: "bn" | "en" =
        body.language === "en"
          ? "en"
          : body.language === "bn"
            ? "bn"
            : store.config.defaultLanguage === "en"
              ? "en"
              : "bn";

      if (
        store.config.authMode === "user" &&
        store.config.sessionString &&
        store.config.apiId &&
        store.config.apiHash
      ) {
        const result = await searchAndIndexChannelPostsAsUser({
          apiId: store.config.apiId,
          apiHash: store.config.apiHash,
          sessionString: store.config.sessionString,
          targetChannel,
          keywords,
          lang: resolvedLang,
        });

        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }

        const draft: PollDraft = {
          id: crypto.randomUUID(),
          question: `${
            resolvedLang === "bn" ? "📌 ইনডেক্স:" : "📌 Index:"
          } ${result.channelTitle}${
            keywords.length ? ` (${keywords.join(", ")})` : ""
          }`.slice(0, 120),
          options: [],
          type: "text",
          postText: result.indexText.slice(0, 4096),
          indexingKeywords: keywords.length > 0 ? keywords : undefined,
          isAnonymous: false,
          allowsMultipleAnswers: false,
          caption: "",
        };

        return res.json({
          ok: true,
          channelId: result.channelId,
          channelTitle: result.channelTitle,
          indexText: result.indexText,
          matchedCount: result.matchedCount,
          draft,
        });
      }

      // Bot mode / local job fallback index
      const normTarget = normalizeChannelId(targetChannel);
      const items: IndexedChannelMessage[] = [];
      for (const job of store.jobs) {
        if (job.status !== "posted" || !job.telegramMessageId) continue;
        if (
          normalizeChannelId(job.channelId).toLowerCase() !==
          normTarget.toLowerCase()
        ) {
          continue;
        }
        const text = [
          job.postText || job.question,
          ...(job.indexingKeywords || []),
        ]
          .filter(Boolean)
          .join(" ");
        items.push({
          messageId: job.telegramMessageId,
          dateIso: job.postedAt || job.createdAt,
          kind:
            job.type === "image"
              ? "photo"
              : job.type === "text"
                ? "text"
                : "poll",
          text,
          link: buildTelegramPostLink(
            normTarget,
            normTarget.startsWith("@") ? normTarget.slice(1) : undefined,
            job.telegramMessageId
          ),
        });
      }

      const formatted = formatChannelIndexPost({
        channelTitle: store.config.channelTitle || normTarget,
        channelId: normTarget,
        channelUsername: normTarget.startsWith("@")
          ? normTarget.slice(1)
          : undefined,
        keywords,
        items,
        lang: resolvedLang,
      });

      const draft: PollDraft = {
        id: crypto.randomUUID(),
        question: `${
          resolvedLang === "bn" ? "📌 ইনডেক্স:" : "📌 Index:"
        } ${store.config.channelTitle || normTarget}${
          keywords.length ? ` (${keywords.join(", ")})` : ""
        }`.slice(0, 120),
        options: [],
        type: "text",
        postText: formatted.indexText.slice(0, 4096),
        indexingKeywords: keywords.length > 0 ? keywords : undefined,
        isAnonymous: false,
        allowsMultipleAnswers: false,
        caption: "",
      };

      res.json({
        ok: true,
        channelId: normTarget,
        channelTitle: store.config.channelTitle || normTarget,
        indexText: formatted.indexText,
        matchedCount: formatted.matchedCount,
        draft,
      });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to index channel posts",
      });
    }
  });

  app.post("/api/agent/refine-polls", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        polls: PollDraft[];
        instruction: string;
        language?: "bn" | "en" | "auto";
      };

      if (!Array.isArray(body.polls) || body.polls.length === 0) {
        return res
          .status(400)
          .json({ error: "No polls provided to refine." });
      }
      if (!body.instruction || !body.instruction.trim()) {
        return res
          .status(400)
          .json({ error: "Refinement instruction is required." });
      }

      const result = await refinePollsWithAgent({
        polls: body.polls,
        instruction: body.instruction.trim(),
        language: body.language ?? store.config.defaultLanguage ?? "auto",
        persona: store.config.agentPersona,
      });

      res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Refinement failed";
      res.status(500).json({ error: message });
    }
  });

  // Post a poll immediately to Telegram (User Account OR Bot Token)
  app.post("/api/telegram/send-now", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        poll: PollDraft;
        channelId?: string;
        sourceKind?: SourceKind;
        sourceLabel?: string;
      };

      let targetOverride = body.channelId;
      if (
        store.config.authMode === "user" &&
        store.config.sessionString &&
        store.config.apiId &&
        store.config.apiHash
      ) {
        const candidate = (
          body.channelId ||
          store.config.channelId ||
          ""
        ).trim();
        const check = await verifyUserAdminAndResolveTarget(
          store.config.apiId,
          store.config.apiHash,
          store.config.sessionString,
          candidate
        );
        if (!check.ok) {
          return res.status(403).json({ error: check.error });
        }
        targetOverride = check.channelId;
      }

      const { messageId, channelUsed } = await dispatchPoll(
        store.config,
        targetOverride,
        body.poll
      );

      const jobRecord: ScheduledPollJob = {
        ...body.poll,
        id: body.poll.id || crypto.randomUUID(),
        scheduledAt: new Date().toISOString(),
        postedAt: new Date().toISOString(),
        channelId: channelUsed,
        status: "posted",
        sourceKind: body.sourceKind ?? "text",
        sourceLabel: body.sourceLabel ?? "Direct post",
        createdAt: new Date().toISOString(),
        telegramMessageId: messageId,
      };
      addJobs([jobRecord]);

      res.json({ ok: true, messageId, job: jobRecord });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to send poll to Telegram",
      });
    }
  });

  // --- Schedule Queue CRUD ---

  app.get("/api/schedules", (_req, res) => {
    const jobs = listJobs().sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
    res.json({ jobs });
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      const store = readStore();
      const body = req.body as {
        polls: PollDraft[];
        startAt: string;
        intervalMinutes?: number;
        channelId?: string;
        sourceKind?: SourceKind;
        sourceLabel?: string;
      };

      if (!Array.isArray(body.polls) || body.polls.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one poll is required." });
      }

      const startMs = new Date(body.startAt).getTime();
      if (Number.isNaN(startMs)) {
        return res.status(400).json({ error: "Invalid schedule date/time." });
      }

      const intervalMs = Math.max(0, Number(body.intervalMinutes ?? 0)) * 60_000;
      let targetChannel = (body.channelId || store.config.channelId || "").trim();

      if (!targetChannel) {
        return res.status(400).json({
          error:
            "Telegram Channel is required before scheduling. Select a channel in Telegram Connection.",
        });
      }

      if (
        store.config.authMode === "user" &&
        store.config.sessionString &&
        store.config.apiId &&
        store.config.apiHash
      ) {
        const check = await verifyUserAdminAndResolveTarget(
          store.config.apiId,
          store.config.apiHash,
          store.config.sessionString,
          targetChannel
        );
        if (!check.ok) {
          return res.status(403).json({ error: check.error });
        }
        targetChannel = check.channelId;
      }

      const nowIso = new Date().toISOString();
      const createdJobs: ScheduledPollJob[] = body.polls.map((poll, idx) => ({
        ...poll,
        id: crypto.randomUUID(),
        scheduledAt: new Date(startMs + idx * intervalMs).toISOString(),
        channelId: targetChannel,
        status: "pending",
        sourceKind: body.sourceKind ?? "text",
        sourceLabel: body.sourceLabel ?? "Scheduled poll",
        createdAt: nowIso,
      }));

      const allJobs = addJobs(createdJobs);
      res.json({ created: createdJobs, jobs: allJobs });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to schedule polls",
      });
    }
  });

  app.patch("/api/schedules/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const body = req.body as Partial<ScheduledPollJob> & {
        action?: "post_now";
      };

      if (body.action === "post_now") {
        const store = readStore();
        const existing = store.jobs.find((j) => j.id === id);
        if (!existing) {
          return res.status(404).json({ error: "Scheduled job not found." });
        }
        const { messageId } = await dispatchPoll(
          store.config,
          existing.channelId,
          existing
        );
        const updated = updateJob(id, (cur) => ({
          ...cur,
          status: "posted",
          postedAt: new Date().toISOString(),
          telegramMessageId: messageId,
          errorMessage: undefined,
        }));
        return res.json({ job: updated });
      }

      const updated = updateJob(id, (current) => ({
        ...current,
        question:
          body.question !== undefined
            ? body.question.slice(0, 300)
            : current.question,
        postText:
          body.postText !== undefined
            ? body.postText.slice(0, 4096)
            : current.postText,
        imageBase64:
          body.imageBase64 !== undefined
            ? body.imageBase64
            : current.imageBase64,
        imageMimeType:
          body.imageMimeType !== undefined
            ? body.imageMimeType
            : current.imageMimeType,
        imageName:
          body.imageName !== undefined ? body.imageName : current.imageName,
        indexingKeywords: Array.isArray(body.indexingKeywords)
          ? body.indexingKeywords
          : current.indexingKeywords,
        options: Array.isArray(body.options)
          ? body.options.map((o) => o.slice(0, 100)).slice(0, 10)
          : current.options,
        type: body.type ?? current.type,
        correctOptionIndex:
          body.correctOptionIndex !== undefined
            ? body.correctOptionIndex
            : current.correctOptionIndex,
        explanation:
          body.explanation !== undefined
            ? body.explanation.slice(0, 200)
            : current.explanation,
        caption: body.caption !== undefined ? body.caption : current.caption,
        scheduledAt: body.scheduledAt ?? current.scheduledAt,
        status: body.status ?? current.status,
        errorMessage:
          body.status === "pending" ? undefined : current.errorMessage,
      }));

      if (!updated) {
        return res.status(404).json({ error: "Scheduled job not found." });
      }
      res.json({ job: updated });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to update scheduled job",
      });
    }
  });

  app.delete("/api/schedules/:id", (req, res) => {
    const deleted = deleteJob(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Scheduled job not found." });
    }
    res.json({ ok: true });
  });

  // Return clean JSON errors for /api/*
  app.use(
    "/api",
    (
      err: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        err.status || (err.type === "entity.too.large" ? 413 : 500);
      const message =
        err.type === "entity.too.large"
          ? "Uploaded file is too large. Please keep files under 20 MB."
          : err.message || "Internal server error";
      res.status(status).json({ error: message });
    }
  );

  return app;
}
