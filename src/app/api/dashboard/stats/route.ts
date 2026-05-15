import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const BASE = "(kind != 'chat' OR kind IS NULL)";

  // Overall counts + totals
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      COALESCE(SUM(cost_usd), 0) as total_cost,
      COALESCE(SUM(tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(tokens_out), 0) as total_tokens_out
    FROM missions WHERE ${BASE}
  `).get() as {
    total: number; running: number; done: number; failed: number;
    total_cost: number; total_tokens_in: number; total_tokens_out: number;
  };

  // Per-day mission counts + cost (last 14 days)
  const daily = db.prepare(`
    SELECT
      date(start_ts, 'unixepoch') as day,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      COALESCE(SUM(cost_usd), 0) as cost,
      COALESCE(SUM(tokens_in), 0) as tokens_in,
      COALESCE(SUM(tokens_out), 0) as tokens_out
    FROM missions
    WHERE ${BASE} AND start_ts >= unixepoch('now', '-14 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as { day: string; total: number; done: number; failed: number; cost: number; tokens_in: number; tokens_out: number }[];

  // Fill in missing days with zeroes
  const dailyMap = new Map(daily.map((d) => [d.day, d]));
  const filledDaily: typeof daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = dailyMap.get(key) ?? { day: "", total: 0, done: 0, failed: 0, cost: 0, tokens_in: 0, tokens_out: 0 };
    filledDaily.push({ ...row, day: key.slice(5) });
  }

  // Per-agent breakdown
  const byAgent = db.prepare(`
    SELECT
      agent_id,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      COALESCE(SUM(cost_usd), 0) as cost,
      COALESCE(SUM(tokens_in), 0) as tokens_in,
      COALESCE(SUM(tokens_out), 0) as tokens_out
    FROM missions WHERE ${BASE}
    GROUP BY agent_id
    ORDER BY cost DESC
    LIMIT 10
  `).all() as { agent_id: string; total: number; running: number; done: number; failed: number; cost: number; tokens_in: number; tokens_out: number }[];

  // Recent missions (last 10)
  const recent = db.prepare(`
    SELECT id, agent_id, title, status, start_ts, end_ts, cost_usd, tokens_in, tokens_out
    FROM missions
    WHERE ${BASE}
    ORDER BY start_ts DESC
    LIMIT 10
  `).all() as { id: string; agent_id: string; title: string; status: string; start_ts: number; end_ts: number | null; cost_usd: number; tokens_in: number; tokens_out: number }[];

  // Active agents
  const activeAgents = db.prepare(`
    SELECT COUNT(DISTINCT agent_id) as n FROM missions WHERE status = 'running' AND ${BASE}
  `).get() as { n: number };

  return NextResponse.json({
    counts,
    activeAgents: activeAgents.n,
    daily: filledDaily,
    byAgent,
    recent,
  });
}
