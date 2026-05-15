"use client";

import { useRef, useState, useEffect } from "react";
import type { Agent, AgentLiveState, StreamEvent } from "@/lib/mock-data";
import { makeEvent } from "@/lib/mock-data";

interface EventStreamOpts {
  rate?: number;
}

export function useEventStream(
  seed: StreamEvent[],
  agents: Agent[],
  agentMap: Record<string, AgentLiveState>,
  opts: EventStreamOpts = {}
): StreamEvent[] {
  const { rate = 1.4 } = opts;
  const [events, setEvents] = useState<StreamEvent[]>(seed);
  const nextId = useRef(seed.length);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const active = agents.filter((a) => {
        const s = agentMap[a.id]?.status;
        return s === "active" || s === "waiting" || s === "err";
      });
      const target = active[Math.floor(Math.random() * active.length)];
      const ev = makeEvent(nextId.current++, target?.id);
      setEvents((es) => {
        const next = [...es, ev];
        return next.length > 220 ? next.slice(next.length - 220) : next;
      });
      const jitter = (0.5 + Math.random()) * (1000 / rate);
      setTimeout(tick, jitter);
    };
    const id = setTimeout(tick, 1000 / rate);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [agents, agentMap, rate]);

  return events;
}
