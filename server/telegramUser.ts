import crypto from "crypto";
import { Api, TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import { StringSession } from "telegram/sessions/index.js";
import { generateRandomLong } from "telegram/Helpers.js";
import { Logger, LogLevel } from "telegram/extensions/Logger.js";
import { NewMessage, type NewMessageEvent } from "telegram/events/index.js";
import {
  buildTelegramPostLink,
  formatChannelIndexPost,
  normalizeKeywordList,
  type IndexedChannelMessage,
} from "./channelIndexer.ts";
import { readStore } from "./store.ts";
import { processTelegramAgentMessage } from "./telegramAgentBrain.ts";
import type { PollDraft, SourceKind, TelegramDialogSummary } from "./types.ts";

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);

interface PendingAuthPayload {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  phoneCodeHash: string;
  sessionString: string;
  createdAt: number;
}

const pendingAuths = new Map<string, PendingAuthPayload>();
const activeClients = new Map<string, TelegramClient>();
const connectingPromises = new Map<string, Promise<TelegramClient>>();

function getStatelessAuthKey(): Buffer {
  const seed =
    process.env.AUTH_SECRET ||
    process.env.GEMINI_API_KEY ||
    process.env.TELEGRAM_API_HASH ||
    "telepoll-stateless-auth-secret-v1";
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptPendingAuthToken(payload: PendingAuthPayload): string {
  const key = getStatelessAuthKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptPendingAuthToken(token: string): PendingAuthPayload | null {
  if (!token || !token.startsWith("v1.")) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const encrypted = Buffer.from(parts[3], "base64url");
    const key = getStatelessAuthKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as PendingAuthPayload;
    if (
      !parsed ||
      !parsed.apiId ||
      !parsed.apiHash ||
      !parsed.phoneNumber ||
      !parsed.phoneCodeHash ||
      typeof parsed.sessionString !== "string"
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > 15 * 60_000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizePhoneNumber(raw: string): string {
  let cleaned = raw.trim().replace(/[\s()-]+/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  } else if (/^01\d{9}$/.test(cleaned)) {
    // Auto-normalize Bangladesh 11-digit local numbers like 017XXXXXXXX
    cleaned = `+88${cleaned}`;
  } else if (/^\d{10,15}$/.test(cleaned)) {
    cleaned = `+${cleaned}`;
  }
  return cleaned;
}

// Track messages sent by our agent to guarantee zero infinite loops
const sentByAgentMsgIds = new Set<number>();
const recentOutgoingAgentTexts = new Map<string, number>();
const processedIncomingKeys = new Set<string>();
let activeListenerClient: TelegramClient | null = null;
let activeListenerHandler: ((event: NewMessageEvent) => void) | null = null;

function rememberOutgoingText(text: string): string {
  const key = text.trim().slice(0, 140);
  if (key) {
    recentOutgoingAgentTexts.set(key, Date.now());
  }
  return key;
}

function isRecentAgentOutgoingText(text: string): boolean {
  const key = text.trim().slice(0, 140);
  if (!key) return false;
  const ts = recentOutgoingAgentTexts.get(key);
  if (!ts) return false;
  if (Date.now() - ts < 20_000) {
    recentOutgoingAgentTexts.delete(key);
    return true;
  }
  recentOutgoingAgentTexts.delete(key);
  return false;
}

async function sendTrackedGroupMessage(
  client: TelegramClient,
  peer: Api.TypeInputPeer | string,
  text: string,
  replyTo?: number
): Promise<number> {
  const truncated = text.slice(0, 4096);
  rememberOutgoingText(truncated);
  const sent = await client.sendMessage(peer, {
    message: truncated,
    ...(replyTo ? { replyTo } : {}),
  });
  if (sent?.id) {
    sentByAgentMsgIds.add(sent.id);
  }
  return sent?.id ?? 0;
}

function createQuietLogger(): Logger {
  return new Logger(LogLevel.ERROR);
}

const cleanupInterval = setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [id, entry] of pendingAuths.entries()) {
    if (entry.createdAt < cutoff) {
      pendingAuths.delete(id);
    }
  }
  if (sentByAgentMsgIds.size > 500) sentByAgentMsgIds.clear();
  if (processedIncomingKeys.size > 500) processedIncomingKeys.clear();
  for (const [k, ts] of recentOutgoingAgentTexts.entries()) {
    if (Date.now() - ts > 30_000) recentOutgoingAgentTexts.delete(k);
  }
}, 300_000);
cleanupInterval.unref();

function formatMtprotoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("PHONE_NUMBER_INVALID")) {
    return "ফোন নম্বরটি সঠিক নয়। দেশের কোডসহ লিখুন (যেমন +8801XXXXXXXXX)।";
  }
  if (msg.includes("PHONE_NUMBER_BANNED")) {
    return "এই টেলিগ্রাম নম্বরটি টেলিগ্রাম থেকে সীমাবদ্ধ বা ব্যান করা হয়েছে।";
  }
  if (msg.includes("PHONE_NUMBER_FLOOD")) {
    return "অনেকবার কোড চাওয়ার কারণে টেলিগ্রাম সাময়িকভাবে ব্লক করেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
  }
  if (msg.includes("PHONE_CODE_INVALID") || msg.includes("PHONE_CODE_EMPTY")) {
    return "ভেরিফিকেশন কোডটি সঠিক নয়। টেলিগ্রাম অ্যাপে আসা কোডটি যাচাই করুন।";
  }
  if (msg.includes("PHONE_CODE_EXPIRED")) {
    return "ভেরিফিকেশন কোডের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে নতুন কোড পাঠান।";
  }
  if (msg.includes("API_ID_INVALID") || msg.includes("API_ID_PUBLISHED_FLOOD")) {
    return "my.telegram.org থেকে নেওয়া API ID বা API Hash সঠিক নয়।";
  }
  if (msg.includes("PASSWORD_HASH_INVALID")) {
    return "2FA ক্লাউড পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।";
  }
  if (msg.includes("CHAT_ADMIN_REQUIRED") || msg.includes("CHAT_WRITE_FORBIDDEN")) {
    return "এই চ্যানেল/গ্রুপে পোস্ট করার এডমিন অনুমতি আপনার নেই।";
  }
  if (msg.includes("FLOOD_WAIT")) {
    return "টেলিগ্রামের রেট-লিমিট হিট হয়েছে। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।";
  }
  if (
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("CONNECT_TIMEOUT") ||
    msg.includes("Not connected")
  ) {
    return "টেলিগ্রাম সার্ভারের সাথে সংযোগ হতে সময় বেশি লাগছে। কয়েক সেকেন্ড পর আবার চেষ্টা করুন।";
  }
  return msg;
}

