import { NextResponse } from "next/server";
import { listKanban, createCard, type KanbanInput } from "@/lib/kanbanRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listKanban());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<KanbanInput>;
  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const card = createCard(body as KanbanInput);
  return NextResponse.json(card, { status: 201 });
}
