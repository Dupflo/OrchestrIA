import { NextResponse } from "next/server";
import { listRoutines, createRoutine, type RoutineInput } from "@/lib/routines/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listRoutines());
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<RoutineInput>;
  if (!body.id || !body.name || !body.cron_expr || !body.agent_id || !body.prompt) {
    return NextResponse.json({ error: "id, name, cron_expr, agent_id, prompt required" }, { status: 400 });
  }
  try {
    return NextResponse.json(createRoutine(body as RoutineInput), { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg.includes("already exists") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