async function getConnectedClient(
  apiId: number,
  apiHash: string,
  sessionString: string
): Promise<TelegramClient> {
  const cacheKey = `${apiId}:${sessionString.slice(0, 24)}`;
  const existing = activeClients.get(cacheKey);
  if (existing && existing.connected) {
    return existing;
  }

  const inflight = connectingPromises.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const connectPromise = (async () => {
    if (existing) {
      try {
        await existing.connect();
        if (existing.connected) {
          return existing;
        }
      } catch {
        await existing.disconnect().catch(() => {});
        activeClients.delete(cacheKey);
      }
    }

    const client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash,
      {
        connectionRetries: IS_VERCEL ? 2 : 25,
        retryDelay: IS_VERCEL ? 500 : 2000,
        timeout: IS_VERCEL ? 8 : 10,
        autoReconnect: !IS_VERCEL,
        requestRetries: IS_VERCEL ? 2 : 5,
        useWSS: true,
        baseLogger: createQuietLogger(),
      }
    );
    await client.connect();
    const authorized = await client.isUserAuthorized();
    if (!authorized) {
      await client.disconnect().catch(() => {});
      throw new Error(
        "Telegram session is no longer authorized. Please sign in again."
      );
    }
    activeClients.set(cacheKey, client);
    return client;
  })();

  connectingPromises.set(cacheKey, connectPromise);
  try {
    return await connectPromise;
  } finally {
    connectingPromises.delete(cacheKey);
  }
}

export async function disconnectCachedClient(
  sessionString?: string
): Promise<void> {
  stopUserGroupListener();
  if (!sessionString) return;
  for (const [key, client] of activeClients.entries()) {
    if (key.includes(sessionString.slice(0, 24))) {
      await client.disconnect().catch(() => {});
      activeClients.delete(key);
    }
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendTelegramAuthCode(params: {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
}): Promise<{ authId: string; isCodeViaApp: boolean }> {
  const apiId = Number(params.apiId);
  const apiHash = params.apiHash.trim();
  const phoneNumber = normalizePhoneNumber(params.phoneNumber);

  if (!apiId || Number.isNaN(apiId)) {
    throw new Error("সঠিক Telegram API ID দিন (my.telegram.org থেকে প্রাপ্ত)।");
  }
  if (!apiHash || apiHash.length < 16) {
    throw new Error("সঠিক Telegram API Hash দিন (my.telegram.org থেকে প্রাপ্ত)।");
  }
  if (!/^\+\d{7,15}$/.test(phoneNumber)) {
    throw new Error(
      "দেশের কোডসহ সঠিক ফোন নম্বর দিন (যেমন +8801XXXXXXXXX)।"
    );
  }

  let lastErr: unknown;

  // Try port 443 MTProto first (most reliable on Vercel/cloud egress), then fallback to port 80
  for (const useWSS of [true, false]) {
    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
      connectionRetries: 2,
      retryDelay: 400,
      timeout: 7,
      requestRetries: 2,
      autoReconnect: false,
      useWSS,
      baseLogger: createQuietLogger(),
    });

    try {
      await withTimeout(client.connect(), 14_000, "CONNECT_TIMEOUT");
      const { phoneCodeHash, isCodeViaApp } = await withTimeout(
        client.sendCode({ apiId, apiHash }, phoneNumber),
        16_000,
        "CONNECT_TIMEOUT"
      );
      const sessionString = client.session.save() as unknown as string;
      await client.disconnect().catch(() => {});

      const payload: PendingAuthPayload = {
        apiId,
        apiHash,
        phoneNumber,
        phoneCodeHash,
        sessionString,
        createdAt: Date.now(),
      };
      const authId = encryptPendingAuthToken(payload);
      pendingAuths.set(authId, payload);
      return { authId, isCodeViaApp };
    } catch (err) {
      await client.disconnect().catch(() => {});
      lastErr = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      // Only retry alternate port on transport/timeout errors, never on invalid API/phone errors
      const isTransportFailure =
        errMsg.includes("CONNECT_TIMEOUT") ||
        errMsg.includes("ETIMEDOUT") ||
        errMsg.includes("ECONNREFUSED") ||
        errMsg.includes("ECONNRESET") ||
        errMsg.includes("Not connected");
      if (!isTransportFailure) {
        throw new Error(formatMtprotoError(err));
      }
    }
  }

  throw new Error(formatMtprotoError(lastErr));
}

export async function verifyTelegramAuthCode(params: {
  authId: string;
  code?: string;
  password?: string;
}): Promise<
  | { requires2FA: true; signedIn: false; authId: string }
  | {
      requires2FA: false;
      signedIn: true;
      apiId: number;
      apiHash: string;
      sessionString: string;
      user: {
        id: string;
        displayName: string;
        username?: string;
        phone: string;
      };
    }
