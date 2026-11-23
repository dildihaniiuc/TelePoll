import type { PollDraft } from "./types.ts";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

interface TelegramChatMember {
  status: string;
  can_post_messages?: boolean;
}

interface TelegramMessage {
  message_id: number;
  date: number;
}

export function normalizeBotToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  return trimmed.replace(/^bot(?=\d+:)/i, "");
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const token = normalizeBotToken(botToken);
  if (!token) {
    throw new Error("Telegram Bot Token is not configured.");
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || `Telegram API error (${response.status})`);
  }
  return data.result;
}

export function normalizeChannelId(rawChannelId: string): string {
  const trimmed = rawChannelId.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("https://t.me/") || trimmed.startsWith("http://t.me/")) {
    const slug = trimmed.replace(/^https?:\/\/t\.me\//, "").split("/")[0];
    return slug.startsWith("@") ? slug : `@${slug}`;
  }
  if (trimmed.startsWith("t.me/")) {
    const slug = trimmed.replace(/^t\.me\//, "").split("/")[0];
    return slug.startsWith("@") ? slug : `@${slug}`;
  }
  if (/^[a-zA-Z][a-zA-Z0-9_]{3,}$/.test(trimmed)) {
    return `@${trimmed}`;
  }
  return trimmed;
}

export async function verifyTelegramConnection(
  botToken: string,
  rawChannelId: string
): Promise<{
  botUsername: string;
  channelId: string;
  channelTitle: string;
  channelType: string;
}> {
  const me = await callTelegramApi<TelegramUser>(botToken, "getMe");
  const channelId = normalizeChannelId(rawChannelId);
  if (!channelId) {
    throw new Error("Channel ID or @username is required.");
  }

  const chat = await callTelegramApi<TelegramChat>(botToken, "getChat", {
    chat_id: channelId,
  });

  if (chat.type === "channel" || chat.type === "supergroup") {
    try {
      const member = await callTelegramApi<TelegramChatMember>(
        botToken,
        "getChatMember",
        { chat_id: channelId, user_id: me.id }
      );
      if (member.status !== "administrator" && member.status !== "creator") {
        throw new Error(
          `@${me.username || me.first_name} is not an administrator in "${chat.title || channelId}". Please add the bot as a channel Admin with Post Messages permission.`
        );
      }
      if (chat.type === "channel" && member.can_post_messages === false) {
        throw new Error(
          `@${me.username || me.first_name} needs "Post Messages" permission in "${chat.title || channelId}".`
        );
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("not an administrator") ||
          err.message.includes("Post Messages"))
      ) {
        throw err;
      }
    }
  }

  return {
    botUsername: me.username || me.first_name,
    channelId,
    channelTitle: chat.title || chat.username || String(chat.id),
    channelType: chat.type,
  };
}

export async function verifyBotAndUserAdminForTarget(
  botToken: string,
  rawTarget: string,
  requesterUserId?: number
): Promise<
  | { ok: true; channelId: string; channelTitle: string; channelType: string }
  | { ok: false; error: string }
