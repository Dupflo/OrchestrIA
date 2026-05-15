import { getDb } from "../db";
import { parseCron, nextRun } from "./cron";

export interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  cron_expr: string;
  agent_id: string;
  prompt: string;
  skill_ref: string | null;
  notify_on: "always" | "failure" | "never";
  notify_channel: string | null;
  /** JSON-encoded number[]. null = broadcast to all subscribers of the channel. */
  target_chat_ids: string | null;
  /** Fixed interval in seconds. Overrides cron_expr when set. */
  interval_seconds: number | null;
  paused: number;
  last_run_ts: number | null;
  last_status: string | null;
  next_run_ts: number | null;
  created_at: number;
}

export interface RoutineWithStats extends RoutineRow {
  runs_mtd: number;
  cost_mtd: number;
  running: boolean;
}

export interface RoutineInput {
  id: string;
  name: string;
  description?: string;
  cron_expr: string;
  agent_id: string;
  prompt: string;
  skill_ref?: string;
  notify_on?: "always" | "failure" | "never";
  notify_channel?: string;
  /** Optional chat_id allow-list. Omit/empty = broadcast to all subscribers. */
  target_chat_ids?: number[];
  /** Fixed interval in seconds. Overrides cron_expr scheduling when set. */
  interval_seconds?: number;
}

const ID_RE = /^[a-zA-Z0-9_-]+$/;

function startOfMonth(): number {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

export function listRoutines(): RoutineWithStats[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM routines ORDER BY created_at DESC`).all() as RoutineRow[];
  const som = startOfMonth();
  const statsByRoutine = new Map<string, { runs: number; cost: number; running: boolean }>();

  const statsRows = db.prepare(
    `SELECT routine_id,
            COUNT(*) as runs,
            COALESCE(SUM(cost_usd), 0) as cost,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_n
       FROM missions
      WHERE routine_id IS NOT NULL AND start_ts >= ?
      GROUP BY routine_id`
  ).all(som) as { routine_id: string; runs: number; cost: number; running_n: number }[];

  for (const s of statsRows) {
    statsByRoutine.set(s.routine_id, { runs: s.runs, cost: s.cost, running: s.running_n > 0 });
  }

  return rows.map((r) => {
    const s = statsByRoutine.get(r.id);
    const notify_on = (r.notify_on ?? "failure") as RoutineRow["notify_on"];
    return {
      ...r,
      notify_on,
      runs_mtd: s?.runs ?? 0,
      cost_mtd: s?.cost ?? 0,
      running: s?.running ?? false,
    };
  });
}

export function getRoutine(id: string): RoutineRow | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM routines WHERE id = ?`).get(id) as RoutineRow | undefined;
  if (!row) return null;
  return { ...row, notify_on: (row.notify_on ?? "failure") as RoutineRow["notify_on"] };
}

export function createRoutine(input: RoutineInput): RoutineRow {
  if (!ID_RE.test(input.id)) throw new Error("id must be alphanumeric / _ / -");
  parseCron(input.cron_expr); // validate
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM routines WHERE id = ?`).get(input.id)) {
    throw new Error(`routine "${input.id}" already exists`);
  }
  const intervalSec = input.interval_seconds && input.interval_seconds > 0 ? input.interval_seconds : null;
  const next = intervalSec
    ? Math.floor((Date.now() + intervalSec * 1000) / 1000)
    : computeNextRun(input.cron_expr);
  const targetJson = input.target_chat_ids && input.target_chat_ids.length > 0
    ? JSON.stringify(input.target_chat_ids) : null;
  db.prepare(
    `INSERT INTO routines (id, name, description, cron_expr, agent_id, prompt, skill_ref, notify_on, notify_channel, target_chat_ids, interval_seconds, next_run_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id, input.name, input.description ?? null, input.cron_expr,
    input.agent_id, input.prompt, input.skill_ref ?? null,
    input.notify_on ?? "failure", input.notify_channel ?? null,
    targetJson, intervalSec, next,
  );
  return getRoutine(input.id)!;
}

export function updateRoutine(id: string, patch: Partial<RoutineInput> & { paused?: boolean }): RoutineRow | null {
  const cur = getRoutine(id);
  if (!cur) return null;
  if (patch.cron_expr !== undefined) parseCron(patch.cron_expr);
  const fields: string[] = [];
  const args: unknown[] = [];
  const map: Record<string, unknown> = {
    name: patch.name, description: patch.description, cron_expr: patch.cron_expr,
    agent_id: patch.agent_id, prompt: patch.prompt, skill_ref: patch.skill_ref,
    notify_on: patch.notify_on, notify_channel: patch.notify_channel,
    target_chat_ids: patch.target_chat_ids === undefined
      ? undefined
      : (patch.target_chat_ids.length > 0 ? JSON.stringify(patch.target_chat_ids) : null),
    paused: patch.paused === undefined ? undefined : (patch.paused ? 1 : 0),
  };
  for (const k of Object.keys(map)) {
    if (map[k] !== undefined) { fields.push(`${k} = ?`); args.push(map[k]); }
  }
  // Recompute next_run_ts if cron or pause state changed
  if (patch.cron_expr !== undefined || patch.paused !== undefined) {
    const willPause = patch.paused ?? !!cur.paused;
    const nextExpr = patch.cron_expr ?? cur.cron_expr;
    fields.push("next_run_ts = ?");
    args.push(willPause ? null : computeNextRun(nextExpr));
  }
  if (fields.length === 0) return cur;
  args.push(id);
  getDb().prepare(`UPDATE routines SET ${fields.join(", ")} WHERE id = ?`).run(...args);
  return getRoutine(id);
}

export function deleteRoutine(id: string): boolean {
  const res = getDb().prepare(`DELETE FROM routines WHERE id = ?`).run(id);
  return res.changes > 0;
}

export function markRoutineFired(id: string, status: string): void {
  const cur = getRoutine(id);
  if (!cur) return;
  let next: number | null = null;
  if (!cur.paused) {
    if (cur.interval_seconds && cur.interval_seconds > 0) {
      next = Math.floor((Date.now() + cur.interval_seconds * 1000) / 1000);
    } else {
      next = computeNextRun(cur.cron_expr);
    }
  }
  getDb().prepare(
    `UPDATE routines SET last_run_ts = unixepoch(), last_status = ?, next_run_ts = ? WHERE id = ?`
  ).run(status, next, id);
}

function computeNextRun(expr: string): number {
  return Math.floor(nextRun(parseCron(expr), Date.now()) / 1000);
}

/** Return ids of routines whose next_run_ts has elapsed (and that are not paused). */
export function dueRoutines(nowSec: number): RoutineRow[] {
  return getDb().prepare(
    `SELECT * FROM routines
      WHERE paused = 0
        AND next_run_ts IS NOT NULL
        AND next_run_ts <= ?`
  ).all(nowSec) as RoutineRow[];
}
