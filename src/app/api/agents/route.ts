import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { listAgentConfigs, listNativeAgents, listClaudeAgents, createAgent, type CreateAgentInput } from "@/lib/agentsRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includeNative = searchParams.get("native") === "1";
  const mos = listAgentConfigs();
  if (!includeNative) return NextResponse.json(mos);
  return NextResponse.json([...mos, ...listClaudeAgents(), ...listNativeAgents()]);
}

export async function POST(req: Request) {
  const body = await readJson<Partial<CreateAgentInput>>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const config = createAgent(body as CreateAgentInput);
    return NextResponse.json(config, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