> {
  const pending =
    decryptPendingAuthToken(params.authId) || pendingAuths.get(params.authId);
  if (!pending) {
    throw new Error(
      "লগইন সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার 'লগইন কোড পাঠান' বাটনে ক্লিক করুন।"
    );
  }

  const { apiId, apiHash, phoneNumber, phoneCodeHash, sessionString: tempSession } =
    pending;

  const client = new TelegramClient(
    new StringSession(tempSession),
    apiId,
    apiHash,
    {
      connectionRetries: 2,
      retryDelay: 400,
      timeout: 8,
      requestRetries: 2,
      autoReconnect: false,
      useWSS: true,
      baseLogger: createQuietLogger(),
    }
  );

  try {
    await withTimeout(client.connect(), 14_000, "CONNECT_TIMEOUT");

    let signedInUser: Api.User | undefined;

    if (params.password && !params.code) {
      const res = await client.signInWithPassword(
        { apiId, apiHash },
        {
          password: async () => params.password!.trim(),
          onError: async (err) => {
            throw err;
          },
        }
      );
      if (res instanceof Api.User) signedInUser = res;
    } else {
      const code = (params.code || "").trim();
      if (!code) {
        throw new Error("টেলিগ্রাম থেকে পাওয়া ভেরিফিকেশন কোডটি লিখুন।");
      }

      try {
        const authResult = await client.invoke(
          new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode: code,
          })
        );
        if (
          authResult instanceof Api.auth.Authorization &&
          authResult.user instanceof Api.User
        ) {
          signedInUser = authResult.user;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("SESSION_PASSWORD_NEEDED")) {
          if (!params.password) {
            const updatedSession = client.session.save() as unknown as string;
            await client.disconnect().catch(() => {});
            const updatedPayload: PendingAuthPayload = {
              ...pending,
              sessionString: updatedSession || pending.sessionString,
              createdAt: Date.now(),
            };
            const refreshedAuthId = encryptPendingAuthToken(updatedPayload);
            pendingAuths.set(refreshedAuthId, updatedPayload);
            return {
              requires2FA: true,
              signedIn: false,
              authId: refreshedAuthId,
            };
          }
          const res = await client.signInWithPassword(
            { apiId, apiHash },
            {
              password: async () => params.password!.trim(),
              onError: async (err2) => {
                throw err2;
              },
            }
          );
          if (res instanceof Api.User) signedInUser = res;
        } else {
          throw err;
        }
      }
    }

    if (!signedInUser) {
      const me = await client.getMe();
      if (me instanceof Api.User) signedInUser = me;
    }

    const sessionString = client.session.save() as unknown as string;
    pendingAuths.delete(params.authId);

    if (IS_VERCEL) {
      await client.disconnect().catch(() => {});
    } else {
      const cacheKey = `${apiId}:${sessionString.slice(0, 24)}`;
      activeClients.set(cacheKey, client);
    }

    const fullName = [signedInUser?.firstName, signedInUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      requires2FA: false,
      signedIn: true,
      apiId,
      apiHash,
      sessionString,
      user: {
        id: signedInUser ? String(signedInUser.id) : "",
        displayName: fullName || phoneNumber,
        username: signedInUser?.username || undefined,
        phone: phoneNumber,
      },
    };
  } catch (err) {
    await client.disconnect().catch(() => {});
    throw new Error(formatMtprotoError(err));
  }
}

function evaluateEntityAdminStatus(entity: unknown): {
  isAdmin: boolean;
  canPost: boolean;
  isBroadcastChannel: boolean;
  isBot?: boolean;
  username?: string;
} {
  if (entity instanceof Api.Channel) {
    const isBroadcastChannel = Boolean(entity.broadcast);
    const isAdmin = Boolean(entity.creator || entity.adminRights);
    const canPost = isBroadcastChannel
      ? Boolean(entity.creator || entity.adminRights?.postMessages)
      : Boolean(
          entity.creator ||
            entity.adminRights ||
            (!entity.bannedRights?.sendPolls &&
              !entity.defaultBannedRights?.sendPolls)
        );
    return {
      isAdmin,
      canPost,
      isBroadcastChannel,
      username: entity.username || undefined,
    };
  }

  if (entity instanceof Api.Chat) {
    const isAdmin = Boolean(entity.creator || entity.adminRights);
    const canPost = Boolean(
      entity.creator ||
        entity.adminRights ||
        !entity.defaultBannedRights?.sendPolls
    );
    return {
      isAdmin,
      canPost,
      isBroadcastChannel: false,
      username: undefined,
    };
  }

  if (entity instanceof Api.User && entity.bot) {
    return {
      isAdmin: true,
      canPost: true,
      isBroadcastChannel: false,
      isBot: true,
      username: entity.username || undefined,
    };
  }

  return {
    isAdmin: false,
    canPost: false,
    isBroadcastChannel: false,
  };
}

export async function listUserTelegramChannels(
  apiId: number,
  apiHash: string,
  sessionString: string
): Promise<TelegramDialogSummary[]> {
  try {
    const client = await getConnectedClient(apiId, apiHash, sessionString);
    const dialogs = await client.getDialogs({ limit: 150 });
    const results: TelegramDialogSummary[] = [];

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      const isBotDialog = entity instanceof Api.User && Boolean(entity.bot);
      if (!dialog.isChannel && !dialog.isGroup && !isBotDialog) continue;

      const status = evaluateEntityAdminStatus(entity);
      const idStr = dialog.id ? dialog.id.toString() : "";
      if (!idStr) continue;

      if (isBotDialog) {
        const botName =
          dialog.title ||
          [entity.firstName, entity.lastName].filter(Boolean).join(" ").trim() ||
          (status.username ? `@${status.username}` : idStr);
        results.push({
          id: idStr,
          title: botName,
          username: status.username,
          type: "bot",
          isAdmin: true,
          canPost: true,
        });
        continue;
      }

      const isBroadcastChannel =
        entity instanceof Api.Channel
          ? status.isBroadcastChannel
          : Boolean(dialog.isChannel && !dialog.isGroup);

      results.push({
        id: idStr,
        title: dialog.title || status.username || idStr,
        username: status.username,
        type: isBroadcastChannel ? "channel" : "group",
        isAdmin: status.isAdmin,
        canPost: status.canPost,
      });
    }

    // Sort admin channels/groups first, then bots, then non-admin chats
    const sortRank = (item: TelegramDialogSummary) =>
      item.type === "bot" ? 1 : item.isAdmin ? 2 : 0;
    results.sort((a, b) => sortRank(b) - sortRank(a));

    return results;
  } catch (err) {
    throw new Error(formatMtprotoError(err));
  }
}

export async function verifyUserAdminAndResolveTarget(
  apiId: number,
  apiHash: string,
  sessionString: string,
  rawTarget: string
): Promise<
  | { ok: true; channelId: string; channelTitle: string; channelType: string }
  | { ok: false; error: string }
