import { getDb } from "../db";

interface EventRow {
  kind: string;
  body: string;
}

interface TextBlock {
  type?: string;
  text?: string;
  content?: TextBlock[];
}

function extractText(payload: unknown, sink: string[]): void {
  if (!payload || typeof payload !== "object") return;
  const obj = payload as TextBlock & { message?: TextBlock };
  if (typeof obj.text === "string" && (!obj.type || obj.type === "text")) {
    sink.push(obj.text);
  }
  if (Array.isArray(obj.content)) {
    for (const c of obj.content) extractText(c, sink);
  }
  if (obj.message) extractText(obj.message, sink);
}

const ASSISTANT_KINDS = new Set([
  "assistant",
  "AssistantMessage",
  "assistant_message",
  "message",
  "result",
]);

export function buildMissionOutput(missionId: string): string {
  const rows = getDb()
    .prepare("SELECT kind, body FROM events WHERE mission_id = ? ORDER BY id ASC")
    .all(missionId) as EventRow[];

  const chunks: string[] = [];
  for (const r of rows) {
    if (!ASSISTANT_KINDS.has(r.kind)) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(r.body); } catch { continue; }
    extractText(parsed, chunks);
  }
  return chunks.join("\n\n").trim();
}
