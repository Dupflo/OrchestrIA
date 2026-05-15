import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { CHANNELS_DIR, tryLoadChannelConfig } from "@/lib/channels/config";
import { stopChannel, startAllChannels } from "@/lib/channels/runtime";
import type { ChannelConfig } from "@/lib/channels/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

function fileFor(name: string) {
  return path.join(CHANNELS_DIR, `${name}.json`);
}

// GET — read one channel
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cfg = tryLoadChannelConfig(name);
  if (!cfg) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ name, config: cfg });
}

// PUT — create or update one channel
export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: "name must be alphanumeric / _ / -" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as ChannelConfig | null;
  if (!body || typeof body !== "object" || !body.type) {
    return NextResponse.json({ error: "body must include type" }, { status: 400 });
  }
  if (!["telegram", "webhook", "discord"].includes(body.type)) {
    return NextResponse.json({ error: `unsupported type: ${body.type}` }, { status: 400 });
  }
  if (!body.default_agent || typeof body.default_agent !== "string") {
    return NextResponse.json({ error: "default_agent required" }, { status: 400 });
  }

  fs.mkdirSync(CHANNELS_DIR, { recursive: true });
  fs.writeFileSync(fileFor(name), JSON.stringify(body, null, 2) + "\n");

  // Stop the running instance (if any) so the new config takes effect on next start
  stopChannel(name);
  const { started, errors } = startAllChannels();
  const err = errors.find((e) => e.name === name);
  if (err) {
    // Config was saved, but the poller failed to start — surface the reason
    return NextResponse.json({ name, config: body, started: false, error: err.error }, { status: 400 });
  }
  return NextResponse.json({ name, config: body, started: started.includes(name) });
}

// DELETE — remove channel
export async function DELETE(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const file = fileFor(name);
  if (!fs.existsSync(file)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  stopChannel(name);
  fs.unlinkSync(file);
  return NextResponse.json({ ok: true });
}
