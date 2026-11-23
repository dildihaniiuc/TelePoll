import {
  buildTelegramPostLink,
  formatChannelIndexPost,
  normalizeKeywordList,
  type IndexedChannelMessage,
} from "./channelIndexer.ts";
import { readStore, updateConfig } from "./store.ts";
import { processTelegramAgentMessage } from "./telegramAgentBrain.ts";
import {
  normalizeChannelId,
  postPollToTelegram,
  verifyBotAndUserAdminForTarget,
} from "./telegram.ts";
import type { PollDraft, SourceKind } from "./types.ts";

let botPollingTimer: ReturnType<typeof setTimeout> | null = null;
let botPollingActive = false;
let lastUpdateOffset = 0;

interface TgBotUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id?: number; is_bot?: boolean; first_name?: string };
    chat: { id: number; type: string; title?: string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string };
  };
}

async function downloadBotFileAsBase64(
  botToken: string,
  fileId: string
): Promise<string> {
  const infoRes = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
      fileId
    )}`
  );
  const info = (await infoRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!info.ok || !info.result?.file_path) {
    throw new Error("Could not fetch file path from Telegram.");
  }

  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${botToken}/${info.result.file_path}`
  );
  const buf = Buffer.from(await fileRes.arrayBuffer());
  return buf.toString("base64");
}

async function sendBotMessage(
  botToken: string,
  chatId: number | string,
  text: string
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
    }),
  });
}

