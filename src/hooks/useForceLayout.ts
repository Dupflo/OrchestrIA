"use client";

import { useRef, useState, useCallback } from "react";
import type { Agent } from "@/lib/mock-data";

export interface ForceNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

export interface ForceLink {
  s: number;
  t: number;
  w: number;
}

interface ForceOpts {
  width?: number;
  height?: number;
  charge?: number;
  link?: number;
  gravity?: number;
}

export function useForceLayout(
  agents: Agent[],
  edges: [string, string, number][],
  opts: ForceOpts = {}
) {
  const { width = 1200, height = 700, charge = -2400, link = 180, gravity = 0.05 } = opts;

  const nodes = useRef<ForceNode[] | null>(null);
  const links = useRef<ForceLink[] | null>(null);
  const [, force] = useState(0);
  const tickRef = useRef(0);
  const draggingRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  if (!nodes.current || nodes.current.length !== agents.length) {
    const n = agents.length;
    nodes.current = agents.map((a, i) => {
      if (a.pinned) {
        return { id: a.id, x: width / 2, y: height / 2, vx: 0, vy: 0, fixed: true };
      }
      const ang = (i / n) * Math.PI * 2;
      const r = Math.min(width, height) * 0.32;
      return {
        id: a.id,
        x: width / 2 + Math.cos(ang) * r + (Math.random() - 0.5) * 40,
        y: height / 2 + Math.sin(ang) * r + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
    // reset links and seed whenever node count changes
    links.current = null;
    seededRef.current = false;
  }
  if (!links.current || links.current.length !== edges.length) {
    const idx = Object.fromEntries(agents.map((a, i) => [a.id, i]));
    links.current = edges.map(([a, b, w]) => ({ s: idx[a], t: idx[b], w }));
    seededRef.current = false;
  }

  const step = useCallback(
    (dt = 1) => {
      const ns = nodes.current!;
      const ls = links.current!;
      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          const d = Math.sqrt(d2);
          const f = charge / d2;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }

      for (const l of ls) {
        const a = ns[l.s], b = ns[l.t];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - link) * 0.04 * (0.3 + l.w * 0.7);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }

      for (const n of ns) {
        n.vx += (cx - n.x) * gravity * 0.02;
        n.vy += (cy - n.y) * gravity * 0.02;
      }

      for (const n of ns) {
        if (n.fixed) { n.vx = n.vy = 0; n.x = cx; n.y = cy; continue; }
        if (draggingRef.current === n.id) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.78; n.vy *= 0.78;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }
      tickRef.current++;
    },
    [width, height, charge, link, gravity]
  );

  if (!seededRef.current) {
    for (let i = 0; i < 400; i++) step(1);
    // zero out residual velocities so the graph is dead-still after seed
    for (const n of nodes.current!) { n.vx = 0; n.vy = 0; }
    seededRef.current = true;
  }

  // No continuous RAF loop — the graph is static after seed.
  // Drag operations bump `force` to trigger a re-render.

  return {
    nodes: nodes.current,
    links: links.current,
    setDrag: (id: string | null) => { draggingRef.current = id; },
    moveDrag: (id: string, x: number, y: number) => {
      const n = nodes.current?.find((n) => n.id === id);
      if (n) { n.x = x; n.y = y; n.vx = n.vy = 0; }
      force((t) => t + 1);
    },
  };
}