> {
  const trimmed = rawTarget.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "অনুগ্রহ করে চ্যানেল বা গ্রুপের নাম, @username অথবা আইডি উল্লেখ করুন।",
    };
  }

  if (trimmed.toLowerCase() === "me" || trimmed.toLowerCase() === "saved messages") {
    return {
      ok: true,
      channelId: "me",
      channelTitle: "Saved Messages",
      channelType: "private",
    };
  }

  try {
    const client = await getConnectedClient(apiId, apiHash, sessionString);

    let normalizedQuery = trimmed;
    const tmeMatch = trimmed.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/i);
    if (tmeMatch) {
      normalizedQuery = `@${tmeMatch[1]}`;
    }

    const dialogs = await client.getDialogs({ limit: 150 });
    const lowerQuery = normalizedQuery.toLowerCase();
    const cleanHandle = lowerQuery.replace(/^@/, "");

    let matchedEntity: Api.TypeChat | Api.User | undefined;
    let matchedIdStr = "";
    let matchedTitle = "";

    // Match priority: exact ID > exact @username > exact title > partial title
    const isEligibleDialog = (d: (typeof dialogs)[number]) =>
      d.isChannel || d.isGroup || (d.entity instanceof Api.User && Boolean(d.entity.bot));

    const findMatch = () => {
      for (const d of dialogs) {
        if (!isEligibleDialog(d)) continue;
        const idStr = d.id?.toString() || "";
        const ent = d.entity;
        const uname =
          (ent instanceof Api.Channel || ent instanceof Api.User) && ent.username
            ? ent.username.toLowerCase()
            : "";
        if (idStr === normalizedQuery || (uname && uname === cleanHandle)) {
          return d;
        }
      }
      for (const d of dialogs) {
        if (!isEligibleDialog(d)) continue;
        if ((d.title || "").trim().toLowerCase() === lowerQuery) return d;
      }
      for (const d of dialogs) {
        if (!isEligibleDialog(d)) continue;
        const title = (d.title || "").trim().toLowerCase();
        if (title && (title.includes(lowerQuery) || lowerQuery.includes(title))) {
          return d;
        }
      }
      return undefined;
    };

    const dialogMatch = findMatch();
    if (
      dialogMatch &&
      (dialogMatch.entity instanceof Api.Channel ||
        dialogMatch.entity instanceof Api.Chat ||
        (dialogMatch.entity instanceof Api.User && Boolean(dialogMatch.entity.bot)))
    ) {
      matchedEntity = dialogMatch.entity;
      matchedIdStr = dialogMatch.id?.toString() || "";
      matchedTitle = dialogMatch.title || matchedIdStr;
    } else if (/^(@?[a-zA-Z][a-zA-Z0-9_]{3,}|-?\d{5,})$/.test(normalizedQuery)) {
      const lookup = /^\d+$/.test(normalizedQuery)
        ? Number(normalizedQuery)
        : normalizedQuery.startsWith("@")
          ? normalizedQuery
          : `@${normalizedQuery}`;
      try {
        const ent = await client.getEntity(lookup);
        if (ent instanceof Api.Channel || ent instanceof Api.Chat) {
          matchedEntity = ent;
          matchedTitle = ent.title || normalizedQuery;
          matchedIdStr =
            ent instanceof Api.Channel
              ? `-100${ent.id.toString()}`
              : `-${ent.id.toString()}`;
        } else if (ent instanceof Api.User && ent.bot) {
          matchedEntity = ent;
          matchedTitle =
            [ent.firstName, ent.lastName].filter(Boolean).join(" ").trim() ||
            (ent.username ? `@${ent.username}` : normalizedQuery);
          matchedIdStr = ent.username ? `@${ent.username}` : ent.id.toString();
        }
      } catch {
        // Not found
      }
    }

    if (!matchedEntity) {
      return {
        ok: false,
        error: `⚠️ "${trimmed}" নামে কোনো টেলিগ্রাম চ্যানেল, গ্রুপ বা বট (যেমন @QuizBot) খুঁজে পাওয়া যায়নি।`,
      };
    }

    let { isAdmin, canPost, isBroadcastChannel, isBot, username } =
      evaluateEntityAdminStatus(matchedEntity);

    if (isBot) {
      const preferredId = username ? `@${username}` : matchedIdStr;
      return {
        ok: true,
        channelId: preferredId,
        channelTitle: matchedTitle || preferredId,
        channelType: "bot",
      };
    }

    // For Channel/Supergroup entities, confirm exact participant rights via channels.GetParticipant if needed
    if (matchedEntity instanceof Api.Channel && (!isAdmin || !canPost)) {
      try {
        const partRes = await client.invoke(
          new Api.channels.GetParticipant({
            channel: matchedEntity,
            participant: "me",
          })
        );
        const p = partRes.participant;
        if (p instanceof Api.ChannelParticipantCreator) {
          isAdmin = true;
          canPost = true;
        } else if (p instanceof Api.ChannelParticipantAdmin) {
          isAdmin = true;
          canPost = isBroadcastChannel
            ? Boolean(p.adminRights?.postMessages)
            : true;
        }
      } catch {
        // Keep evaluated status
      }
    }

    // For basic Chat groups, double-check GetFullChat participant role if not creator
    if (matchedEntity instanceof Api.Chat && !isAdmin) {
      try {
        const me = await client.getMe();
        const myId = me instanceof Api.User ? me.id.toString() : "";
        const full = await client.invoke(
          new Api.messages.GetFullChat({ chatId: matchedEntity.id })
        );
        if (
          full.fullChat instanceof Api.ChatFull &&
          full.fullChat.participants instanceof Api.ChatParticipants
        ) {
          const mePart = full.fullChat.participants.participants.find(
            (p) => p.userId.toString() === myId
          );
          if (
            mePart instanceof Api.ChatParticipantAdmin ||
            mePart instanceof Api.ChatParticipantCreator
          ) {
            isAdmin = true;
            canPost = true;
          }
        }
      } catch {
        // Keep evaluated status
      }
    }

    if (!isAdmin) {
      return {
        ok: false,
        error: `⚠️ আপনি "${matchedTitle}"-এর এডমিন নন, তাই এজেন্ট সেখানে পোল পোস্ট বা শিডিউল করতে পারবে না।`,
      };
    }

    if (!canPost) {
      return {
        ok: false,
        error: `⚠️ "${matchedTitle}"-এ আপনার পোল/মেসেজ পোস্ট করার এডমিন অনুমতি নেই।`,
      };
    }

    const preferredId = username ? `@${username}` : matchedIdStr;
    return {
      ok: true,
      channelId: preferredId,
      channelTitle: matchedTitle,
      channelType: isBroadcastChannel ? "channel" : "group",
    };
  } catch (err) {
    return {
      ok: false,
      error: `⚠️ টার্গেট যাচাই করা যায়নি: ${formatMtprotoError(err)}`,
    };
  }
}