async function pollOnce(): Promise<void> {
  if (!botPollingActive) return;
  const store = readStore();
  const token = store.config.botToken.trim();

  if (
    !token ||
    store.config.authMode !== "bot" ||
    !store.config.agentListenerEnabled
  ) {
    botPollingActive = false;
    return;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateOffset}&timeout=8&allowed_updates=${encodeURIComponent(
        JSON.stringify(["message"])
      )}`
    );
    const data = (await res.json()) as { ok: boolean; result?: TgBotUpdate[] };

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateOffset = Math.max(lastUpdateOffset, update.update_id + 1);
        const msg = update.message;
        if (!msg || msg.from?.is_bot) continue;

        const chatIdStr = String(msg.chat.id);
        const rawText = (msg.text || msg.caption || "").trim();

        // Allow /start inside a group to bind that group as the control group automatically
        if (rawText.startsWith("/start")) {
          if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
            updateConfig({
              controlGroupId: chatIdStr,
              controlGroupTitle: msg.chat.title || chatIdStr,
            });
            await sendBotMessage(
              token,
              chatIdStr,
              `✅ হ্যালো! আমি এই গ্রুপে (${msg.chat.title || chatIdStr}) আপনার পার্সোনাল AI এজেন্ট হিসেবে যুক্ত হয়েছি। এখন টেক্সট, ছবি বা পিডিএফ পাঠিয়ে পোল, ছবি পোস্ট, টেক্সট পোস্ট তৈরি অথবা কিওয়ার্ড দিয়ে চ্যানেল ইনডেক্সিং করতে বলুন।`
            );
            continue;
          }
        }

        const controlGroup = (store.config.controlGroupId || "").trim();
        if (controlGroup && chatIdStr !== controlGroup) {
          continue;
        }
        if (!controlGroup && msg.chat.type !== "private") {
          continue;
        }

        let userText = rawText;
        if (store.config.agentTriggerMode === "prefix") {
          const match = rawText.match(/^(\/ai|\/agent|!ai|@agent|agent:)\s*/i);
          if (!match) continue;
          userText = rawText.slice(match[0].length).trim();
        }

        if (!userText && !msg.photo && !msg.document) continue;

        let attachedFile:
          | {
              name: string;
              mimeType: string;
              dataBase64: string;
              sourceKind: SourceKind;
            }
          | undefined;

        if (msg.photo && msg.photo.length > 0) {
          const largest = msg.photo[msg.photo.length - 1];
          const b64 = await downloadBotFileAsBase64(token, largest.file_id);
          attachedFile = {
            name: "telegram_photo.jpg",
            mimeType: "image/jpeg",
            dataBase64: b64,
            sourceKind: "image",
          };
        } else if (msg.document) {
          const mime = msg.document.mime_type || "";
          const name = msg.document.file_name || "document";
          if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
            const b64 = await downloadBotFileAsBase64(token, msg.document.file_id);
            attachedFile = {
              name,
              mimeType: "application/pdf",
              dataBase64: b64,
              sourceKind: "pdf",
            };
          } else if (mime.startsWith("image/")) {
            const b64 = await downloadBotFileAsBase64(token, msg.document.file_id);
            attachedFile = {
              name,
              mimeType: mime,
              dataBase64: b64,
              sourceKind: "image",
            };
          }
        }

        await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: msg.chat.id, action: "typing" }),
        }).catch(() => {});

        try {
          await processTelegramAgentMessage({
            chatId: chatIdStr,
            userText,
            file: attachedFile,
            dispatchPollFn: async (chId, poll) => {
              const target = chId || store.config.channelId;
              const { messageId } = await postPollToTelegram(token, target, poll);
              return { messageId, channelUsed: target };
            },
            sendReplyTextFn: async (reply) => {
              await sendBotMessage(token, msg.chat.id, reply);
            },
            sendPreviewPollFn: async (poll: PollDraft) => {
              await postPollToTelegram(token, chatIdStr, {
                ...poll,
                isAnonymous: true,
              });
            },
            resolveAndVerifyChannelFn: async (identifier: string) =>
              verifyBotAndUserAdminForTarget(token, identifier, msg.from?.id),
            indexChannelFn: async (targetCh: string, keywords: string[]) => {
              const latest = readStore();
              const normTarget = normalizeChannelId(
                targetCh || latest.config.channelId || ""
              );
              if (!normTarget) {
                return {
                  ok: false,
                  error:
                    "⚠️ ইনডেক্স করার জন্য কোনো চ্যানেল নির্বাচন করা হয়নি।",
                };
              }
              const items: IndexedChannelMessage[] = [];
              for (const job of latest.jobs) {
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
                channelTitle: latest.config.channelTitle || normTarget,
                channelId: normTarget,
                channelUsername: normTarget.startsWith("@")
                  ? normTarget.slice(1)
                  : undefined,
                keywords: normalizeKeywordList(keywords),
                items,
                lang: latest.config.defaultLanguage === "en" ? "en" : "bn",
              });

              const botNote =
                items.length === 0
                  ? "\n\nℹ️ বট মোডে শুধুমাত্র এই অ্যাপ থেকে পোস্ট করা মেসেজগুলো ইনডেক্স করা যায়। সম্পূর্ণ চ্যানেল হিস্ট্রি সার্চ করতে Direct Telegram Account মোড ব্যবহার করুন।"
                  : "";

              return {
                ok: true,
                channelId: normTarget,
                channelTitle: latest.config.channelTitle || normTarget,
                indexText: `${formatted.indexText}${botNote}`,
                matchedCount: formatted.matchedCount,
              };
            },
          });
        } catch (err) {
          await sendBotMessage(
            token,
            msg.chat.id,
            `⚠️ ${err instanceof Error ? err.message : "Could not process request."}`
          );
        }
      }
    }
  } catch {
    // Ignore transient network errors and continue polling
  }

  if (botPollingActive) {
    botPollingTimer = setTimeout(() => {
      void pollOnce();
    }, 1000);
  }
}

export function startBotGroupListener(): void {
  if (botPollingActive) return;
  botPollingActive = true;
  void pollOnce();
}

export function stopBotGroupListener(): void {
  botPollingActive = false;
  if (botPollingTimer) {
    clearTimeout(botPollingTimer);
    botPollingTimer = null;
  }
}

export function isBotListenerActive(): boolean {
  return botPollingActive;
}
