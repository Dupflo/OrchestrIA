"use client";

import { useRef, useState, useEffect } from "react";
import type { Agent, AgentLiveState } from "@/lib/mock-data";
import type { ForceLink } from "./useForceLayout";

export interface Pulse {
  linkIdx: number;
  t: number;
  lvl: "info" | "ok" | "warn" | "err" | "tool";
  born: number;
}

interface TrafficOpts {
  rate?: number;
  speed?: number;
}

export function useTraffic(
  links: ForceLink[],
  agents: Agent[],
  agentMap: Record<string, AgentLiveState>,
  opts: TrafficOpts = {}
): Pulse[] {
  const { rate = 1.6, speed = 0.0009 } = opts;
  const pulses = useRef<Pulse[]>([]);
  const [, force] = useState(0);
  const lastSpawn = useRef(performance.now());

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const now = performance.now();
      const interval = 1000 / rate;
      while (now - lastSpawn.current > interval) {
        lastSpawn.current += interval;
        const candidates = links.map((l, i) => {
          const src = agents[l.s];
          const a = agentMap[src.id];
          const mult =
            a.status === "active" ? 1
            : a.status === "waiting" ? 0.2
            : a.status === "err" ? 0.1
            : 0;
          return { i, w: l.w * mult };
        });
        const total = candidates.reduce((s, c) => s + c.w, 0);
        if (total <= 0) break;
        let r = Math.random() * total;
        let pick = candidates[0];
        for (const c of candidates) { r -= c.w; if (r <= 0) { pick = c; break; } }
        const lvls: Pulse["lvl"][] = ["info", "info", "info", "tool", "ok", "ok", "warn", "err"];
        const a = agentMap[agents[links[pick.i].s].id];
        const lvl: Pulse["lvl"] = a.status === "err" ? "err" : lvls[Math.floor(Math.random() * lvls.length)];
        pulses.current.push({ linkIdx: pick.i, t: 0, lvl, born: now });
        if (pulses.current.length > 80) pulses.current.shift();
      }
      const dt = 16;
      pulses.current = pulses.current.filter((p) => {
        p.t += speed * dt;
        return p.t < 1.02;
      });
      force((t) => t + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [links, agents, agentMap, rate, speed]);

  return pulses.current;
}