const peerCache = new Map<string, Api.TypeInputPeer | string>();

async function resolvePeerEntity(client: TelegramClient, channelId: string) {
  let trimmed = channelId.trim();
  const tmeMatch = trimmed.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/i);
  if (tmeMatch) {
    trimmed = `@${tmeMatch[1]}`;
  }
  if (trimmed === "me") return "me";

  const cached = peerCache.get(trimmed);
  if (cached) return cached;

  let resolved: Api.TypeInputPeer | undefined;
  if (/^-?\d+$/.test(trimmed)) {
    try {
      resolved = await client.getInputEntity(Number(trimmed));
    } catch {
      try {
        resolved = await client.getInputEntity(trimmed);
      } catch {
        const dialogs = await client.getDialogs({ limit: 100 });
        const matched = dialogs.find((d) => d.id?.toString() === trimmed);
        if (matched?.inputEntity) {
          resolved = matched.inputEntity;
        }
      }
    }
  } else {
    try {
      resolved = await client.getInputEntity(trimmed);
    } catch {
      const dialogs = await client.getDialogs({ limit: 100 });
      const lower = trimmed.toLowerCase().replace(/^@/, "");
      const matched = dialogs.find((d) => {
        const ent = d.entity;
        return (
          (ent instanceof Api.Channel || ent instanceof Api.User) &&
          ent.username &&
          ent.username.toLowerCase() === lower
        );
      });
      if (matched?.inputEntity) {
        resolved = matched.inputEntity;
      }
    }
  }

  if (!resolved) {
    throw new Error(
      `Could not find Telegram chat "${trimmed}". Please select it from your list.`
    );
  }
  peerCache.set(trimmed, resolved);
  return resolved;
}

function extractMessageId(result: Api.TypeUpdates): number {
  let messageId = 0;
  if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
    for (const upd of result.updates) {
      if (
        upd instanceof Api.UpdateNewMessage ||
        upd instanceof Api.UpdateNewChannelMessage
      ) {
        messageId = upd.message.id;
        break;
      }
      if (upd instanceof Api.UpdateMessageID) {
        messageId = upd.id;
      }
    }
  } else if (result instanceof Api.UpdateShortSentMessage) {
    messageId = result.id;
  }
  return messageId;
}

export async function postTextAsUser(
  apiId: number,
  apiHash: string,
  sessionString: string,
  rawChannelId: string,
  text: string
): Promise<{ messageId: number }> {
  try {
    const client = await getConnectedClient(apiId, apiHash, sessionString);
    const peer = await resolvePeerEntity(client, rawChannelId);
    const cleanText = text.trim().slice(0, 4096);
    if (!cleanText) {
      throw new Error("Post text cannot be empty.");
    }
    const messageId = await sendTrackedGroupMessage(client, peer, cleanText);
    return { messageId };
  } catch (err) {
    throw new Error(formatMtprotoError(err));
  }
}

export async function postPhotoAsUser(
  apiId: number,
  apiHash: string,
  sessionString: string,
  rawChannelId: string,
  imageBase64: string,
  mimeType: string,
  caption?: string,
  fileName?: string
): Promise<{ messageId: number }> {
  try {
    const client = await getConnectedClient(apiId, apiHash, sessionString);
    const peer = await resolvePeerEntity(client, rawChannelId);
    const cleanB64 = imageBase64.replace(/^data:[^;]+;base64,/, "").trim();
    if (!cleanB64) {
      throw new Error("Image data is empty.");
    }
    const buffer = Buffer.from(cleanB64, "base64");
    const ext = mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : "jpg";
    const resolvedName =
      fileName && /\.(png|jpe?g|webp|gif)$/i.test(fileName)
        ? fileName
        : `photo.${ext}`;
    const cleanCaption = (caption || "").trim().slice(0, 1024);
    if (cleanCaption) {
      rememberOutgoingText(cleanCaption);
    }

    const fileObj = new CustomFile(resolvedName, buffer.length, "", buffer);
    const sent = await client.sendFile(peer, {
      file: fileObj,
      caption: cleanCaption || undefined,
      forceDocument: false,
    });
    const messageId = sent?.id ?? 0;
    if (messageId) sentByAgentMsgIds.add(messageId);
    return { messageId };
  } catch (err) {
    throw new Error(formatMtprotoError(err));
  }
}

