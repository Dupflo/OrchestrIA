import fs from "fs";
import path from "path";
import { CHANNELS_DIR } from "./config";

/**
 * Per-channel subscriber registry. A "subscriber" is any chat / handle that
 * has interacted with the bot — captured automatically on inbound messages
 * so the user doesn't have to dig out their chat_id manually.
 *
 * Stored at <project>/.orchestria/channels/<name>.subscribers.json
 */

export interface Subscriber {
  chat_id: number;
  username?: string;
  first_name?: string;
  first_seen: number; // unix seconds
  last_seen: number;
  message_count: number;
}

interface SubscribersFile {
  subscribers: Subscriber[];
}

function fileFor(channelName: string): string {
  return path.join(CHANNELS_DIR, `${channelName}.subscribers.json`);
}

function read(channelName: string): SubscribersFile {
  const f = fileFor(channelName);
  if (!fs.existsSync(f)) return { subscribers: [] };
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as SubscribersFile;
  } catch {
    return { subscribers: [] };
  }
}

function write(channelName: string, data: SubscribersFile): void {
  fs.mkdirSync(CHANNELS_DIR, { recursive: true });
  fs.writeFileSync(fileFor(channelName), JSON.stringify(data, null, 2) + "\n");
}

/** Record (or refresh) a subscriber. Idempotent — bumps last_seen + message_count. */
export function recordSubscriber(
  channelName: string,
  meta: { chat_id: number; username?: string; first_name?: string },
): void {
  const now = Math.floor(Date.now() / 1000);
  const data = read(channelName);
  const existing = data.subscribers.find((s) => s.chat_id === meta.chat_id);
  if (existing) {
    existing.last_seen = now;
    existing.message_count = (existing.message_count ?? 0) + 1;
    if (meta.username) existing.username = meta.username;
    if (meta.first_name) existing.first_name = meta.first_name;
  } else {
    data.subscribers.push({
      chat_id: meta.chat_id,
      username: meta.username,
      first_name: meta.first_name,
      first_seen: now,
      last_seen: now,
      message_count: 1,
    });
  }
  write(channelName, data);
}

export function listSubscribers(channelName: string): Subscriber[] {
  return read(channelName).subscribers.sort((a, b) => b.last_seen - a.last_seen);
}

/** Remove a single subscriber by chat_id. Returns true if removed. */
export function removeSubscriber(channelName: string, chatId: number): boolean {
  const data = read(channelName);
  const before = data.subscribers.length;
  data.subscribers = data.subscribers.filter((s) => s.chat_id !== chatId);
  if (data.subscribers.length === before) return false;
  write(channelName, data);
  return true;
}

/** Wipe all subscribers for a channel. */
export function clearSubscribers(channelName: string): void {
  write(channelName, { subscribers: [] });
}
