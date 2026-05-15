import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { TelegramChannelConfig, InboundContext } from "../types";

const TG = "https://api.telegram.org";

interface TgUser { id: number; username?: string; first_name?: string }
interface TgChat { id: number; type: string }
interface TgFile { file_id: string; file_unique_id: string; file_path?: string }
interface TgPhotoSize { file_id: string; file_unique_id: string; file_size?: number; width: number; height: number }
interface TgDocument { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string }
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: TgDocument;
}
interface TgUpdate { update_id: number; message?: TgMessage }
interface TgResult<T> { ok: boolean; result: T; description?: string }

function botToken(config: TelegramChannelConfig): string {
  // Prefer raw token if provided, else read from env var
  if (config.bot_token && config.bot_token.includes(":")) return config.bot_token;
  if (!config.bot_token_env) throw new Error("telegram channel needs bot_token or bot_token_env");
  const tok = process.env[config.bot_token_env];
  if (!tok) throw new Error(`env var ${config.bot_token_env} not set (paste the raw token in the form instead)`);
  return tok;
}

async function tgCall<T>(token: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${TG}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as TgResult<T>;
  if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
  return json.result;
}

async function downloadFile(token: string, fileId: string): Promise<{ name: string; path: string }> {
  const file = await tgCall<TgFile>(token, "getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("telegram: missing file_path");
  const url = `${TG}/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = path.extname(file.file_path) || ".bin";
  const local = path.join(os.tmpdir(), `orchestria-tg-${crypto.randomBytes(6).toString("hex")}${ext}`);
  fs.writeFileSync(local, buf);
  return { name: path.basename(file.file_path), path: local };
}

export function authorizeTelegramMessage(msg: TgMessage, config: TelegramChannelConfig): boolean {
  if (!config.allowed_chat_ids || config.allowed_chat_ids.length === 0) return true;
  return config.allowed_chat_ids.includes(msg.chat.id);
}

export async function buildInboundContext(
  channelName: string,
  config: TelegramChannelConfig,
  msg: TgMessage,
): Promise<InboundContext> {
  const token = botToken(config);
  const rawText = msg.text ?? msg.caption ?? "";
  const attachments: { name: string; path: string }[] = [];

  if (msg.document) {
    attachments.push(await downloadFile(token, msg.document.file_id));
  }
  if (msg.photo && msg.photo.length) {
    const largest = msg.photo[msg.photo.length - 1];
    attachments.push(await downloadFile(token, largest.file_id));
  }

  return {
    channelName,
    config,
    rawText,
    attachments,
    replyMeta: { chat_id: msg.chat.id, reply_to: msg.message_id },
  };
}

export async function sendTelegramMessage(
  config: TelegramChannelConfig,
  chatId: number,
  text: string,
  replyTo?: number,
): Promise<void> {
  const token = botToken(config);
  // Telegram caps at 4096 chars per message
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
  for (const chunk of chunks) {
    await tgCall(token, "sendMessage", {
      chat_id: chatId,
      text: chunk,
      parse_mode: "Markdown",
      reply_to_message_id: replyTo,
    });
  }
}

/** Show "typing..." in the user's Telegram client for ~5s. */
export async function sendTelegramTyping(config: TelegramChannelConfig, chatId: number): Promise<void> {
  const token = botToken(config);
  try {
    await tgCall(token, "sendChatAction", { chat_id: chatId, action: "typing" });
  } catch { /* non-critical */ }
}

/** Send an initial placeholder message; return its message_id for later edits. */
export async function sendTelegramPlaceholder(
  config: TelegramChannelConfig,
  chatId: number,
  text: string,
  replyTo?: number,
): Promise<number | null> {
  const token = botToken(config);
  try {
    const res = await tgCall<{ message_id: number }>(token, "sendMessage", {
      chat_id: chatId,
      text,
      reply_to_message_id: replyTo,
    });
    return res?.message_id ?? null;
  } catch (e) {
    console.error("[telegram] sendPlaceholder failed:", e);
    return null;
  }
}

/** Edit a previously-sent message. Silently no-ops if the new text equals the current one (Telegram errors). */
export async function editTelegramMessage(
  config: TelegramChannelConfig,
  chatId: number,
  messageId: number,
  text: string,
  parseMarkdown = false,
): Promise<void> {
  const token = botToken(config);
  // Cap at 4096
  const trimmed = text.length > 4090 ? text.slice(0, 4090) + "…" : text;
  try {
    await tgCall(token, "editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: trimmed,
      ...(parseMarkdown ? { parse_mode: "Markdown" } : {}),
    });
  } catch (e) {
    // Telegram returns 400 if the new text is identical to the previous one — ignore
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("message is not modified")) {
      console.warn("[telegram] editMessage error:", msg);
    }
  }
}

export interface TelegramPoller {
  stop: () => void;
}

export function startTelegramPolling(
  channelName: string,
  config: TelegramChannelConfig,
  onMessage: (msg: TgMessage) => Promise<void>,
): TelegramPoller {
  const token = botToken(config);
  let offset = 0;
  let alive = true;
  let inflight: AbortController | null = null;

  const loop = async () => {
    while (alive) {
      inflight = new AbortController();
      let updates: TgUpdate[] = [];
      try {
        const url = `${TG}/bot${token}/getUpdates?offset=${offset}&timeout=30`;
        const res = await fetch(url, { signal: inflight.signal });
        const json = (await res.json()) as TgResult<TgUpdate[]>;
        if (!json.ok) {
          console.error(`[telegram:${channelName}]`, json.description);
          await sleep(2000);
          continue;
        }
        updates = json.result;
      } catch (e) {
        if (!alive) break;
        console.error(`[telegram:${channelName}] poll error`, e);
        await sleep(2000);
        continue;
      }
      for (const u of updates) {
        offset = Math.max(offset, u.update_id + 1);
        if (u.message) {
          try { await onMessage(u.message); }
          catch (e) { console.error(`[telegram:${channelName}] handler error`, e); }
        }
      }
    }
  };

  void loop();
  return {
    stop: () => {
      alive = false;
      inflight?.abort();
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
