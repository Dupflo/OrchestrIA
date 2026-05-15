import { NextResponse } from "next/server";
import { getRoutine, markRoutineFired } from "@/lib/routines/repo";
import { registry } from "@/lib/orchestrator/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getRoutine(id);
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const mission = r.skill_ref ? `${r.skill_ref}\n\n${r.prompt}` : r.prompt;
  try {
    const agent = registry.spawn(r.agent_id, mission, { kind: "mission", routineId: r.id, skipKanbanCard: true });
    markRoutineFired(r.id, "running");
    return NextResponse.json({ mission_id: agent.missionId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
