import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { getDb } from "@/lib/db";
import { registry } from "@/lib/orchestrator/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  agent?: string;
  input?: string;
  source_channel?: string;
  source_meta?: Record<string, unknown>;
}

interface MissionRow {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  start_ts: number;
  end_ts: number | null;
  source_channel: string | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const agent = searchParams.get("agent");
  const sourceChannel = searchParams.get("source_channel");

  const where: string[] = ["(kind IS NULL OR kind != 'chat')"];
  const params: unknown[] = [];
  if (status) { where.push("status = ?"); params.push(status); }
  if (agent) { where.push("agent_id = ?"); params.push(agent); }
  if (sourceChannel) { where.push("source_channel = ?"); params.push(sourceChannel); }

  const sql =
    "SELECT id, agent_id, title, status, start_ts, end_ts, source_channel FROM missions" +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    " ORDER BY start_ts DESC LIMIT 100";
  const rows = getDb().prepare(sql).all(...params) as MissionRow[];
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await readJson<PostBody>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.agent || !body.input) {
    return NextResponse.json({ error: "agent and input required" }, { status: 400 });
  }
  const agent = registry.spawn(body.agent, body.input, {
    sourceChannel: body.source_channel,
    sourceMeta: body.source_meta,
    kind: "mission",
  });
  return NextResponse.json(
    { mission_id: agent.missionId, agent: agent.agentName, status: agent.status },
    { status: 201 },
  );
}
