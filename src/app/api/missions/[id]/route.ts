import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { safeJson } from "@/lib/api/json";
import { registry } from "@/lib/orchestrator/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MissionRow {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  start_ts: number;
  end_ts: number | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

interface EventRow {
  id: number;
  ts: number;
  kind: string;
  body: string;
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const mission = db.prepare("SELECT id FROM missions WHERE id = ?").get(id);
  if (!mission) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Stop the live agent if still running
  const agent = registry.get(id);
  if (agent) agent.kill?.();

  db.prepare("DELETE FROM events WHERE mission_id = ?").run(id);
  db.prepare("DELETE FROM missions WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const mission = db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as MissionRow | undefined;
  if (!mission) {
    return NextResponse.json({ error: "mission not found" }, { status: 404 });
  }

  const rows = db
    .prepare("SELECT id, ts, kind, body FROM events WHERE mission_id = ? ORDER BY id ASC")
    .all(id) as EventRow[];

  const events = rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    kind: r.kind,
    payload: safeJson(r.body, null),
  }));

  return NextResponse.json({
    mission,
    events,
    live: !!registry.get(id),
  });
}
