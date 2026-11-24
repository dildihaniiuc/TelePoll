import fs from "fs";
import path from "path";
import type { AgentStoreData, ScheduledPollJob, TelegramConfig } from "./types.ts";

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const DATA_DIR = IS_VERCEL
  ? path.join("/tmp", "telepoll-data")
  : path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "agent-store.json");

const DEFAULT_STORE: AgentStoreData = {
  config: {
    authMode: "user",
    botToken: "",
    channelId: "",
    agentListenerEnabled: false,
    agentTriggerMode: "all",
    timezoneOffsetMinutes: -360,
    agentPersona:
      "You are a precise, thoughtful personal Telegram channel curator. Craft clear, engaging polls and messages with 100% verified accuracy—never guess, and ignore any unclear or ambiguous details.",
    defaultLanguage: "auto",
  },
  jobs: [],
};

// In-memory safety cache prevents transient read errors from dropping an active session
let lastKnownGoodStore: AgentStoreData | null = null;

function applyEnvDefaults(config: TelegramConfig): TelegramConfig {
  const next = { ...config };
  const envApiId = Number(process.env.TELEGRAM_API_ID || 0);
  const envApiHash = (process.env.TELEGRAM_API_HASH || "").trim();
  const envSession = (process.env.TELEGRAM_SESSION_STRING || "").trim();
  const envBotToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const envChannelId = (process.env.TELEGRAM_CHANNEL_ID || "").trim();
  const envControlGroupId = (process.env.TELEGRAM_CONTROL_GROUP_ID || "").trim();

  if (!next.apiId && envApiId > 0) next.apiId = envApiId;
  if (!next.apiHash && envApiHash) next.apiHash = envApiHash;
  if (!next.sessionString && envSession) next.sessionString = envSession;
  if (!next.botToken && envBotToken) next.botToken = envBotToken;
  if (!next.channelId && envChannelId) next.channelId = envChannelId;
  if (!next.controlGroupId && envControlGroupId) {
    next.controlGroupId = envControlGroupId;
  }
  if (next.sessionString && !next.userDisplayName) {
    next.userDisplayName = process.env.TELEGRAM_USER_NAME?.trim() || "Telegram Account";
  }
  if (next.sessionString && next.channelId && !next.verifiedAt) {
    next.verifiedAt = new Date().toISOString();
  }
  if (!next.sessionString && next.botToken && !process.env.TELEGRAM_SESSION_STRING) {
    next.authMode = "bot";
  }
  return next;
}

function ensureStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: AgentStoreData = lastKnownGoodStore
      ? {
          config: applyEnvDefaults({ ...lastKnownGoodStore.config }),
          jobs: [...lastKnownGoodStore.jobs],
        }
      : {
          config: applyEnvDefaults({ ...DEFAULT_STORE.config }),
          jobs: [],
        };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
  }
}

export function readStore(): AgentStoreData {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentStoreData>;
    const store: AgentStoreData = {
      config: applyEnvDefaults({
        ...DEFAULT_STORE.config,
        ...(parsed.config ?? {}),
      }),
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
    lastKnownGoodStore = store;
    return store;
  } catch {
    if (lastKnownGoodStore) {
      return {
        config: applyEnvDefaults({ ...lastKnownGoodStore.config }),
        jobs: [...lastKnownGoodStore.jobs],
      };
    }
    return {
      config: applyEnvDefaults({ ...DEFAULT_STORE.config }),
      jobs: [],
    };
  }
}

export function writeStore(data: AgentStoreData): void {
  lastKnownGoodStore = data;
  ensureStore();
  const tmpPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}

export function updateConfig(partial: Partial<TelegramConfig>): TelegramConfig {
  const store = readStore();
  store.config = { ...store.config, ...partial };
  writeStore(store);
  return store.config;
}

