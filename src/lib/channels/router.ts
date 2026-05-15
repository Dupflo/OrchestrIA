import type { BaseChannelConfig, ResolvedRoute } from "./types";

const TAG_RE = /^@([A-Za-z][A-Za-z0-9_-]*)\b\s*/;

export function resolveRoute(input: string, config: BaseChannelConfig): ResolvedRoute {
  const trimmed = input.trimStart();
  const m = TAG_RE.exec(trimmed);
  if (!m) {
    return { agent: config.default_agent, cleanedInput: input.trim() };
  }
  const tag = `@${m[1]}`;
  const routed = config.agent_routing?.[tag];
  if (!routed) {
    return { agent: config.default_agent, cleanedInput: input.trim() };
  }
  return { agent: routed, cleanedInput: trimmed.slice(m[0].length).trim() };
}
