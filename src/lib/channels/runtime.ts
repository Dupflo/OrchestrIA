import { listChannels } from "./config";
import {
  startTelegramPolling, type TelegramPoller,
  authorizeTelegramMessage, buildInboundContext,
  sendTelegramTyping, sendTelegramPlaceholder, editTelegramMessage,
} from "./handlers/telegram";
import { resolveRoute } from "./router";
import { registry } from "../orchestrator/registry";
import { dispatchMissionReply } from "./reply";
import { recordSubscriber } from "./subscribers";
import { getDb } from "../db";
import type { ChannelConfig, TelegramChannelConfig } from "./types";
import type { ClaudeEvent } from "../orchestrator/types";

/**
 * Look up the most recent Claude session ID for a given (agent, channel, chat_id)
 * combo so we can resume the conversation thread instead of starting fresh.
 */
function lastSessionForChat(agentName: string, channelName: string, chatId: number): string | undefined {
  const rows = getDb().prepare(
    `SELECT claude_session_id, source_meta
       FROM missions
      WHERE agent_id = ?
        AND source_channel = ?
        AND claude_session_id IS NOT NULL
      ORDER BY start_ts DESC
      LIMIT 50`
  ).all(agentName, channelName) as { claude_session_id: string; source_meta: string | null }[];
  for (const r of rows) {
    try {
      const m = r.source_meta ? JSON.parse(r.source_meta) as { chat_id?: number } : null;
      if (m?.chat_id === chatId) return r.claude_session_id;
    } catch { /* ignore parse errors */ }
  }
  return undefined;
}

interface RunningChannel {
  name: string;
  config: ChannelConfig;
  poller?: TelegramPoller;
}

const g = globalThis as {
  __mosChannels?: Map<string, RunningChannel>;
  __mosChannelsCompletionUnsub?: () => void;
};

function getMap(): Map<string, RunningChannel> {
  if (!g.__mosChannels) g.__mosChannels = new Map();
  return g.__mosChannels;
}

function ensureCompletionHookWired(): void {
  if (g.__mosChannelsCompletionUnsub) return;
  g.__mosChannelsCompletionUnsub = registry.onMissionComplete((info) => {
    dispatchMissionReply(info).catch((e) => console.error("[channels] reply failed", e));
  });
}

