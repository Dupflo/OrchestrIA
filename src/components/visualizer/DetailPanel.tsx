"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AGENT_ROLES, type Agent, type AgentLiveState } from "@/lib/mock-data";

interface Props {
  agent: Agent | null;
  agentMap: Record<string, AgentLiveState>;
  agents: Agent[];
  edges: [string, string, number][];
  onSelect: (id: string) => void;
  onClose: () => void;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
      <span style={{
        fontSize: 9, letterSpacing: "0.08em", color: "var(--text-faint)",
        fontFamily: "var(--font-mono, monospace)",
      }}>
        {label}
      </span>
      <span className="mono" style={{ fontSize: 11, color: color ?? "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export default function DetailPanel({ agent, agentMap, agents, edges, onSelect, onClose }: Props) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ = { agents, onSelect };

  const counts = useMemo(() => {
    if (!agent) return { edgesCount: 0 };
    let n = 0;
    for (const [a, b] of edges) {
      if (a === agent.id || b === agent.id) n++;
    }
    return { edgesCount: n };
  }, [agent?.id, edges]);

  if (!agent) {
    return (
      <aside className="detail">
        <div className="detail-empty">
          <div className="ico">∅</div>
          <p>Sélectionne un agent pour inspecter.</p>
          <small>Tap a node, or use ⌘K to spawn a new one.</small>
        </div>
      </aside>
    );
  }

  const live = agentMap[agent.id];
  const role = AGENT_ROLES[agent.role];
  const statusColor =
    live.status === "active" ? "#8be38b"
    : live.status === "waiting" ? "#e6b85c"
    : live.status === "err" ? "#e26d6d"
    : "var(--text-faint)";

  return (
    <aside className="detail">
      <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: "var(--text-faint)" }}>
          AGENT // INSPECT
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{
            fontSize: 10, padding: "2px 7px", borderRadius: 3,
            border: "1px solid var(--accent)", color: "var(--accent)",
            fontWeight: 600, letterSpacing: "0.04em", fontFamily: "var(--font-mono, monospace)",
          }}>
            {agent.id.toUpperCase()}
          </span>
          <button onClick={onClose}
            style={{
              background: "transparent", border: 0, color: "var(--text-faint)",
              cursor: "pointer", fontSize: 14, padding: "0 4px",
            }}>×</button>
        </div>
      </div>

      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: `${role.color}22`, border: `1px solid ${role.color}66`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: role.color, fontSize: 14, fontFamily: "var(--font-mono, monospace)",
          }}>
            {agent.glyph}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</div>
            <div style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em", marginTop: 2 }}>
              {role.label.toUpperCase()}
            </div>
          </div>
        </div>

        <Stat label="ROLE"     value={role.label.charAt(0).toUpperCase() + role.label.slice(1)} />
        <Stat label="STATUS"   value={live.status.toUpperCase()} color={statusColor} />
        <Stat label="ID"       value={agent.id} />
        <Stat label="EDGES"    value={String(counts.edgesCount)} />
        <Stat label="MSGS IN"  value={String(Math.floor((live.tokens ?? 0) / 100))} />
        <Stat label="MSGS OUT" value={String(Math.floor((live.tokens ?? 0) / 120))} />
        <Stat label="UPTIME"   value={live.runtime || "0s"} />

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
          <button onClick={() => router.push(`/chat?agent=${encodeURIComponent(agent.id)}`)}
            style={{
              padding: "8px 0", borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid var(--accent)",
              color: "var(--accent)", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.06em", fontFamily: "var(--font-mono, monospace)",
            }}>
            ✎ OPEN CHAT
          </button>
          <button onClick={() => router.push(`/agents?id=${encodeURIComponent(agent.id)}`)}
            style={{
              padding: "8px 0", borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-dim)", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.06em", fontFamily: "var(--font-mono, monospace)",
            }}>
            ◆ EDIT CONFIG
          </button>
          <button onClick={() => router.push(`/memory?agent=${encodeURIComponent(agent.id)}`)}
            style={{
              padding: "8px 0", borderRadius: 6, cursor: "pointer",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-dim)", fontSize: 11, fontWeight: 600,
              letterSpacing: "0.06em", fontFamily: "var(--font-mono, monospace)",
            }}>
            ● MEMORY
          </button>
        </div>
      </div>

      <div style={{
        padding: "12px 16px", borderTop: "1px solid var(--border)",
        flex: 1, overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--text-faint)" }}>
            // CONSOLE
          </span>
          <span style={{
            fontSize: 9, padding: "1px 6px", borderRadius: 3,
            border: "1px solid var(--border)", color: "var(--text-faint)",
            fontFamily: "var(--font-mono, monospace)",
          }}>0</span>
        </div>
        <div style={{
          flex: 1, fontSize: 11, color: "var(--text-faint)",
          fontFamily: "var(--font-mono, monospace)", fontStyle: "italic",
          padding: "8px 0",
        }}>
          — no events yet. Run a task or drag an agent.
        </div>
      </div>
    </aside>
  );
}
