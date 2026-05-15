import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionRow {
  claude_session_id: string;
  first_ts: number;
  last_ts: number;
  message_count: number;
  first_title: string;
}

/**
 * List all past chat sessions for an agent (one entry per distinct claude_session_id).
 * Each session shows : first user message, message count, first/last timestamp.
 * Ordered by last activity desc.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  const db = getDb();

  const rows = db.prepare(
    `SELECT
       claude_session_id,
       MIN(start_ts) AS first_ts,
       MAX(start_ts) AS last_ts,
       COUNT(*)      AS message_count,
       (SELECT title FROM missions m2
         WHERE m2.agent_id = m.agent_id
           AND m2.claude_session_id = m.claude_session_id
           AND m2.kind = 'chat'
         ORDER BY m2.start_ts ASC LIMIT 1) AS first_title
     FROM missions m
     WHERE agent_id = ? AND kind = 'chat' AND claude_session_id IS NOT NULL
     GROUP BY claude_session_id
     ORDER BY last_ts DESC`
  ).all(agent) as SessionRow[];

  return NextResponse.json(rows.map((r) => ({
    sessionId: r.claude_session_id,
    firstTs: r.first_ts,
    lastTs: r.last_ts,
    messageCount: r.message_count,
    firstTitle: r.first_title,
  })));
}
