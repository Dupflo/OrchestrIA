import fs from "fs";
import path from "path";

const ORCHESTRIA_HOME = path.join(process.cwd(), ".orchestria");

function agentDir(agent: string): string {
  return path.join(ORCHESTRIA_HOME, "agents", agent);
}

function memoryDir(agent: string): string {
  return path.join(agentDir(agent), "memory");
}

function isSafeFilename(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name) && !name.startsWith(".") && name !== "." && name !== "..";
}

export interface MemoryFileEntry {
  name: string;
  size: string;
  bytes: number;
  modified: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function listMemoryFiles(agent: string): MemoryFileEntry[] {
  if (!fs.existsSync(agentDir(agent))) return [];
  const dir = memoryDir(agent);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => {
      const stat = fs.statSync(path.join(dir, d.name));
      return {
        name: d.name,
        size: fmtSize(stat.size),
        bytes: stat.size,
        modified: Math.floor(stat.mtimeMs / 1000),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readMemoryFile(agent: string, file: string): string | null {
  if (!isSafeFilename(file)) return null;
  const p = path.join(memoryDir(agent), file);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function writeMemoryFile(agent: string, file: string, content: string): void {
  if (!isSafeFilename(file)) throw new Error("invalid filename");
  if (!fs.existsSync(agentDir(agent))) throw new Error("agent does not exist");
  const dir = memoryDir(agent);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), content);
}

export function deleteMemoryFile(agent: string, file: string): boolean {
  if (!isSafeFilename(file)) return false;
  const p = path.join(memoryDir(agent), file);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