export function startAllChannels(): { started: string[]; errors: { name: string; error: string }[] } {
  ensureCompletionHookWired();
  const map = getMap();
  const started: string[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const { name, config } of listChannels()) {
    if (map.has(name)) continue;
    try {
      if (config.type === "telegram") {
        const running: RunningChannel = { name, config };
        running.poller = startTelegramPolling(name, config, async (msg) => {
          if (!authorizeTelegramMessage(msg, config)) {
            console.warn(`[telegram:${name}] rejected message from chat ${msg.chat.id}`);
            return;
          }
          // Auto-record the chat as a known subscriber so routines can deliver to it later
          recordSubscriber(name, {
            chat_id: msg.chat.id,
            username: msg.from?.username,
            first_name: msg.from?.first_name,
          });
          const ctx = await buildInboundContext(name, config, msg);
          const route = resolveRoute(ctx.rawText, config);
          const input = composeInput(route.cleanedInput, ctx.attachments);
          await streamTelegramReply(name, config as TelegramChannelConfig, ctx, route.agent, input);
        });
        map.set(name, running);
        started.push(name);
      } else {
        // webhook + discord + imessage don't poll yet — inbound is HTTP-driven (or noop)
        map.set(name, { name, config });
        started.push(name);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[channels] failed to start ${name}:`, msg);
      errors.push({ name, error: msg });
    }
  }

  return { started, errors };
}

export function stopAllChannels(): void {
  const map = getMap();
  for (const r of map.values()) r.poller?.stop();
  map.clear();
}

/** Stop a single running channel (idempotent). Returns true if it was running. */
export function stopChannel(name: string): boolean {
  const map = getMap();
  const r = map.get(name);
  if (!r) return false;
  r.poller?.stop();
  map.delete(name);
  return true;
}

export function listRunningChannels(): { name: string; type: ChannelConfig["type"]; polling: boolean }[] {
  return Array.from(getMap().values()).map((r) => ({
    name: r.name,
    type: r.config.type,
    polling: !!r.poller,
  }));
}

export function composeInput(text: string, attachments?: { name: string; path: string }[]): string {
  if (!attachments || attachments.length === 0) return text;
  const lines = [text, "", "Attachments:"];
  for (const a of attachments) lines.push(`- ${a.name} → ${a.path}`);
  return lines.join("\n");
}

// ─── Streaming reply for Telegram ────────────────────────────────────────────

/**
 * Sends a placeholder Telegram message immediately, then edits it as the
 * agent produces text. Provides a "live typing" feel rather than waiting
 * for the whole mission to finish.
 */
async function streamTelegramReply(
  channelName: string,
  config: TelegramChannelConfig,
  ctx: { rawText: string; replyMeta: Record<string, unknown> },
  agentName: string,
  missionInput: string,
): Promise<void> {
  const chatId = Number(ctx.replyMeta.chat_id);
  const replyTo = typeof ctx.replyMeta.reply_to === "number" ? ctx.replyMeta.reply_to : undefined;
  if (!Number.isFinite(chatId)) {
    // Fallback: no chat_id → just spawn without streaming
    registry.spawn(agentName, missionInput, { sourceChannel: channelName, sourceMeta: ctx.replyMeta, kind: "channel" });
    return;
  }

  // Show "typing…" indicator in user's client
  void sendTelegramTyping(config, chatId);

  // Drop a placeholder we'll keep editing
  const placeholderId = await sendTelegramPlaceholder(config, chatId, "🤔 …", replyTo);

  // Resume the previous Claude session for this chat so the agent keeps memory of the conversation
  const resumeSessionId = lastSessionForChat(agentName, channelName, chatId);

  // If we couldn't post the placeholder, fall back to the legacy end-of-mission reply
  if (placeholderId === null) {
    registry.spawn(agentName, missionInput, {
      sourceChannel: channelName, sourceMeta: ctx.replyMeta, kind: "channel", resumeSessionId,
    });
    return;
  }

  // Mark sourceMeta so dispatchMissionReply knows streaming already happened
  const sourceMeta = { ...ctx.replyMeta, placeholder_message_id: placeholderId, streamed: true };
  const agent = registry.spawn(agentName, missionInput, {
    sourceChannel: channelName,
    sourceMeta,
    kind: "channel",
    resumeSessionId,
  });

  // ── Streaming state ────────────────────────────────────────────────
  let buffer = "";
  let lastSent = "";
  let pendingFlush: NodeJS.Timeout | null = null;
  let lastFlushAt = 0;
  let inflight = false;
  const MIN_INTERVAL = 1500; // ms — Telegram rate-limit is ~1 edit/sec per chat

  const flush = async () => {
    pendingFlush = null;
    if (inflight) return;
    const text = buffer.trim() || "🤔 …";
    if (text === lastSent) return;
    inflight = true;
    lastFlushAt = Date.now();
    try {
      await editTelegramMessage(config, chatId, placeholderId, text + " ▍");
      lastSent = text;
    } finally {
      inflight = false;
    }
  };

  const scheduleFlush = () => {
    if (pendingFlush) return;
    const elapsed = Date.now() - lastFlushAt;
    const delay = Math.max(0, MIN_INTERVAL - elapsed);
    pendingFlush = setTimeout(flush, delay);
  };

  // Extract text from a streaming event (assistant or result)
  const extract = (ev: ClaudeEvent): string | null => {
    if (ev.type === "result") {
      const p = ev.payload as { result?: string };
      return typeof p.result === "string" ? p.result : null;
    }
    if (ev.type === "assistant") {
      const p = ev.payload as { message?: { content?: Array<{ type?: string; text?: string }> } };
      const parts: string[] = [];
      for (const c of p.message?.content ?? []) {
        if (c?.type === "text" && typeof c.text === "string") parts.push(c.text);
      }
      return parts.length ? parts.join("") : null;
    }
    return null;
  };

  agent.on("event", (ev: ClaudeEvent) => {
    const txt = extract(ev);
    if (!txt) return;
    // `result` events contain the *full* final text; assistant chunks are incremental
    if (ev.type === "result") buffer = txt;
    else buffer = (buffer ? buffer + "\n" : "") + txt;
    scheduleFlush();
  });

  agent.on("done", async () => {
    if (pendingFlush) { clearTimeout(pendingFlush); pendingFlush = null; }
    // Final edit without the cursor mark; dispatchMissionReply will handle no-op since `streamed: true`
    const finalText = buffer.trim() || "✅ done (no text output)";
    try {
      await editTelegramMessage(config, chatId, placeholderId, finalText);
    } catch (e) {
      console.warn("[telegram] final edit failed:", e);
    }
  });
}
