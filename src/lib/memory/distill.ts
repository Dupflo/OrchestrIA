import fs from "fs";
import path from "path";
import { registry } from "../orchestrator/registry";
import { GLOBAL_MEMORY_DIR, ensureMemoryDir } from "../orchestrator/config";
import { buildMissionOutput } from "../remote/output";

/**
 * Memory distillation (opt-in via ORCHESTRIA_MEMORY_DISTILL=1).
 *
 * Raw conversation memory rolls over to a timestamped archive at 256 KB —
 * which, until now, meant the knowledge in it was effectively forgotten.
 * When enabled, the agent is asked to distill that about-to-be-archived log
 * into a compact, durable `learnings.md` (stable facts, recurring user
 * preferences, what worked / what failed). `loadMemory()` already injects
 * every `*.md` in the memory dir, so `learnings.md` feeds straight back into
 * the agent's system prompt. The agent therefore gets *smarter* with use
 * instead of merely accumulating (then shedding) transcript.
 *
 * Recursion is safe: the distillation runs as a `kind:"mission"` spawn, which
 * autorecord ignores (it records only chat/channel), so it cannot trigger
 * another rotation → distillation loop.
 */

/** Default OFF — distillation spends Claude tokens; the user opts in. */
export function distillationEnabled(): boolean {
  return process.env.ORCHESTRIA_MEMORY_DISTILL === "1";
}

export function learningsFileFor(agentId: string, scope: "USER" | "GLOBAL"): string {
  if (scope === "GLOBAL") {
    fs.mkdirSync(GLOBAL_MEMORY_DIR, { recursive: true });
    return path.join(GLOBAL_MEMORY_DIR, `${agentId}-learnings.md`);
  }
  return path.join(ensureMemoryDir(agentId), "learnings.md");
}

export function buildDistillPrompt(existingLearnings: string, rawArchive: string): string {
  return [
    "You are distilling your own long-term memory. Below is (A) your current",
    "distilled learnings and (B) an older raw conversation log about to be",
    "archived. Produce an UPDATED, consolidated learnings document.",
    "",
    "Keep only durable, transferable knowledge: stable facts about the user and",
    "their projects, recurring preferences and instructions, approaches that",
    "worked or failed, and decisions that still hold. Drop greetings, one-off",
    "task chatter, and anything ephemeral. Merge — do not just append; supersede",
    "stale points with newer ones. Be concise; bullet points over prose.",
    "",
    "Output ONLY the final Markdown for learnings.md — no preamble, no fences.",
    "",
    "=== (A) CURRENT learnings.md ===",
    existingLearnings.trim() || "(empty)",
    "",
    "=== (B) RAW log being archived ===",
    rawArchive.trim(),
  ].join("\n");
}

/**
 * Read the just-archived raw log, ask the agent to distill it, and write the
 * result to the agent's `learnings.md`. Best-effort: every failure path is
 * swallowed (logged) so a distillation problem never disrupts the
 * mission-complete flow that triggered it.
 */
export async function distillArchiveIntoLearnings(
  agentId: string,
  scope: "USER" | "GLOBAL",
  archivePath: string,
): Promise<void> {
  if (!distillationEnabled()) return;
  try {
    const raw = fs.readFileSync(archivePath, "utf8");
    if (!raw.trim()) return;

    const lf = learningsFileFor(agentId, scope);
    const existing = fs.existsSync(lf) ? fs.readFileSync(lf, "utf8") : "";

    const prompt = buildDistillPrompt(existing, raw);
    // kind:"mission" + skipKanbanCard → ignored by autorecord (no recursion)
    // and no Kanban noise. A hung distill is bounded by the registry's
    // per-mission wall-clock kill, which still emits "done".
    const sa = registry.spawn(agentId, prompt, { kind: "mission", skipKanbanCard: true });
    await new Promise<void>((resolve) => sa.once("done", () => resolve()));

    const distilled = buildMissionOutput(sa.missionId).trim();
    if (!distilled) return;
    fs.writeFileSync(lf, distilled + "\n");
    console.log(`[memory] distilled ${path.basename(archivePath)} → ${path.basename(lf)} (${agentId})`);
  } catch (e) {
    console.error("[memory] distillation failed:", e instanceof Error ? e.message : e);
  }
}
