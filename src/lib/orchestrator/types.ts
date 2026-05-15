export type PermissionMode = "auto" | "acceptEdits" | "plan" | "bypassPermissions";

export type LiveStatus = "running" | "completed" | "failed" | "halted";

export type MemoryScope = "NONE" | "SESSION" | "USER" | "GLOBAL";

export interface AgentFileConfig {
  cwd: string;
  model: string;
  permissionMode: PermissionMode;
  allowedTools?: string[];
  deniedTools?: string[];
  parent?: string;
  memoryScope?: MemoryScope;
}

export interface ClaudeEvent {
  type: string;
  timestamp: number;
  payload: unknown;
}

export interface SpawnRequest {
  agent_name: string;
  mission: string;
  /** Board and other UIs that already have a kanban row should set this so spawn does not INSERT a second card. */
  skip_kanban_card?: boolean;
}

export interface SendRequest {
  input: string;
}
