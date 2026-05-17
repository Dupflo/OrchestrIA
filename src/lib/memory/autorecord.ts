import fs from "fs";
import path from "path";
import { registry } from "../orchestrator/registry";
import { loadAgentConfig, agentDir, GLOBAL_MEMORY_DIR, ensureMemoryDir } from "../orchestrator/config";
import { buildMissionOutput } from "../remote/output";
import { distillationEnabled, distillArchiveIntoLearnings } from "./distill";
import { getDb } from "../db";

/**
 * Auto-records each completed mission as a conversation entry in the agent's
 * memory store. Respects the agent's memoryScope:
 *   NONE / SESSION → noop
 *   USER           → <project>/.orchestria/agents/<id>/memory/conversations.md
 *   GLOBAL         → ~/.orchestria/global-memory/<agentId>-conversations.md
 *
 * File is capped at MAX_BYTES; older content is rotated to a timestamped archive
 * sibling so the active file stays small and readable.
 */

const MAX_BYTES = 256 * 1024; // 256 KB rolling window
const g = globalThis as { __mosMemoryAutorecord?: () => void };

interface MissionRow {
  agent_id: string;
  title: string;
  kind: string;
  source_channel: string | null;
  start_ts: number;
  end_ts: number | null;
}

function fmtTs(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function memoryFileFor(agentId: string, scope: "USER" | "GLOBAL"): string {
  if (scope === "GLOBAL") {
    fs.mkdirSync(GLOBAL_MEMORY_DIR, { recursive: true });
    return path.join(GLOBAL_MEMORY_DIR, `${agentId}-conversations.md`);
  }
  return path.join(ensureMemoryDir(agentId), "conversations.md");
}

/** Returns the archive path if a rotation happened, else null. */
function rotateIfTooBig(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const size = fs.statSync(file).size;
  if (size < MAX_BYTES) return null;
  const archive = file.replace(/\.md$/, `-archive-${Date.now()}.md`);
  fs.renameSync(file, archive);
  // Seed the new file with a pointer note so context is preserved
  fs.writeFileSync(file, `<!-- previous entries archived to ${path.basename(archive)} -->\n\n`);
  return archive;
}

/** Returns the archive path if appending triggered a rotation, else null. */
function appendEntry(file: string, missionId: string, header: string, userText: string, agentText: string): string | null {
  const archived = rotateIfTooBig(file);
  // Mission id tag at the top lets us safely remove this block later when the mission is deleted.
  const block = [
    `<!-- mission: ${missionId} -->`,
    `## ${header}`,
    "",
    `**user:** ${userText.trim()}`,
    "",
    `**agent:** ${agentText.trim()}`,
    "",
    "---",
    "",
  ].join("\n");
  fs.appendFileSync(file, block);
  return archived;
}

/** Escape a string so it can be safely interpolated into a regex. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove the conversation entries for the given mission ids from both possible
 * memory files (USER project-local + GLOBAL ~/.orchestria/global-memory). The scope at
 * recording time isn't known retroactively so we sweep both stores.
 */
export function removeConversationEntries(agentName: string, missionIds: string[]): void {
  if (missionIds.length === 0) return;
  const files = [
    path.join(agentDir(agentName), "memory", "conversations.md"),
    path.join(GLOBAL_MEMORY_DIR, `${agentName}-conversations.md`),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, "utf8");
    let changed = false;
    for (const mid of missionIds) {
      // Match: <!-- mission: <mid> -->\n## ...\n...\n---\n[\n]?
      const re = new RegExp(
        `<!-- mission: ${escapeRegex(mid)} -->\\n[\\s\\S]*?\\n---\\n?\\n?`,
        "g"
      );
      const next = content.replace(re, "");
      if (next !== content) { content = next; changed = true; }
    }
    if (changed) fs.writeFileSync(file, content);
  }
}

/**
 * Wipe all conversation memory files for the agent (USER + GLOBAL).
 * Used by "Reset all chat history". Archives (`*-archive-*.md`) are preserved.
 */
export function clearAllConversations(agentName: string): void {
  const files = [
    path.join(agentDir(agentName), "memory", "conversations.md"),
    path.join(GLOBAL_MEMORY_DIR, `${agentName}-conversations.md`),
  ];
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

export function startAutoMemoryRecording(): boolean {
  if (g.__mosMemoryAutorecord) return false;

  const unsub = registry.onMissionComplete((info) => {
    try {
      // Read the agent's current memory scope (live, since it can be edited)
      let scope: "NONE" | "SESSION" | "USER" | "GLOBAL" = "USER";
      try {
        scope = loadAgentConfig(info.agentName).memoryScope ?? "USER";
      } catch {
        // Native skills / Claude agents won't have an OrchestrIA config — skip them
        return;
      }
      if (scope === "NONE" || scope === "SESSION") return;
      // Only record actual conversations (chat/channel), not background routines
      const row = getDb().prepare(
        `SELECT agent_id, title, kind, source_channel, start_ts, end_ts
           FROM missions WHERE id = ?`
      ).get(info.missionId) as MissionRow | undefined;
      if (!row) return;
      if (row.kind !== "chat" && row.kind !== "channel") return;

      const userText = row.title || "(empty)";
      const agentText = buildMissionOutput(info.missionId) || "(no text output)";
      // Skip useless echo entries
      if (!agentText || agentText === userText) return;

      const channel = row.source_channel ? ` · via ${row.source_channel}` : " · web";
      const header = `${fmtTs(row.start_ts)}${channel}`;
      const memScope = scope === "GLOBAL" ? "GLOBAL" : "USER";
      const file = memoryFileFor(info.agentName, memScope);
      const archived = appendEntry(file, info.missionId, header, userText, agentText);

      // On rotation, distill the about-to-be-forgotten archive into
      // learnings.md (opt-in). Deferred + fire-and-forget so it never blocks
      // or re-enters the completion dispatch; failures are self-contained.
      if (archived && distillationEnabled()) {
        const agentName = info.agentName;
        setTimeout(() => {
          void distillArchiveIntoLearnings(agentName, memScope, archived);
        }, 0);
      }
    } catch (e) {
      console.error("[memory] autorecord failed:", e);
    }
  });

  g.__mosMemoryAutorecord = unsub;
  return true;
}

export function stopAutoMemoryRecording(): void {
  g.__mosMemoryAutorecord?.();
  delete g.__mosMemoryAutorecord;
}
