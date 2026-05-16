import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { readMemoryFile, writeMemoryFile, deleteMemoryFile } from "@/lib/memoryRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ agent: string; file: string }> }) {
  const { agent, file } = await params;
  const content = readMemoryFile(agent, file);
  if (content === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ name: file, content });
}

export async function PUT(req: Request, { params }: { params: Promise<{ agent: string; file: string }> }) {
  const { agent, file } = await params;
  const body = await readJson<{ content?: string }>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  try {
    writeMemoryFile(agent, file, body.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ agent: string; file: string }> }) {
  const { agent, file } = await params;
  const ok = deleteMemoryFile(agent, file);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
