import { NextResponse } from "next/server";
import { readJson } from "@/lib/api/json";
import { execSync } from "child_process";
import { registry } from "@/lib/orchestrator/registry";
import type { SpawnRequest } from "@/lib/orchestrator/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function claudeOnPath(): { ok: boolean; path?: string } {
  try {
    const p = execSync("command -v claude", { encoding: "utf8" }).trim();
    return p ? { ok: true, path: p } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function explainSpawnError(e: unknown): { status: number; message: string; hint?: string } {
  const msg = e instanceof Error ? e.message : String(e);

  if (msg.includes("not found") && msg.includes("config.json")) {
    return {
      status: 404,
      message: msg,
      hint: "Create the agent first via the Agents page or `.orchestria/agents/<name>/config.json`.",
    };
  }
  if (msg.includes("ENOENT") && msg.includes("posix_spawn")) {
    return {
      status: 503,
      message: "could not spawn `claude` CLI",
      hint: "Install Claude Code and make sure `which claude` works in your shell.",
    };
  }
  if (msg.includes("ENOENT")) {
    return { status: 500, message: msg, hint: "A required file is missing." };
  }
  return { status: 500, message: msg };
}

export async function POST(req: Request) {
  const body = await readJson<Partial<
    SpawnRequest & {
      resume_session_id?: string;
      kind?: import("@/lib/orchestrator/registry").SpawnKind;
      source_meta?: Record<string, unknown>;
      source_channel?: string;
    }
  >>(req);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.agent_name || !body.mission) {
    return NextResponse.json({ error: "agent_name and mission are required" }, { status: 400 });
  }

  const claude = claudeOnPath();
  if (!claude.ok) {
    return NextResponse.json(
      {
        error: "`claude` CLI not on PATH",
        hint: "Install Claude Code (`claude` command) and restart the dev server so it inherits the right PATH.",
      },
      { status: 503 },
    );
  }

  try {
    const agent = registry.spawn(body.agent_name, body.mission, {
      resumeSessionId: body.resume_session_id,
      kind: body.kind,
      skipKanbanCard: Boolean(body.skip_kanban_card),
      sourceMeta: body.source_meta,
      sourceChannel: body.source_channel,
    });
    return NextResponse.json(
      {
        mission_id: agent.missionId,
        agent_name: agent.agentName,
        status: agent.status,
        started_at: agent.startedAt,
      },
      { status: 201 },
    );
  } catch (e) {
    const { status, message, hint } = explainSpawnError(e);
    return NextResponse.json({ error: message, hint }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ live: registry.list(), claude: claudeOnPath() });
}
