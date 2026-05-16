import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { listKanban, createCard, type KanbanInput } from "@/lib/kanbanRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listKanban());
}

export async function POST(req: Request) {
  const body = await readJson<Partial<KanbanInput>>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const card = createCard(body as KanbanInput);
  return NextResponse.json(card, { status: 201 });
}
