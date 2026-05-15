import { NextResponse } from "next/server";
import { readSkill, deleteSkill, updateSkill, SKILLS_DIR, type UpdateSkillInput } from "@/lib/skillsRepo";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAUDE_GLOBAL = path.join(os.homedir(), ".claude", "skills");
const CLAUDE_PROJECT = path.join(process.cwd(), ".claude", "skills");

function readClaudeContent(source: string, id: string): string | null {
  const base = source === "claude-global" ? CLAUDE_GLOBAL : CLAUDE_PROJECT;
  const file = path.join(base, id, "SKILL.md");
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") ?? "project";

  if (source === "claude-global" || source === "claude-project") {
    const content = readClaudeContent(source, id);
    if (!content) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ id, source, content });
  }

  const skill = readSkill(id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = path.join(SKILLS_DIR, id, "skill.json");
  const raw = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  return NextResponse.json({ ...skill, content: raw });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as UpdateSkillInput;
  const updated = updateSkill(id, body);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteSkill(id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
