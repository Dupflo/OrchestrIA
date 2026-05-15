import fs from "fs";
import path from "path";

const AUDIT_PATH = path.join(process.cwd(), ".orchestria", "remote-audit.jsonl");

export interface AuditEntry {
  jti: string;
  client: string;
  method: string;
  path: string;
  status: number;
}

export function audit(entry: AuditEntry): void {
  const line = JSON.stringify({ ts: Date.now(), ...entry }) + "\n";
  fs.appendFile(AUDIT_PATH, line, () => { /* fire and forget */ });
}
