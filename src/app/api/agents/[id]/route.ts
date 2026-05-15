import { NextResponse } from "next/server";
import { getAgentConfig, deleteAgent, updateAgent, type UpdateAgentInput } from "@/lib/agentsRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cfg = getAgentConfig(id);
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(cfg);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as UpdateAgentInput;
  const updated = updateAgent(id, body);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const removed = deleteAgent(id);
  if (!removed) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
