import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { registry } from "@/lib/orchestrator/registry";
import type { SendRequest } from "@/lib/orchestrator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Partial<SendRequest>>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (typeof body.input !== "string") {
    return NextResponse.json({ error: "input (string) required" }, { status: 400 });
  }
  const agent = registry.get(id);
  if (!agent) {
    return NextResponse.json({ error: "no live agent for that mission" }, { status: 404 });
  }
  agent.send(body.input);
  return NextResponse.json({ ok: true });
}
