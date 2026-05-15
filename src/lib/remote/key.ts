import fs from "fs";
import path from "path";
import crypto from "crypto";

const KEY_PATH = path.join(process.cwd(), ".orchestria", "remote.key");

let cached: Buffer | null = null;

export function getRemoteKey(): Buffer {
  if (cached) return cached;
  if (fs.existsSync(KEY_PATH)) {
    const raw = fs.readFileSync(KEY_PATH, "utf8").trim();
    cached = Buffer.from(raw, "base64");
    return cached;
  }
  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  const buf = crypto.randomBytes(48);
  fs.writeFileSync(KEY_PATH, buf.toString("base64"), { mode: 0o600 });
  cached = buf;
  return buf;
}
