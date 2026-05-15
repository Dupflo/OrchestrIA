import { NextResponse } from "next/server";
import { tryLoadChannelConfig } from "@/lib/channels/config";
import { resolveRoute } from "@/lib/channels/router";
import { verifyWebhookSignature } from "@/lib/channels/handlers/webhook";
import { authorizeTelegramMessage, buildInboundContext } from "@/lib/channels/handlers/telegram";
import { registry } from "@/lib/orchestrator/registry";
import { composeInput } from "@/lib/channels/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramInboundBody {
  message?: {
    chat: { id: number; type: string };
    message_id: number;
    text?: string;
    caption?: string;
  };
}

interface WebhookInboundBody {
  text?: string;
  reply_url?: string;
  meta?: Record<string, unknown>;
}

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const config = tryLoadChannelConfig(name);
  if (!config) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  const rawBody = await req.text();

  if (config.type === "webhook") {
    const sigHeader = req.headers.get(config.signature_header ?? "x-orchestria-signature");
    if (!verifyWebhookSignature(rawBody, config, sigHeader)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
    let parsed: WebhookInboundBody;
    try { parsed = JSON.parse(rawBody) as WebhookInboundBody; }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    if (!parsed.text) return NextResponse.json({ error: "text required" }, { status: 400 });

    const route = resolveRoute(parsed.text, config);
    const replyMeta: Record<string, unknown> = { ...(parsed.meta ?? {}) };
    if (parsed.reply_url) replyMeta.reply_url = parsed.reply_url;

    queueMicrotask(() => {
      registry.spawn(route.agent, route.cleanedInput, { sourceChannel: name, sourceMeta: replyMeta });
    });
    return NextResponse.json({ ok: true, agent: route.agent }, { status: 202 });
  }

  if (config.type === "telegram") {
    let body: TelegramInboundBody;
    try { body = JSON.parse(rawBody) as TelegramInboundBody; }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    if (!body.message) return NextResponse.json({ ok: true, skipped: true });
    if (!authorizeTelegramMessage(body.message, config)) {
      return NextResponse.json({ error: "chat_not_allowed" }, { status: 403 });
    }
    const ctx = await buildInboundContext(name, config, body.message);
    const route = resolveRoute(ctx.rawText, config);
    const input = composeInput(route.cleanedInput, ctx.attachments);
    queueMicrotask(() => {
      registry.spawn(route.agent, input, { sourceChannel: name, sourceMeta: ctx.replyMeta });
    });
    return NextResponse.json({ ok: true, agent: route.agent }, { status: 202 });
  }

  return NextResponse.json({ error: "channel_type_not_supported", type: config.type }, { status: 501 });
}