export function getPublicConfig(config: TelegramConfig) {
  const token = config.botToken.trim();
  let masked = "";
  if (token.length > 10) {
    masked = `${token.slice(0, 6)}••••••${token.slice(-4)}`;
  } else if (token.length > 0) {
    masked = "••••••";
  }

  return {
    authMode: config.authMode || "user",
    hasUserSession: Boolean(config.sessionString && config.apiId && config.apiHash),
    hasApiCredentials: Boolean(config.apiId && config.apiHash),
    apiId: config.apiId,
    userPhone: config.userPhone,
    userDisplayName: config.userDisplayName,
    userUsername: config.userUsername,
    userId: config.userId,
    channelId: config.channelId,
    botUsername: config.botUsername,
    channelTitle: config.channelTitle,
    channelType: config.channelType,
    verifiedAt: config.verifiedAt,
    controlGroupId: config.controlGroupId || "",
    controlGroupTitle: config.controlGroupTitle || "",
    agentListenerEnabled: Boolean(config.agentListenerEnabled),
    agentTriggerMode: config.agentTriggerMode || "all",
    agentPersona: config.agentPersona,
    defaultLanguage: config.defaultLanguage,
    hasBotToken: token.length > 0,
    maskedBotToken: masked,
  };
}

export function listJobs(): ScheduledPollJob[] {
  return readStore().jobs;
}

export function addJobs(newJobs: ScheduledPollJob[]): ScheduledPollJob[] {
  const store = readStore();
  store.jobs.unshift(...newJobs);
  writeStore(store);
  return store.jobs;
}

export function updateJob(
  id: string,
  updater: (job: ScheduledPollJob) => ScheduledPollJob
): ScheduledPollJob | null {
  const store = readStore();
  const idx = store.jobs.findIndex((j) => j.id === id);
  if (idx === -1) return null;
  store.jobs[idx] = updater(store.jobs[idx]);
  writeStore(store);
  return store.jobs[idx];
}

export function deleteJob(id: string): boolean {
  const store = readStore();
  const next = store.jobs.filter((j) => j.id !== id);
  if (next.length === store.jobs.length) return false;
  store.jobs = next;
  writeStore(store);
  return true;
}

export function createBackupBundle(): AgentStoreData {
  return readStore();
}

export function restoreBackupBundle(bundle: Partial<AgentStoreData>): {
  restored: boolean;
  store: AgentStoreData;
} {
  const current = readStore();
  const incomingCfg = bundle.config;
  if (!incomingCfg) {
    return { restored: false, store: current };
  }

  const hasCurrentUserAuth = Boolean(
    current.config.sessionString && current.config.apiId && current.config.apiHash
  );
  const hasCurrentBotAuth = Boolean(current.config.botToken);

  const mergedConfig: TelegramConfig = {
    ...DEFAULT_STORE.config,
    ...incomingCfg,
    ...current.config,
    // Prefer whichever credential is missing on current server instance
    apiId: current.config.apiId || incomingCfg.apiId,
    apiHash: current.config.apiHash || incomingCfg.apiHash,
    sessionString: current.config.sessionString || incomingCfg.sessionString,
    userId: current.config.userId || incomingCfg.userId,
    userDisplayName: current.config.userDisplayName || incomingCfg.userDisplayName,
    userUsername: current.config.userUsername || incomingCfg.userUsername,
    userPhone: current.config.userPhone || incomingCfg.userPhone,
    botToken: current.config.botToken || incomingCfg.botToken || "",
    botUsername: current.config.botUsername || incomingCfg.botUsername,
    channelId: current.config.channelId || incomingCfg.channelId || "",
    channelTitle: current.config.channelTitle || incomingCfg.channelTitle,
    channelType: current.config.channelType || incomingCfg.channelType,
    verifiedAt: current.config.verifiedAt || incomingCfg.verifiedAt,
    controlGroupId: current.config.controlGroupId || incomingCfg.controlGroupId,
    controlGroupTitle:
      current.config.controlGroupTitle || incomingCfg.controlGroupTitle,
    authMode:
      hasCurrentUserAuth || hasCurrentBotAuth
        ? current.config.authMode
        : incomingCfg.authMode || current.config.authMode,
  };

  const existingIds = new Set(current.jobs.map((j) => j.id));
  const incomingJobs = Array.isArray(bundle.jobs)
    ? bundle.jobs.filter((j) => j && j.id && !existingIds.has(j.id))
    : [];

  const nextStore: AgentStoreData = {
    config: mergedConfig,
    jobs: [...current.jobs, ...incomingJobs].slice(0, 200),
  };

  const didRestoreCredentials =
    (!hasCurrentUserAuth &&
      Boolean(
        mergedConfig.sessionString && mergedConfig.apiId && mergedConfig.apiHash
      )) ||
    (!hasCurrentBotAuth && Boolean(mergedConfig.botToken));

  writeStore(nextStore);
  return {
    restored: didRestoreCredentials || incomingJobs.length > 0,
    store: nextStore,
  };
}