export async function searchAndIndexChannelPostsAsUser(params: {
  apiId: number;
  apiHash: string;
  sessionString: string;
  targetChannel: string;
  keywords: string[];
  lang?: "bn" | "en";
}): Promise<{
  ok: true;
  channelId: string;
  channelTitle: string;
  channelUsername?: string;
  indexText: string;
  matchedCount: number;
} | { ok: false; error: string }> {
  try {
    const client = await getConnectedClient(
      params.apiId,
      params.apiHash,
      params.sessionString
    );

    let normalizedTarget = params.targetChannel.trim();
    const tmeMatch = normalizedTarget.match(
      /^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/i
    );
    if (tmeMatch) {
      normalizedTarget = `@${tmeMatch[1]}`;
    }

    let peer: Api.TypeInputPeer | string;
    try {
      peer = await resolvePeerEntity(client, normalizedTarget);
    } catch {
      // Fallback: match by dialog title if user typed channel title
      const dialogs = await client.getDialogs({ limit: 150 });
      const q = normalizedTarget.toLowerCase();
      const hit = dialogs.find(
        (d) =>
          (d.isChannel || d.isGroup) &&
          ((d.title || "").trim().toLowerCase() === q ||
            (d.title || "").trim().toLowerCase().includes(q))
      );
      if (!hit?.inputEntity) {
        return {
          ok: false,
          error: `⚠️ "${params.targetChannel}" নামে কোনো টেলিগ্রাম চ্যানেল/গ্রুপ পাওয়া যায়নি।`,
        };
      }
      peer = hit.inputEntity;
    }

    let channelTitle = normalizedTarget;
    let channelUsername: string | undefined;
    let channelIdStr = normalizedTarget;

    if (peer !== "me") {
      try {
        const entity = await client.getEntity(peer);
        if (entity instanceof Api.Channel) {
          channelTitle = entity.title || normalizedTarget;
          channelUsername = entity.username || undefined;
          channelIdStr = channelUsername
            ? `@${channelUsername}`
            : `-100${entity.id.toString()}`;
        } else if (entity instanceof Api.Chat) {
          channelTitle = entity.title || normalizedTarget;
          channelIdStr = `-${entity.id.toString()}`;
        } else if (entity instanceof Api.User) {
          channelTitle =
            [entity.firstName, entity.lastName].filter(Boolean).join(" ").trim() ||
            (entity.username ? `@${entity.username}` : normalizedTarget);
          channelUsername = entity.username || undefined;
          channelIdStr = channelUsername
            ? `@${channelUsername}`
            : entity.id.toString();
        }
      } catch {
        // Keep defaults
      }
    }

    const messageMap = new Map<number, IndexedChannelMessage>();

    const ingestMessages = (msgs: Api.Message[]) => {
      for (const m of msgs) {
        if (!m || !m.id || messageMap.has(m.id)) continue;
        let kind: IndexedChannelMessage["kind"] = "text";
        let text = (m.message || "").trim();

        if (m.media instanceof Api.MessageMediaPoll) {
          kind = "poll";
          const q = m.media.poll?.question?.text || "";
          text = text ? `${q} ${text}` : q;
        } else if (m.media instanceof Api.MessageMediaPhoto) {
          kind = "photo";
          if (!text) text = "[Photo post]";
        } else if (
          m.media instanceof Api.MessageMediaDocument &&
          m.media.document instanceof Api.Document
        ) {
          kind = "document";
          const attr = m.media.document.attributes.find(
            (a): a is Api.DocumentAttributeFilename =>
              a instanceof Api.DocumentAttributeFilename
          );
          if (!text) text = attr?.fileName || "[Document]";
          else if (attr?.fileName) text = `${text} (${attr.fileName})`;
        }

        if (!text) continue;
        const rawNumericChannel =
          m.peerId instanceof Api.PeerChannel
            ? `-100${m.peerId.channelId.toString()}`
            : channelIdStr;

        messageMap.set(m.id, {
          messageId: m.id,
          dateIso: m.date
            ? new Date(m.date * 1000).toISOString()
            : new Date().toISOString(),
          kind,
          text,
          link: buildTelegramPostLink(
            rawNumericChannel,
            channelUsername,
            m.id
          ),
        });
      }
    };

    // 1. Always scan latest 120 channel messages
    const recent = await client.getMessages(peer, { limit: 120 });
    ingestMessages(recent);

    // 2. Also run Telegram server-side keyword search for older messages
    const cleanKeywords = normalizeKeywordList(params.keywords);
    for (const kw of cleanKeywords.slice(0, 5)) {
      try {
        const searchTerm = kw.replace(/^#/, "");
        const hits = await client.getMessages(peer, {
          search: searchTerm,
          limit: 50,
        });
        ingestMessages(hits);
      } catch {
        // Ignore single search error
      }
    }

    // 3. Merge locally tracked posted jobs for this channel as extra coverage
    const store = readStore();
    for (const job of store.jobs) {
      if (job.status !== "posted" || !job.telegramMessageId) continue;
      if (messageMap.has(job.telegramMessageId)) continue;
      const jobCh = (job.channelId || "").toLowerCase();
      const matchesChannel =
        jobCh === channelIdStr.toLowerCase() ||
        (channelUsername && jobCh === `@${channelUsername.toLowerCase()}`);
      if (!matchesChannel) continue;

      const text = [job.postText || job.question, ...(job.indexingKeywords || [])]
        .filter(Boolean)
        .join(" ");
      messageMap.set(job.telegramMessageId, {
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
          channelIdStr,
          channelUsername,
          job.telegramMessageId
        ),
      });
    }

    const formatted = formatChannelIndexPost({
      channelTitle,
      channelId: channelIdStr,
      channelUsername,
      keywords: cleanKeywords,
      items: Array.from(messageMap.values()),
      lang: params.lang,
    });

    return {
      ok: true,
      channelId: channelIdStr,
      channelTitle,
      channelUsername,
      indexText: formatted.indexText,
      matchedCount: formatted.matchedCount,
    };
  } catch (err) {
    return {
      ok: false,
      error: `⚠️ চ্যানেল ইনডেক্স করা যায়নি: ${formatMtprotoError(err)}`,
    };
  }
}

