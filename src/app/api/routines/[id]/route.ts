import { NextResponse } from "next/server";
import { getRoutine, updateRoutine, deleteRoutine, type RoutineInput } from "@/lib/routines/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getRoutine(id);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(r);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Partial<RoutineInput> & { paused?: boolean };
  try {
    const updated = updateRoutine(id, body);
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!deleteRoutine(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
