import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { requireRemoteAuth, logRemoteCall } from "@/lib/remote/auth";
import { registry } from "@/lib/orchestrator/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = requireRemoteAuth(req);
  if (!auth.ok) return auth.response;

  const body = await readJson<{ agent?: string; input?: string }>(req);
  if (!body || !body.agent || !body.input) {
    logRemoteCall(auth.session, req, 400);
    return NextResponse.json({ error: "agent and input required" }, { status: 400 });
  }

  const agent = registry.spawn(body.agent, body.input);
  logRemoteCall(auth.session, req, 201);
  return NextResponse.json(
    {
      mission_id: agent.missionId,
      agent: agent.agentName,
      status: agent.status,
      started_at: agent.startedAt,
    },
    { status: 201 },
  );
}
