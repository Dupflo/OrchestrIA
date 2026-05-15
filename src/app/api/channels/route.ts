import { NextResponse } from "next/server";
import { listChannels } from "@/lib/channels/config";
import { listRunningChannels, startAllChannels } from "@/lib/channels/runtime";
import { listSubscribers } from "@/lib/channels/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = listChannels();
  const running = listRunningChannels();
  const subscribers: Record<string, ReturnType<typeof listSubscribers>> = {};
  for (const c of configured) subscribers[c.name] = listSubscribers(c.name);
  return NextResponse.json({ configured, running, subscribers });
}

export async function POST() {
  const { started } = startAllChannels();
  return NextResponse.json({ started, running: listRunningChannels() });
}
