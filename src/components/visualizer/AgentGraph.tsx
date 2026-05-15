"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { useForceLayout } from "@/hooks/useForceLayout";
import { useTraffic } from "@/hooks/useTraffic";
import { AGENT_ROLES, type Agent, type AgentLiveState } from "@/lib/mock-data";

interface Props {
  agents: Agent[];
  agentMap: Record<string, AgentLiveState>;
  edges: [string, string, number][];
  selected: string | null;
  onSelect: (id: string) => void;
  dims: { width: number; height: number };
  showLabels?: boolean;
  edgeMode?: "curved" | "straight";
  pulseRate?: number;
  onZoomRef?: (api: { in: () => void; out: () => void; home: () => void }) => void;
}

export default function AgentGraph({
  agents,
  agentMap,
  edges,
  selected,
  onSelect,
  dims,
  showLabels = true,
  edgeMode = "curved",
  pulseRate = 2.6,
  onZoomRef,
}: Props) {
  const { width, height } = dims;
  const { nodes, links, setDrag, moveDrag } = useForceLayout(agents, edges, { width, height });
  const pulses = useTraffic(links, agents, agentMap, { rate: pulseRate, speed: 0.0011 });

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const panState = useRef<{ x0: number; y0: number; vx0: number; vy0: number } | null>(null);

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - view.x) / view.k,
      y: (clientY - r.top - view.y) / view.k,
    };
  };

  const onNodeDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDragging(id);
    setDrag(id);
  };

  useEffect(() => {
    if (!dragging && !panState.current) return;
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const p = toSvg(e.clientX, e.clientY);
        moveDrag(dragging, p.x, p.y);
      } else {
        const ps = panState.current;
        if (!ps) return;
        const dx = e.clientX - ps.x0;
        const dy = e.clientY - ps.y0;
        const { vx0, vy0 } = ps;
        setView((v) => ({ ...v, x: vx0 + dx, y: vy0 + dy }));
      }
    };
    const onUp = () => {
      if (dragging) { setDrag(null); setDragging(null); }
      panState.current = null;
      svgRef.current?.classList.remove("dragging");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  });

  const onBgDown = (e: React.MouseEvent) => {
    panState.current = { x0: e.clientX, y0: e.clientY, vx0: view.x, vy0: view.y };
    svgRef.current?.classList.add("dragging");
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const k2 = Math.max(0.4, Math.min(2.4, v.k * factor));
      const r = svgRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      return {
        x: mx - (mx - v.x) * (k2 / v.k),
        y: my - (my - v.y) * (k2 / v.k),
        k: k2,
      };
    });
  };

  useEffect(() => {
    const api = {
      in:   () => setView((v) => ({ ...v, k: Math.min(2.4, v.k * 1.2) })),
      out:  () => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.2) })),
      home: () => setView({ x: 0, y: 0, k: 1 }),
    };
    onZoomRef?.(api);
  }, [onZoomRef]);

  const highlighted = useMemo(() => {
    if (!selected && !hover) return null;
    const id = selected || hover;
    const set = new Set([id!]);
    for (const [a, b] of edges) {
      if (a === id) set.add(b);
      if (b === id) set.add(a);
    }
    return set;
  }, [selected, hover, edges]);

  const linkPath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (edgeMode === "straight") return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const off = Math.min(40, len * 0.12);
    const px = mx - (dy / len) * off;
    const py = my + (dx / len) * off;
    return `M ${a.x} ${a.y} Q ${px} ${py} ${b.x} ${b.y}`;
  };

  const linkPoint = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => {
    if (edgeMode === "straight") {
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const off = Math.min(40, len * 0.12);
    const px = mx - (dy / len) * off;
    const py = my + (dx / len) * off;
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * px + t * t * b.x, y: u * u * a.y + 2 * u * t * py + t * t * b.y };
  };

  const pulseColor = (lvl: string) =>
    ({ info: "#7ec5ff", ok: "#8be38b", warn: "#e6b85c", err: "#e26d6d", tool: "#c89cff" }[lvl] || "#e8e8e6");

  return (
    <div className="stage">
      <div className="bg-grid" />
      <div className="vignette" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        onMouseDown={onBgDown}
        onWheel={onWheel}
      >
        <defs>
          <radialGradient id="nodeGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(224,122,95,0.55)" />
            <stop offset="60%" stopColor="rgba(224,122,95,0.08)" />
            <stop offset="100%" stopColor="rgba(224,122,95,0)" />
          </radialGradient>
          <radialGradient id="nodeGlowKernel" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(224,122,95,0.85)" />
            <stop offset="50%" stopColor="rgba(224,122,95,0.18)" />
            <stop offset="100%" stopColor="rgba(224,122,95,0)" />
          </radialGradient>
          <filter id="pulseBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g opacity="0.18" pointerEvents="none">
            {[180, 320, 460].map((r, i) => (
              <circle key={i} cx={width / 2} cy={height / 2} r={r} fill="none"
                stroke="rgba(255,255,255,0.08)" strokeDasharray="2 6" />
            ))}
          </g>

          <g>
            {links.map((l, i) => {
              const a = nodes![l.s], b = nodes![l.t];
              const aId = agents[l.s].id, bId = agents[l.t].id;
              const dim = highlighted && !(highlighted.has(aId) && highlighted.has(bId));
              const idle = agentMap[aId]?.status === "idle" || agentMap[bId]?.status === "idle";
              return (
                <g key={i}>
                  {/* glow halo */}
                  <path d={linkPath(a, b)} fill="none"
                    stroke={dim ? "transparent" : "rgba(224,122,95,0.12)"}
                    strokeWidth={(1.5 + l.w * 1.2) * 3}
                    strokeLinecap="round"
                  />
                  {/* main line */}
                  <path d={linkPath(a, b)} fill="none"
                    stroke={dim ? "rgba(255,255,255,0.06)" : "rgba(224,180,140,0.55)"}
                    strokeWidth={1.5 + l.w * 1.2}
                    strokeDasharray={idle ? "4 6" : ""}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>

          <g pointerEvents="none">
            {pulses.map((p, i) => {
              const l = links[p.linkIdx];
              if (!l) return null;
              const a = nodes![l.s], b = nodes![l.t];
              const pt = linkPoint(a, b, Math.min(1, p.t));
              const c = pulseColor(p.lvl);
              return (
                <g key={i} transform={`translate(${pt.x} ${pt.y})`}>
                  <circle r={4} fill={c} opacity="0.18" filter="url(#pulseBlur)" />
                  <circle r={1.8} fill={c} />
                </g>
              );
            })}
          </g>

          <g>
            {agents.map((a, i) => {
              const n = nodes![i];
              const isSel = selected === a.id;
              const isHov = hover === a.id;
              const dim = highlighted && !highlighted.has(a.id);
              const isSkill = a.source === "skill";
              const isClaudeAgent = a.source === "agent";
              const isNative = isSkill || isClaudeAgent;
              const isKernel = a.id === "kernel";
              const r = isKernel ? 34 : isNative ? 14 : 26;
              const nativeColor = isClaudeAgent ? "#34d399" : "#a78bfa";
              const nativeBg = isClaudeAgent ? "#0a2218" : "#1a1430";
              const nativeBorder = isClaudeAgent ? "rgba(52,211,153,0.35)" : "rgba(167,139,250,0.35)";
              const nativeRing = isClaudeAgent ? "rgba(52,211,153,0.9)" : "rgba(167,139,250,0.9)";
              const status = agentMap[a.id]?.status || "idle";
              const statusColor =
                status === "active" ? "#8be38b"
                : status === "waiting" ? "#e6b85c"
                : status === "err" ? "#e26d6d"
                : "rgba(255,255,255,0.25)";

              return (
                <g key={a.id} transform={`translate(${n.x} ${n.y})`}
                  onMouseDown={(e) => onNodeDown(e, a.id)}
                  onMouseEnter={() => setHover(a.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(e) => { e.stopPropagation(); onSelect(a.id); }}
                  style={{ cursor: "default", opacity: dim ? 0.35 : 1, transition: "opacity .2s" }}
                >
                  {!isNative && (
                    <circle r={r * 2.2} fill={`url(#${isKernel ? "nodeGlowKernel" : "nodeGlow"})`}
                      opacity={status === "active" ? 1 : 0.35} />
                  )}
                  {(isSel || isHov) && (
                    <circle r={r + (isNative ? 3 : 6)} fill="none"
                      stroke={isNative ? nativeRing : "rgba(224,122,95,0.9)"}
                      strokeWidth="1" strokeDasharray="2 3" />
                  )}
                  <circle r={r} fill={isNative ? nativeBg : isKernel ? "#1a1410" : "#141414"}
                    stroke={isNative ? nativeBorder : "rgba(255,255,255,0.14)"} strokeWidth="1" />
                  <circle r={r} fill="none" stroke={isNative ? nativeColor : statusColor}
                    strokeWidth={isKernel ? "1.2" : "1"}
                    strokeOpacity={isNative ? 0.5 : status === "idle" ? 0.4 : 0.8}
                    strokeDasharray={isNative ? "3 3" : status === "waiting" ? "4 4" : ""} />
                  {status === "active" && (agentMap[a.id]?.progress ?? 0) > 0 && (() => {
                    const prog = agentMap[a.id].progress;
                    const R = r + 3;
                    const ang = prog * Math.PI * 2;
                    const x2 = Math.sin(ang) * R, y2 = -Math.cos(ang) * R;
                    const large = ang > Math.PI ? 1 : 0;
                    return (
                      <path d={`M 0 ${-R} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`}
                        fill="none" stroke="#E07A5F" strokeWidth="1.5"
                        strokeLinecap="round" opacity="0.85" />
                    );
                  })()}
                  <text textAnchor="middle" dominantBaseline="central" y="0.5"
                    fontFamily="'JetBrains Mono', monospace" fontWeight="600"
                    fontSize={isNative ? 8 : isKernel ? 18 : 15}
                    fill={isNative ? nativeColor : isKernel ? "#E07A5F" : "#e8e8e6"}>
                    {a.glyph}
                  </text>
                  {!isNative && (
                    <circle cx={r * 0.72} cy={-r * 0.72} r={4}
                      fill={statusColor} stroke="#0a0a0a" strokeWidth="1.5" />
                  )}
                  {showLabels && (
                    <g transform={`translate(0 ${r + (isNative ? 8 : 18)})`}>
                      <text textAnchor="middle" fontFamily="'JetBrains Mono', monospace"
                        fontSize={isNative ? "8" : "12"}
                        fill={isNative ? nativeColor : "#e8e8e6"}
                        opacity={isNative ? 0.7 : 0.92}
                        style={{ paintOrder: "stroke" } as React.CSSProperties}
                        stroke="#0a0a0a" strokeWidth="3">
                        {a.name}
                      </text>
                      {!isNative && (
                        <text textAnchor="middle" y="15" fontFamily="'Inter', sans-serif"
                          fontSize="10" fill="#5a5a55"
                          style={{ paintOrder: "stroke" } as React.CSSProperties}
                          stroke="#0a0a0a" strokeWidth="3">
                          {AGENT_ROLES[a.role].label.toLowerCase()}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
