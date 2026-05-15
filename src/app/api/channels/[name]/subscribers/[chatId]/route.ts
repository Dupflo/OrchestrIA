import { NextResponse } from "next/server";
import { removeSubscriber } from "@/lib/channels/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; chatId: string }> },
) {
  const { name, chatId } = await params;
  const id = Number(chatId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid chat_id" }, { status: 400 });
  const removed = removeSubscriber(name, id);
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
