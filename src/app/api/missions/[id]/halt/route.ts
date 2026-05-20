import { NextResponse } from "next/server";
import { registry } from "@/lib/orchestrator/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Halt a running mission without deleting it. The registry's `done` listener
 * still fires (the PTY exits with a non-zero code), so the mission row gets
 * a "failed" status and a MissionComplete event is broadcast on SSE — UIs
 * watching the stream finalize their state without any extra polling.
 *
 * Distinct from `DELETE /api/missions/[id]`, which also wipes the history.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = registry.get(id);
  if (!agent) {
    return NextResponse.json({ error: "mission not running" }, { status: 404 });
  }
  agent.kill();
  return NextResponse.json({ halted: true, missionId: id });
}