export async function postPollAsUser(
  apiId: number,
  apiHash: string,
  sessionString: string,
  rawChannelId: string,
  poll: PollDraft
): Promise<{ messageId: number }> {
  if (poll.type === "text") {
    return postTextAsUser(
      apiId,
      apiHash,
      sessionString,
      rawChannelId,
      poll.postText || poll.question
    );
  }
  if (poll.type === "image") {
    if (!poll.imageBase64) {
      throw new Error("Image data is missing for this image post.");
    }
    return postPhotoAsUser(
      apiId,
      apiHash,
      sessionString,
      rawChannelId,
      poll.imageBase64,
      poll.imageMimeType || "image/jpeg",
      poll.postText || poll.caption || "",
      poll.imageName
    );
  }

  try {
    const client = await getConnectedClient(apiId, apiHash, sessionString);
    const peer = await resolvePeerEntity(client, rawChannelId);

    const sanitizedQuestion = poll.question.trim().slice(0, 300);
    const sanitizedOptions = poll.options
      .map((opt) => opt.trim().slice(0, 100))
      .filter((opt) => opt.length > 0)
      .slice(0, 10);

    if (!sanitizedQuestion) {
      throw new Error("Poll question cannot be empty.");
    }
    if (sanitizedOptions.length < 2) {
      throw new Error("Telegram polls require at least 2 options.");
    }

    if (poll.caption && poll.caption.trim().length > 0) {
      await sendTrackedGroupMessage(client, peer, poll.caption.trim());
    }

    const answers = sanitizedOptions.map(
      (opt, idx) =>
        new Api.PollAnswer({
          text: new Api.TextWithEntities({ text: opt, entities: [] }),
          option: Buffer.from(String(idx)),
        })
    );

    const buildInputMedia = (isAnon: boolean) => {
      const pollObj = new Api.Poll({
        id: generateRandomLong(),
        question: new Api.TextWithEntities({
          text: sanitizedQuestion,
          entities: [],
        }),
        answers,
        closed: false,
        publicVoters: !isAnon,
        multipleChoice:
          poll.type === "regular" ? Boolean(poll.allowsMultipleAnswers) : false,
        quiz: poll.type === "quiz",
      });

      const safeIdx =
        poll.type === "quiz"
          ? Math.min(
              Math.max(0, Number(poll.correctOptionIndex ?? 0)),
              sanitizedOptions.length - 1
            )
          : undefined;

      const explanation =
        poll.type === "quiz" && poll.explanation?.trim()
          ? poll.explanation.trim().slice(0, 200)
          : undefined;

      return new Api.InputMediaPoll({
        poll: pollObj,
        correctAnswers:
          safeIdx !== undefined ? [Buffer.from(String(safeIdx))] : undefined,
        solution: explanation,
        solutionEntities: explanation ? [] : undefined,
      });
    };

    let result: Api.TypeUpdates;
    try {
      result = await client.invoke(
        new Api.messages.SendMedia({
          peer,
          media: buildInputMedia(poll.isAnonymous),
          message: "",
          randomId: generateRandomLong(),
        })
      );
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      if (
        !poll.isAnonymous &&
        (msg.includes("POLL_PUBLIC_VOTERS_INVALID") ||
          msg.includes("CHAT_SEND_POLL_FORBIDDEN"))
      ) {
        result = await client.invoke(
          new Api.messages.SendMedia({
            peer,
            media: buildInputMedia(true),
            message: "",
            randomId: generateRandomLong(),
          })
        );
      } else {
        throw sendErr;
      }
    }

    const messageId = extractMessageId(result);
    if (messageId) sentByAgentMsgIds.add(messageId);
    return { messageId };
  } catch (err) {
    throw new Error(formatMtprotoError(err));
  }
}

