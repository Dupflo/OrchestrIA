import fs from "fs";
import path from "path";
import os from "os";

export const SKILLS_DIR = path.join(process.cwd(), ".orchestria", "skills");
const CLAUDE_GLOBAL_SKILLS = path.join(os.homedir(), ".claude", "skills");
const CLAUDE_PROJECT_SKILLS = path.join(process.cwd(), ".claude", "skills");

export type SkillCategory = "dev" | "content" | "ops" | "life";
export type SkillSource = "project" | "claude-global" | "claude-project";

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  agents: string[];
  enabled: boolean;
  code?: string;
  source: SkillSource;
}

const ID_RE = /^[a-zA-Z0-9_-]+$/;

function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    out[key] = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return {};
}

function readClaudeSkill(dir: string, source: SkillSource): Skill | null {
  const skillMd = path.join(dir, "SKILL.md");
  if (!fs.existsSync(skillMd)) return null;
  const raw = fs.readFileSync(skillMd, "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    fm[key] = val;
  }
  const id = path.basename(dir);
  const descRaw = fm.description ?? "";
  const desc = descRaw.replace(/^\|/, "").trim().split("\n")[0].trim();
  return {
    id,
    name: fm.name ?? id,
    description: desc,
    category: "dev",
    agents: [],
    enabled: true,
    source,
  };
}

export function listSkills(): Skill[] {
  const out: Skill[] = [];

  // OrchestrIA project skills
  if (fs.existsSync(SKILLS_DIR)) {
    for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const file = path.join(SKILLS_DIR, d.name, "skill.json");
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Skill>;
      out.push({
        id: d.name,
        name: raw.name ?? d.name,
        description: raw.description ?? "",
        category: (raw.category ?? "dev") as SkillCategory,
        agents: raw.agents ?? [],
        enabled: raw.enabled ?? true,
        code: raw.code,
        source: "project",
      });
    }
  }

  // Claude Code global skills
  if (fs.existsSync(CLAUDE_GLOBAL_SKILLS)) {
    for (const d of fs.readdirSync(CLAUDE_GLOBAL_SKILLS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const s = readClaudeSkill(path.join(CLAUDE_GLOBAL_SKILLS, d.name), "claude-global");
      if (s) out.push(s);
    }
  }

  // Claude Code project skills
  if (fs.existsSync(CLAUDE_PROJECT_SKILLS)) {
    for (const d of fs.readdirSync(CLAUDE_PROJECT_SKILLS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const s = readClaudeSkill(path.join(CLAUDE_PROJECT_SKILLS, d.name), "claude-project");
      if (s) out.push(s);
    }
  }

  return out;
}

export function readSkill(id: string): Skill | null {
  const file = path.join(SKILLS_DIR, id, "skill.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Skill>;
  return {
    id,
    name: raw.name ?? id,
    description: raw.description ?? "",
    category: (raw.category ?? "dev") as SkillCategory,
    agents: raw.agents ?? [],
    enabled: raw.enabled ?? true,
    code: raw.code,
    source: "project",
  };
}

export interface SkillInput {
  id: string;
  name?: string;
  description?: string;
  category?: SkillCategory;
  agents?: string[];
  enabled?: boolean;
  code?: string;
}

export function createSkill(input: SkillInput): Skill {
  if (!ID_RE.test(input.id)) throw new Error("id must match /^[a-zA-Z0-9_-]+$/");
  const dir = path.join(SKILLS_DIR, input.id);
  if (fs.existsSync(dir)) throw new Error(`skill "${input.id}" already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const skill: Skill = {
    id: input.id,
    name: input.name ?? input.id,
    description: input.description ?? "",
    category: input.category ?? "dev",
    agents: input.agents ?? [],
    enabled: input.enabled ?? true,
    code: input.code,
    source: "project",
  };
  const { source: _src, ...toWrite } = skill;
  fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(toWrite, null, 2) + "\n");
  return skill;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  category?: SkillCategory;
  agents?: string[];
  enabled?: boolean;
  code?: string;
}

export function updateSkill(id: string, patch: UpdateSkillInput): Skill | null {
  const dir = path.join(SKILLS_DIR, id);
  const file = path.join(dir, "skill.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Skill>;
  if (patch.name !== undefined)        raw.name = patch.name;
  if (patch.description !== undefined) raw.description = patch.description;
  if (patch.category !== undefined)    raw.category = patch.category;
  if (patch.agents !== undefined)      raw.agents = patch.agents;
  if (patch.enabled !== undefined)     raw.enabled = patch.enabled;
  if (patch.code !== undefined)        raw.code = patch.code;
  const { source: _src, ...toWrite } = raw as Skill;
  fs.writeFileSync(file, JSON.stringify(toWrite, null, 2) + "\n");
  return readSkill(id);
}

export function deleteSkill(id: string): boolean {
  const dir = path.join(SKILLS_DIR, id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
