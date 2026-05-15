"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgentConfig } from "@/lib/mock-data";
import AgentEditor from "./AgentEditor";

// ─── List item ──────────────────────────────────────────────────────────────

function AgentItem({ cfg, active, onSelect }: { cfg: AgentConfig; active: boolean; onSelect: () => void }) {
  const isMos = cfg.source === "orchestria" || !cfg.source;
  const isSkill = cfg.source === "skill";
  const isClaude = cfg.source === "agent";
  const cls = active ? "active" : isSkill ? "readonly skill" : isClaude ? "readonly claude" : "";
  const glyph = cfg.glyph || cfg.name.charAt(0).toUpperCase() || "?";
  const role = isMos ? (cfg.id === "_main" ? "orchestrator" : "subagent") : isSkill ? "skill" : "claude agent";
  const modelShort = cfg.model.replace(/^claude-/, "").replace(/-\d{8}$/, "");

  return (
    <div className={`a-item ${cls}`} onClick={isMos ? onSelect : undefined}>
      <div className="a-glyph">{glyph}</div>
      <div className="a-meta">
        <div className="a-name-row">
          <span className="a-name">{cfg.name}</span>
          {isMos && <span className="a-model">{modelShort}</span>}
          {isSkill && <span className="a-badge skill">SKILL</span>}
          {isClaude && <span className="a-badge claude">CLAUDE</span>}
        </div>
        <div className="a-sub">
          <span className={`a-status-dot ${isMos ? "ok" : ""}`} />
          <span style={{ textTransform: "capitalize" }}>{role}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

function AgentsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get("id");

  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const NEW_SENTINEL = "__new__";
  const isNew = selectedId === NEW_SENTINEL;

  const reload = () =>
    fetch("/api/agents?native=1")
      .then((r) => r.json())
      .then((data: AgentConfig[]) => setConfigs(data))
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const mosAgents = useMemo(() => configs.filter((c) => c.source === "orchestria" || !c.source), [configs]);
  const claudeAgents = useMemo(() => configs.filter((c) => c.source === "agent"), [configs]);

  // Default selection: first OrchestrIA agent if nothing in URL (and not in create mode)
  useEffect(() => {
    if (loading) return;
    if (isNew) return; // create mode: stay on __new__
    if (selectedId) {
      const exists = configs.some((c) => c.id === selectedId);
      if (!exists && mosAgents.length > 0) {
        router.replace(`/agents?id=${encodeURIComponent(mosAgents[0].id)}`);
      }
    } else if (mosAgents.length > 0) {
      router.replace(`/agents?id=${encodeURIComponent(mosAgents[0].id)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mosAgents.length, selectedId, isNew]);

  const matches = (c: AgentConfig) =>
    !query.trim() ||
    c.name.toLowerCase().includes(query.toLowerCase()) ||
    c.id.toLowerCase().includes(query.toLowerCase());

  const filteredMos = mosAgents.filter(matches);
  const filteredClaude = claudeAgents.filter(matches);

  const select = (id: string) => router.replace(`/agents?id=${encodeURIComponent(id)}`);

  const onDeleted = () => {
    reload().then(() => {
      const remaining = configs.filter((c) => (c.source === "orchestria" || !c.source) && c.id !== selectedId);
      if (remaining.length > 0) router.replace(`/agents?id=${encodeURIComponent(remaining[0].id)}`);
      else router.replace("/agents");
    });
  };

  return (
    <div className="agents-layout">
      {/* ── left column: agent list ─────────────────────────── */}
      <aside className="col-list">
        <div className="list-hd">
          <div className="list-hd-row">
            <h2>Agents</h2>
            <span className="count">
              {loading ? "…" : `${mosAgents.length} OrchestrIA · ${claudeAgents.length} Claude`}
            </span>
          </div>
          <div className="searchbar">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" />
            </svg>
            <input className="input" placeholder="Search agents, roles, tools…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className={`new-agent${isNew ? " active" : ""}`}
            onClick={() => router.replace(`/agents?id=${NEW_SENTINEL}`)}>
            <span className="plus">+</span>
            <span>Spawn new agent</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--text-faint)" }} className="mono">⌘ N</span>
          </button>
        </div>

        <div className="agent-list scroll">
          {loading ? (
            <div className="list-empty">loading…</div>
          ) : filteredMos.length === 0 && filteredClaude.length === 0 ? (
            <div className="list-empty">
              No agents{query ? ` matching "${query}"` : ""}.<br />
              {!query && <>Create one with <span className="mono">+ Spawn new agent</span></>}
            </div>
          ) : (
            <>
              {filteredMos.length > 0 && (
                <div className="list-section">
                  <div className="lbl">ORCHESTRIA<span className="ct">{filteredMos.length}</span></div>
                  {filteredMos.map((c) => (
                    <AgentItem key={c.id} cfg={c} active={selectedId === c.id} onSelect={() => select(c.id)} />
                  ))}
                </div>
              )}
              {filteredClaude.length > 0 && (
                <div className="list-section">
                  <div className="lbl" style={{ color: "var(--ok)" }}>
                    CLAUDE AGENTS<span className="ct">{filteredClaude.length}</span>
                  </div>
                  {filteredClaude.map((c) => (
                    <AgentItem key={c.id} cfg={c} active={false} onSelect={() => {}} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── right column: editor ────────────────────────────── */}
      <main style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        {isNew ? (
          <AgentEditor
            key="__new__"
            id={NEW_SENTINEL}
            isNew
            onCreated={(newId) => {
              reload().then(() => router.replace(`/agents?id=${encodeURIComponent(newId)}`));
            }}
          />
        ) : selectedId && mosAgents.some((c) => c.id === selectedId) ? (
          <AgentEditor key={selectedId} id={selectedId} onDeleted={onDeleted} />
        ) : (
          <div className="empty-editor">
            <div className="ico">◆</div>
            <p>Select an agent to edit, or spawn a new one from the left panel.</p>
            <small>Native skills and Claude agents are read-only.</small>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="center-state">loading…</div>}>
      <AgentsPageInner />
    </Suspense>
  );
}
