import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { updateCard, deleteCard, type KanbanInput } from "@/lib/kanbanRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<Partial<KanbanInput>>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  const card = updateCard(id, body);
  if (!card) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(card);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteCard(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
