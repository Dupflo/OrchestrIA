import { spawn as ptySpawn, type IPty } from "node-pty";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import type { AgentFileConfig, ClaudeEvent, LiveStatus } from "./types";

// Resolve `claude` to an absolute path once, using the user's login PATH.
// node-pty doesn't always inherit shell PATH on macOS (homebrew etc.).
let cachedClaudeBin: string | null = null;
function resolveClaudeBin(): string {
  if (cachedClaudeBin) return cachedClaudeBin;
  const candidates = ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
  try {
    const found = execSync("command -v claude", { encoding: "utf8" }).trim();
    if (found) candidates.unshift(found);
  } catch { /* ignore */ }
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); cachedClaudeBin = c; return c; } catch { /* try next */ }
  }
  throw new Error("`claude` CLI not found in /opt/homebrew/bin, /usr/local/bin, or PATH");
}

interface SpawnedAgentEvents {
  event: (e: ClaudeEvent) => void;
  raw: (line: string) => void;
  done: (exitCode: number) => void;
  session: (sessionId: string) => void;
}

export declare interface SpawnedAgent {
  on<K extends keyof SpawnedAgentEvents>(event: K, listener: SpawnedAgentEvents[K]): this;
  emit<K extends keyof SpawnedAgentEvents>(event: K, ...args: Parameters<SpawnedAgentEvents[K]>): boolean;
}

export class SpawnedAgent extends EventEmitter {
  readonly missionId: string;
  readonly agentName: string;
  readonly startedAt: number = Date.now();
  status: LiveStatus = "running";

  private pty: IPty;
  private buffer = "";

  sessionId: string | null = null;

  constructor(
    missionId: string,
    agentName: string,
    config: AgentFileConfig,
    systemPrompt: string,
    prompt: string,
    resumeSessionId?: string,
  ) {
    super();
    this.missionId = missionId;
    this.agentName = agentName;

    // --output-format stream-json only works with --print (non-interactive).
    // The prompt is passed as the trailing positional argument.
    const args: string[] = [
      "--print",
      "--model", config.model,
      "--permission-mode", config.permissionMode,
      "--output-format", "stream-json",
      "--verbose",
    ];
    if (resumeSessionId) {
      args.push("--resume", resumeSessionId);
    }
    if (systemPrompt.trim()) {
      args.push("--append-system-prompt", systemPrompt);
    }
    if (config.allowedTools?.length) {
      args.push("--allowed-tools", config.allowedTools.join(","));
    }
    if (config.deniedTools?.length) {
      args.push("--disallowed-tools", config.deniedTools.join(","));
    }
    // `--allowed-tools` / `--disallowed-tools` are variadic — without `--`
    // the parser would consume the prompt as a tool name.
    args.push("--", prompt);

    const claudeBin = resolveClaudeBin();
    const enrichedPath = ["/opt/homebrew/bin", "/usr/local/bin", process.env.PATH ?? ""]
      .filter(Boolean).join(":");
    // `config.cwd` comes from agent JSON — an invalid/missing dir would make
    // node-pty throw at spawn. Fall back to the home directory instead.
    let cwd = config.cwd;
    try {
      if (!fs.statSync(cwd).isDirectory()) cwd = os.homedir();
    } catch {
      cwd = os.homedir();
    }
    this.pty = ptySpawn(claudeBin, args, {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        PATH: enrichedPath,
        ORCHESTRIA_AGENT: agentName,
        ORCHESTRIA_MISSION: missionId,
      },
    });

    this.pty.onData((chunk) => this.ingest(chunk));
    this.pty.onExit(({ exitCode }) => {
      this.status = exitCode === 0 ? "completed" : "failed";
      this.emit("done", exitCode ?? 1);
    });
  }

  send(input: string): void {
    this.pty.write(input.endsWith("\n") ? input : input + "\n");
  }

  kill(): void {
    this.status = "halted";
    this.pty.kill();
  }

  private ingest(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const parsed = this.parseLine(line);
      if (parsed) {
        this.captureSession(parsed);
        this.emit("event", parsed);
      } else {
        this.emit("raw", line);
      }
    }
  }

  private captureSession(ev: ClaudeEvent): void {
    if (this.sessionId) return;
    const p = ev.payload as { session_id?: unknown } | null;
    if (p && typeof p.session_id === "string") {
      this.sessionId = p.session_id;
      this.emit("session", p.session_id);
    }
  }

  private parseLine(line: string): ClaudeEvent | null {
    const start = line.indexOf("{");
    if (start < 0) return null;
    const json = line.slice(start);
    if (!json.endsWith("}")) return null;
    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      return null;
    }
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    const type = typeof o.type === "string" ? o.type
      : typeof o.subtype === "string" ? o.subtype
      : "unknown";
    return { type, timestamp: Date.now(), payload: obj };
  }
}
