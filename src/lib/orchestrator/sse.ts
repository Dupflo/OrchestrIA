import type { ClaudeEvent } from "./types";

type Listener = (event: ClaudeEvent) => void;
type GlobalListener = (info: { missionId: string; agentId: string; event: ClaudeEvent }) => void;

const g = globalThis as {
  __mosSseListeners?: Map<string, Set<Listener>>;
  __mosSseGlobalListeners?: Set<GlobalListener>;
};
const listeners = (g.__mosSseListeners ??= new Map());
const globalListeners = (g.__mosSseGlobalListeners ??= new Set());

export function sseSubscribe(missionId: string, listener: Listener): () => void {
  let set = listeners.get(missionId);
  if (!set) {
    set = new Set();
    listeners.set(missionId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(missionId);
  };
}

export function sseSubscribeGlobal(listener: GlobalListener): () => void {
  globalListeners.add(listener);
  return () => { globalListeners.delete(listener); };
}

export function sseBroadcast(missionId: string, event: ClaudeEvent, agentId = ""): void {
  const set = listeners.get(missionId);
  if (set) for (const l of set) l(event);
  for (const l of globalListeners) l({ missionId, agentId, event });
}
