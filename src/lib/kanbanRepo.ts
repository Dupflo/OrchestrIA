import crypto from "crypto";
import { getDb } from "./db";

export type KanbanCol = "backlog" | "todo" | "doing" | "done";
export type NotifyOn = "never" | "failure" | "always";

export interface KanbanCard {
  id: string;
  title: string;
  description: string | null;
  agent: string | null;
  col: KanbanCol;
  domain: string | null;
  tags: string[];
  due: string | null;
  progress: number | null;
  mission_id: string | null;
  not_before: string | null;
  notify_channel: string | null;
  notify_on: NotifyOn;
  target_chat_ids: number[];
  created_at: number;
  updated_at: number;
}

interface Row {
  id: string;
  title: string;
  description: string | null;
  agent: string | null;
  col: KanbanCol;
  domain: string | null;
  tags: string;
  due: string | null;
  progress: number | null;
  mission_id: string | null;
  not_before: string | null;
  notify_channel: string | null;
  notify_on: NotifyOn | null;
  target_chat_ids: string | null;
  created_at: number;
  updated_at: number;
}

function parseTargetChatIds(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isFinite(n));
    if (typeof v === "number" && Number.isFinite(v)) return [v];
  } catch { /* fall through */ }
  return String(raw).split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

function hydrate(r: Row): KanbanCard {
  return {
    ...r,
    description: r.description ?? null,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    mission_id: r.mission_id ?? null,
    not_before: r.not_before ?? null,
    notify_channel: r.notify_channel ?? null,
    notify_on: (r.notify_on ?? "never") as NotifyOn,
    target_chat_ids: parseTargetChatIds(r.target_chat_ids),
  };
}

export function listKanban(): KanbanCard[] {
  const rows = getDb()
    .prepare("SELECT * FROM kanban_cards ORDER BY col, updated_at DESC")
    .all() as Row[];
  return rows.map(hydrate);
}

export interface KanbanInput {
  title: string;
  description?: string | null;
  agent?: string | null;
  col?: KanbanCol;
  domain?: string | null;
  tags?: string[];
  due?: string | null;
  mission_id?: string | null;
  not_before?: string | null;
  notify_channel?: string | null;
  notify_on?: NotifyOn;
  target_chat_ids?: number[];
}

function serializeTargets(ids: number[] | undefined | null): string | null {
  if (!ids || ids.length === 0) return null;
  return JSON.stringify(ids);
}

export function createCard(input: KanbanInput): KanbanCard {
  const id = `c_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  getDb()
    .prepare(
      `INSERT INTO kanban_cards (id, title, description, agent, col, domain, tags, due, mission_id, not_before, notify_channel, notify_on, target_chat_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.title,
      input.description ?? null,
      input.agent ?? null,
      input.col ?? "backlog",
      input.domain ?? null,
      JSON.stringify(input.tags ?? []),
      input.due ?? null,
      input.mission_id ?? null,
      input.not_before ?? null,
      input.notify_channel ?? null,
      input.notify_on ?? "never",
      serializeTargets(input.target_chat_ids),
    );
  return getCard(id)!;
}

export function updateCardByMissionId(missionId: string, patch: { col?: KanbanCol; tags?: string[] }): void {
  const row = getDb()
    .prepare("SELECT * FROM kanban_cards WHERE mission_id = ?")
    .get(missionId) as Row | undefined;
  if (!row) return;
  const tags = patch.tags ?? (row.tags ? (JSON.parse(row.tags) as string[]) : []);
  getDb()
    .prepare("UPDATE kanban_cards SET col=?, tags=?, updated_at=unixepoch() WHERE mission_id=?")
    .run(patch.col ?? row.col, JSON.stringify(tags), missionId);
}

export function getCard(id: string): KanbanCard | null {
  const row = getDb().prepare("SELECT * FROM kanban_cards WHERE id = ?").get(id) as Row | undefined;
  return row ? hydrate(row) : null;
}

export function updateCard(id: string, patch: Partial<KanbanInput>): KanbanCard | null {
  const cur = getCard(id);
  if (!cur) return null;
  const next = {
    title: patch.title ?? cur.title,
    description: patch.description === undefined ? cur.description : patch.description,
    agent: patch.agent === undefined ? cur.agent : patch.agent,
    col: patch.col ?? cur.col,
    domain: patch.domain === undefined ? cur.domain : patch.domain,
    tags: patch.tags ?? cur.tags,
    due: patch.due === undefined ? cur.due : patch.due,
    mission_id: patch.mission_id === undefined ? cur.mission_id : patch.mission_id,
    not_before: patch.not_before === undefined ? cur.not_before : patch.not_before,
    notify_channel: patch.notify_channel === undefined ? cur.notify_channel : patch.notify_channel,
    notify_on: patch.notify_on ?? cur.notify_on,
    target_chat_ids: patch.target_chat_ids === undefined ? cur.target_chat_ids : patch.target_chat_ids,
  };
  getDb()
    .prepare(
      `UPDATE kanban_cards SET
        title=?, description=?, agent=?, col=?, domain=?, tags=?, due=?,
        mission_id=?, not_before=?, notify_channel=?, notify_on=?, target_chat_ids=?,
        updated_at=unixepoch()
       WHERE id=?`
    )
    .run(
      next.title, next.description, next.agent, next.col, next.domain,
      JSON.stringify(next.tags), next.due, next.mission_id, next.not_before,
      next.notify_channel, next.notify_on, serializeTargets(next.target_chat_ids),
      id
    );
  return getCard(id);
}

export function deleteCard(id: string): boolean {
  const res = getDb().prepare("DELETE FROM kanban_cards WHERE id = ?").run(id);
  return res.changes > 0;
}
