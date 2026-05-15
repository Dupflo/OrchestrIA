import fs from "fs";
import path from "path";
import type { ChannelConfig } from "./types";

export const CHANNELS_DIR = path.join(process.cwd(), ".orchestria", "channels");

export function loadChannelConfig(name: string): ChannelConfig {
  const file = path.join(CHANNELS_DIR, `${name}.json`);
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw) as ChannelConfig;
}

export function tryLoadChannelConfig(name: string): ChannelConfig | null {
  const file = path.join(CHANNELS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ChannelConfig;
}

export function listChannels(): { name: string; config: ChannelConfig }[] {
  if (!fs.existsSync(CHANNELS_DIR)) return [];
  return fs
    .readdirSync(CHANNELS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const name = f.slice(0, -5);
      return { name, config: loadChannelConfig(name) };
    });
}