> {
  const channelId = normalizeChannelId(rawTarget);
  if (!channelId) {
    return {
      ok: false,
      error: "অনুগ্রহ করে চ্যানেল বা গ্রুপের @username অথবা আইডি উল্লেখ করুন।",
    };
  }

  try {
    const me = await callTelegramApi<TelegramUser>(botToken, "getMe");
    const chat = await callTelegramApi<TelegramChat>(botToken, "getChat", {
      chat_id: channelId,
    });
    const title = chat.title || chat.username || String(chat.id);

    // 1. Check Bot's own admin / post permission
    if (chat.type === "channel" || chat.type === "supergroup") {
      const botMember = await callTelegramApi<TelegramChatMember>(
        botToken,
        "getChatMember",
        { chat_id: channelId, user_id: me.id }
      );
      if (
        botMember.status !== "administrator" &&
        botMember.status !== "creator"
      ) {
        return {
          ok: false,
          error: `⚠️ বট @${me.username || me.first_name} এখনও "${title}"-এর এডমিন নয়। আগে বটটিকে সেখানে Admin হিসেবে যোগ করুন।`,
        };
      }
      if (chat.type === "channel" && botMember.can_post_messages === false) {
        return {
          ok: false,
          error: `⚠️ "${title}" চ্যানেলে বট @${me.username || me.first_name}-এর Post Messages অনুমতি নেই।`,
        };
      }
    }

    // 2. Check the requesting user's admin permission in that channel/group
    if (requesterUserId) {
      try {
        const userMember = await callTelegramApi<TelegramChatMember>(
          botToken,
          "getChatMember",
          { chat_id: channelId, user_id: requesterUserId }
        );
        if (
          userMember.status !== "administrator" &&
          userMember.status !== "creator"
        ) {
          return {
            ok: false,
            error: `⚠️ আপনি "${title}" (${channelId})-এর এডমিন নন, তাই এজেন্ট সেখানে পোস্ট করতে পারবে না।`,
          };
        }
        if (
          chat.type === "channel" &&
          userMember.can_post_messages === false
        ) {
          return {
            ok: false,
            error: `⚠️ "${title}" চ্যানেলে আপনার মেসেজ পোস্ট করার এডমিন অনুমতি নেই।`,
          };
        }
      } catch {
        return {
          ok: false,
          error: `⚠️ "${title}" চ্যানেলে আপনার এডমিন স্ট্যাটাস যাচাই করা যায়নি। নিশ্চিত করুন আপনি ওই চ্যানেলের এডমিন।`,
        };
      }
    }

    const preferredId = chat.username ? `@${chat.username}` : String(chat.id);
    return {
      ok: true,
      channelId: preferredId,
      channelTitle: title,
      channelType: chat.type,
    };
  } catch (err) {
    return {
      ok: false,
      error: `⚠️ "${channelId}" চ্যানেল/গ্রুপে অ্যাক্সেস পাওয়া যায়নি: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    };
  }
}

export async function postTextToTelegram(
  botToken: string,
  rawChannelId: string,
  text: string
): Promise<{ messageId: number }> {
  const channelId = normalizeChannelId(rawChannelId);
  if (!channelId) {
    throw new Error("Telegram channel ID is missing.");
  }
  const cleanText = text.trim().slice(0, 4096);
  if (!cleanText) {
    throw new Error("Post text cannot be empty.");
  }

  const result = await callTelegramApi<TelegramMessage>(botToken, "sendMessage", {
    chat_id: channelId,
    text: cleanText,
  });
  return { messageId: result.message_id };
}

export async function postPhotoToTelegram(
  botToken: string,
  rawChannelId: string,
  imageBase64: string,
  mimeType: string,
  caption?: string
): Promise<{ messageId: number }> {
  const channelId = normalizeChannelId(rawChannelId);
  if (!channelId) {
    throw new Error("Telegram channel ID is missing.");
  }
  const token = normalizeBotToken(botToken);
  if (!token) {
    throw new Error("Telegram Bot Token is not configured.");
  }
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

  const form = new FormData();
  form.append("chat_id", channelId);
  form.append(
    "photo",
    new Blob([buffer], { type: mimeType || "image/jpeg" }),
    `photo.${ext}`
  );
  if (caption && caption.trim()) {
    form.append("caption", caption.trim().slice(0, 1024));
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  const data = (await response.json()) as TelegramApiResponse<TelegramMessage>;
  if (!response.ok || !data.ok || data.result === undefined) {
    throw new Error(data.description || `Telegram API error (${response.status})`);
  }
  return { messageId: data.result.message_id };
}

export async function postPollToTelegram(
  botToken: string,
  rawChannelId: string,
  poll: PollDraft
): Promise<{ messageId: number }> {
  if (poll.type === "text") {
    return postTextToTelegram(
      botToken,
      rawChannelId,
      poll.postText || poll.question
    );
  }
  if (poll.type === "image") {
    if (!poll.imageBase64) {
      throw new Error("Image data is missing for this image post.");
    }
    return postPhotoToTelegram(
      botToken,
      rawChannelId,
      poll.imageBase64,
      poll.imageMimeType || "image/jpeg",
      poll.postText || poll.caption || ""
    );
  }

  const channelId = normalizeChannelId(rawChannelId);
  if (!channelId) {
    throw new Error("Telegram channel ID is missing.");
  }

  if (poll.caption && poll.caption.trim().length > 0) {
    await callTelegramApi<TelegramMessage>(botToken, "sendMessage", {
      chat_id: channelId,
      text: poll.caption.trim().slice(0, 4096),
    });
  }

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

  const payload: Record<string, unknown> = {
    chat_id: channelId,
    question: sanitizedQuestion,
    options: sanitizedOptions.map((text) => ({ text })),
    is_anonymous: poll.isAnonymous,
    type: poll.type,
  };

  if (poll.type === "regular") {
    payload.allows_multiple_answers = Boolean(poll.allowsMultipleAnswers);
  } else if (poll.type === "quiz") {
    const safeIdx =
      typeof poll.correctOptionIndex === "number" &&
      poll.correctOptionIndex >= 0 &&
      poll.correctOptionIndex < sanitizedOptions.length
        ? poll.correctOptionIndex
        : 0;
    payload.correct_option_id = safeIdx;
    if (poll.explanation && poll.explanation.trim().length > 0) {
      payload.explanation = poll.explanation.trim().slice(0, 200);
    }
  }

  try {
    const result = await callTelegramApi<TelegramMessage>(
      botToken,
      "sendPoll",
      payload
    );
    return { messageId: result.message_id };
  } catch (err) {
    // Channels strictly require anonymous polls; retry automatically with is_anonymous: true if needed
    if (
      err instanceof Error &&
      err.message.includes("non-anonymous polls can't be sent to channels") &&
      payload.is_anonymous === false
    ) {
      const retryResult = await callTelegramApi<TelegramMessage>(
        botToken,
        "sendPoll",
        { ...payload, is_anonymous: true }
      );
      return { messageId: retryResult.message_id };
    }
    throw err;
  }
}