export async function startUserGroupListener(): Promise<boolean> {
  const store = readStore();
  const { apiId, apiHash, sessionString, agentListenerEnabled, controlGroupId } =
    store.config;

  if (
    !agentListenerEnabled ||
    !controlGroupId ||
    !apiId ||
    !apiHash ||
    !sessionString
  ) {
    stopUserGroupListener();
    return false;
  }

  stopUserGroupListener();

  const client = await getConnectedClient(apiId, apiHash, sessionString);

  // Prime the entity cache for the target control group
  try {
    await resolvePeerEntity(
      client,
      controlGroupId === "me" ? "me" : controlGroupId
    );
  } catch {
    // Will retry dynamically on incoming message if needed
  }

  const handler = async (event: NewMessageEvent) => {
    try {
      const msg = event.message;
      if (!msg) return;

      // Never process messages sent by our own agent
      if (sentByAgentMsgIds.has(msg.id)) return;

      const rawTextCheck = (msg.message || "").trim();
      if (rawTextCheck && isRecentAgentOutgoingText(rawTextCheck)) {
        sentByAgentMsgIds.add(msg.id);
        return;
      }

      const liveConfig = readStore().config;
      if (!liveConfig.agentListenerEnabled || !liveConfig.controlGroupId) return;

      const eventChatId =
        (event.chatId ? event.chatId.toString() : "") ||
        (msg.chatId ? msg.chatId.toString() : "");
      const targetGroupId =
        liveConfig.controlGroupId === "me"
          ? liveConfig.userId || ""
          : liveConfig.controlGroupId.trim();

      if (!eventChatId || eventChatId !== targetGroupId) return;

      // Ignore poll messages to prevent re-triggering on polls
      if (msg.media instanceof Api.MessageMediaPoll) return;

      const dedupKey = `${eventChatId}:${msg.id}`;
      if (processedIncomingKeys.has(dedupKey)) return;
      processedIncomingKeys.add(dedupKey);

      const rawText = (msg.message || "").trim();
      let userText = rawText;

      if (liveConfig.agentTriggerMode === "prefix") {
        const match = rawText.match(/^(\/ai|\/agent|!ai|@agent|agent:)\s*/i);
        if (!match) return;
        userText = rawText.slice(match[0].length).trim();
      }

      const hasMedia =
        msg.media instanceof Api.MessageMediaPhoto ||
        msg.media instanceof Api.MessageMediaDocument;
      if (!userText && !hasMedia) return;

      const replyPeer = await resolvePeerEntity(
        client,
        liveConfig.controlGroupId === "me" ? "me" : eventChatId
      );

      // Show "typing..." immediately (even before heavy media download) & refresh every 4s
      const sendTyping = () => {
        void client
          .invoke(
            new Api.messages.SetTyping({
              peer: replyPeer,
              action: new Api.SendMessageTypingAction(),
            })
          )
          .catch(() => {});
      };
      sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);
      typingInterval.unref();

      try {
        // Extract attached photo or PDF document if present
        let attachedFile:
          | {
              name: string;
              mimeType: string;
              dataBase64: string;
              sourceKind: SourceKind;
            }
          | undefined;

        if (msg.media instanceof Api.MessageMediaPhoto) {
          const buf = await client.downloadMedia(msg, {});
          if (Buffer.isBuffer(buf)) {
            attachedFile = {
              name: "telegram_photo.jpg",
              mimeType: "image/jpeg",
              dataBase64: buf.toString("base64"),
              sourceKind: "image",
            };
          }
        } else if (
          msg.media instanceof Api.MessageMediaDocument &&
          msg.media.document instanceof Api.Document
        ) {
          const doc = msg.media.document;
          const mime = doc.mimeType || "";
          const filenameAttr = doc.attributes.find(
            (a): a is Api.DocumentAttributeFilename =>
              a instanceof Api.DocumentAttributeFilename
          );
          const fileName = filenameAttr?.fileName || "telegram_file";

          if (
            mime === "application/pdf" ||
            fileName.toLowerCase().endsWith(".pdf")
          ) {
            const buf = await client.downloadMedia(msg, {});
            if (Buffer.isBuffer(buf)) {
              attachedFile = {
                name: fileName,
                mimeType: "application/pdf",
                dataBase64: buf.toString("base64"),
                sourceKind: "pdf",
              };
            }
          } else if (mime.startsWith("image/")) {
            const buf = await client.downloadMedia(msg, {});
            if (Buffer.isBuffer(buf)) {
              attachedFile = {
                name: fileName,
                mimeType: mime,
                dataBase64: buf.toString("base64"),
                sourceKind: "image",
              };
            }
          }
        }

        if (!userText && !attachedFile) return;

        await processTelegramAgentMessage({
          chatId: eventChatId,
          userText,
          file: attachedFile,
          dispatchPollFn: async (chId, poll) => {
            const latest = readStore().config;
            const target = chId || latest.channelId;
            const { messageId } = await postPollAsUser(
              latest.apiId!,
              latest.apiHash!,
              latest.sessionString!,
              target,
              poll
            );
            return { messageId, channelUsed: target };
          },
          sendReplyTextFn: async (reply) => {
            await sendTrackedGroupMessage(client, replyPeer, reply, msg.id);
          },
          sendPreviewPollFn: async (poll: PollDraft) => {
            const latest = readStore().config;
            await postPollAsUser(
              latest.apiId!,
              latest.apiHash!,
              latest.sessionString!,
              liveConfig.controlGroupId === "me" ? "me" : eventChatId,
              { ...poll, isAnonymous: true }
            );
          },
          listChannelsFn: async () => {
            const latest = readStore().config;
            return listUserTelegramChannels(
              latest.apiId!,
              latest.apiHash!,
              latest.sessionString!
            );
          },
          resolveAndVerifyChannelFn: async (identifier: string) => {
            const latest = readStore().config;
            return verifyUserAdminAndResolveTarget(
              latest.apiId!,
              latest.apiHash!,
              latest.sessionString!,
              identifier
            );
          },
          indexChannelFn: async (targetCh: string, keywords: string[]) => {
            const latest = readStore().config;
            return searchAndIndexChannelPostsAsUser({
              apiId: latest.apiId!,
              apiHash: latest.apiHash!,
              sessionString: latest.sessionString!,
              targetChannel: targetCh,
              keywords,
              lang: latest.defaultLanguage === "en" ? "en" : "bn",
            });
          },
        });
      } finally {
        clearInterval(typingInterval);
      }
    } catch (err) {
      console.error("[Telegram Group Agent Error]", err);
      try {
        const liveConfig = readStore().config;
        const eventChatId = event.chatId ? event.chatId.toString() : "";
        if (eventChatId && liveConfig.controlGroupId) {
          const replyPeer = await resolvePeerEntity(
            client,
            liveConfig.controlGroupId === "me" ? "me" : eventChatId
          );
          await sendTrackedGroupMessage(
            client,
            replyPeer,
            `⚠️ ${err instanceof Error ? err.message : "Could not process message."}`
          );
        }
      } catch {
        // Ignore error notification failure
      }
    }
  };

  client.addEventHandler(handler, new NewMessage({}));
  activeListenerClient = client;
  activeListenerHandler = handler;
  return true;
}

export async function sendUserGroupGreeting(groupId: string): Promise<void> {
  const store = readStore();
  const { apiId, apiHash, sessionString, channelTitle, channelId } = store.config;
  if (!apiId || !apiHash || !sessionString || !groupId) return;

  const client = await getConnectedClient(apiId, apiHash, sessionString);
  const peer = await resolvePeerEntity(
    client,
    groupId === "me" ? "me" : groupId
  );

  const targetLabel = channelTitle || channelId || "নির্বাচিত হয়নি";
  const greeting = [
    "🤖 TelePoll AI Agent এই গ্রুপে সক্রিয় হয়েছে!",
    "",
    `📢 টার্গেট চ্যানেল/গ্রুপ: ${targetLabel}`,
    "",
    "এখানে আমাকে যা বলতে পারেন:",
    "• টেক্সট, ছবি বা পিডিএফ পাঠিয়ে: \"এটা থেকে পসিবল সব কুইজ পোল বানাও\"",
    "• \"এই বিষয়ে চ্যানেলে একটা টেক্সট পোস্ট লিখে দাও\"",
    "• ছবি পাঠিয়ে: \"ছবিটার সুন্দর ক্যাপশন লিখে চ্যানেলে পোস্ট করো\"",
    "• \"BCS কিওয়ার্ড দিয়ে চ্যানেলের পোস্টগুলো ইনডেক্স করো\"",
    "• \"এখনই চ্যানেলে পোস্ট করো\" বা \"রাত ৯টায় শিডিউল করো\"",
  ].join("\n");

  await sendTrackedGroupMessage(client, peer, greeting);
}

export function stopUserGroupListener(): void {
  if (activeListenerClient && activeListenerHandler) {
    try {
      activeListenerClient.removeEventHandler(
        activeListenerHandler,
        new NewMessage({})
      );
    } catch {
      // Ignore cleanup error
    }
  }
  activeListenerClient = null;
  activeListenerHandler = null;
}

export function isUserListenerActive(): boolean {
  return Boolean(activeListenerClient && activeListenerClient.connected);
}
