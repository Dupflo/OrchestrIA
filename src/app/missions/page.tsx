"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { AgentConfig } from "@/lib/mock-data";

// ─── Types ──────────────────────────────────────────────────────────────────

type MissionStatus = "running" | "pending" | "done" | "failed" | "halted";

interface MissionData {
  id: string;
  agent_id: string;
  title: string;
  status: MissionStatus;
  start_ts: number;
  end_ts: number | null;
  source_channel: string | null;
  cost_usd?: number;
  tokens_in?: number;
  tokens_out?: number;
}

interface MissionDetail {
  mission: MissionData & { cost_usd: number; tokens_in: number; tokens_out: number };
  events: { id: number; ts: number; kind: string; payload: unknown }[];
  live: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTs(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(start: number, end: number | null): string {
  const s = (end ?? Math.floor(Date.now() / 1000)) - start;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toTimeString().slice(0, 8);
}

function fmtCost(v: number): string {
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

// ─── Inline SVG icons ───────────────────────────────────────────────────────

const ICO = {
  search: <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>,
  tl: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="5" r="2" /><circle cx="5" cy="15" r="2" /><path d="M5 7v6M9 5h7M9 15h4" /></svg>,
  doc: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 2.5h7l4 4V17a.5.5 0 01-.5.5h-11A.5.5 0 014 17V3a.5.5 0 01.5-.5z" /><path d="M12 2.5V6h4" /></svg>,
  logs: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h10M3 10h14M3 14h8" /></svg>,
};

// ─── New mission dialog (kept) ──────────────────────────────────────────────

function NewMissionDialog({
  onClose, onCreated, agents,
}: { onClose: () => void; onCreated: (id: string) => void; agents: AgentConfig[] }) {
  const [agent, setAgent] = useState(agents[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!agent || !input.trim()) { setError("agent and prompt required"); return; }
    setSubmitting(true);
    const res = await fetch("/api/agents/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: agent, mission: input.trim(), kind: "mission" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setError(err.error ?? `HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { mission_id: string };
    onCreated(json.mission_id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card w-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <h2>New mission</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={submitting}>×</button>
        </div>
        <div className="field">
          <label className="field-label">Agent</label>
          <select className="select" value={agent} onChange={(e) => setAgent(e.target.value)}>
            {agents.length === 0
              ? <option>No agents configured</option>
              : agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.model})</option>)
            }
          </select>
        </div>
        <div className="field">
          <label className="field-label">Prompt</label>
          <textarea className="textarea" rows={5} value={input} autoFocus
            onChange={(e) => setInput(e.target.value)}
            placeholder="What should the agent do?" />
        </div>
        {error && <div className="err-banner">{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={submitting || !input.trim() || !agent} style={{ flex: 1 }}>
            {submitting ? "Spawning…" : "Spawn mission"}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function classifyEventKind(kind: string, payload: unknown): { cls: "start" | "ok" | "tool" | "warn" | "err" | "end"; pretty: string } {
  if (kind === "system") return { cls: "start", pretty: "Start" };
  if (kind === "MissionComplete") {
    const p = payload as { status?: string };
    if (p.status === "failed") return { cls: "err", pretty: "Failed" };
    return { cls: "end", pretty: "Complete" };
  }
  if (kind === "tool_use" || kind === "tool_result") return { cls: "tool", pretty: kind };
  if (kind === "assistant") return { cls: "ok", pretty: "Assistant" };
  if (kind === "result") return { cls: "ok", pretty: "Result" };
  if (kind === "user") return { cls: "ok", pretty: "User" };
  return { cls: "tool", pretty: kind };
}

function summarizePayload(kind: string, payload: unknown): string {
  if (kind === "tool_use") {
    const p = payload as { name?: string; input?: unknown };
    return `<span class="tag">${p.name ?? "tool"}</span>(${JSON.stringify(p.input ?? "").slice(0, 100)})`;
  }
  if (kind === "tool_result") {
    const p = payload as { content?: unknown };
    const txt = typeof p.content === "string" ? p.content : JSON.stringify(p.content ?? "");
    return txt.slice(0, 180);
  }
  if (kind === "assistant") {
    const p = payload as { message?: { content?: Array<{ type?: string; text?: string }> } };
    const parts: string[] = [];
    for (const c of p.message?.content ?? []) {
      if (c?.type === "text" && c.text) parts.push(c.text);
    }
    return parts.join("").slice(0, 200);
  }
  if (kind === "result") {
    const p = payload as { result?: string };
    return (p.result ?? "").slice(0, 200);
  }
  if (kind === "system") {
    const p = payload as { session_id?: string };
    return p.session_id ? `session ${p.session_id.slice(0, 8)}…` : "init";
  }
  if (kind === "MissionComplete") {
    const p = payload as { status?: string; exitCode?: number };
    return `status ${p.status ?? "?"} (exit ${p.exitCode ?? "?"})`;
  }
  return "";
}

function extractFinalOutput(events: MissionDetail["events"]): string {
  // Last result event wins
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === "result") {
      const p = events[i].payload as { result?: string };
      if (typeof p.result === "string") return p.result;
    }
  }
  // Concat assistant text fallback
  const parts: string[] = [];
  for (const e of events) {
    if (e.kind !== "assistant") continue;
    const p = e.payload as { message?: { content?: Array<{ type?: string; text?: string }> } };
    for (const c of p.message?.content ?? []) {
      if (c?.type === "text" && c.text) parts.push(c.text);
    }
  }
  return parts.join("");
}

function DetailPanel({ mid, onClose, onDeleted }: { mid: string; onClose: () => void; onDeleted: () => void }) {
  const [data, setData] = useState<MissionDetail | null>(null);
  const [tab, setTab] = useState<"timeline" | "output" | "logs">("timeline");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setData(null);
    setTab("timeline");
    fetch(`/api/missions/${mid}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [mid]);

  // Re-fetch when SSE events arrive for this mission (live updates)
  useEffect(() => {
    if (!data?.live) return;
    const es = new EventSource(`/api/missions/${mid}/stream`);
    let pending: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        fetch(`/api/missions/${mid}`).then((r) => r.json()).then(setData).catch(() => {});
      }, 600);
    };
    return () => { es.close(); if (pending) clearTimeout(pending); };
  }, [data?.live, mid]);

  const output = useMemo(() => {
    if (!data) return "";
    return extractFinalOutput(data.events);
  }, [data]);

  if (!data) {
    return (
      <aside className="mp-detail">
        <div className="detail-empty">
          <div className="ico">…</div>
          <p>Loading mission…</p>
        </div>
      </aside>
    );
  }

  const m = data.mission;

  const remove = async () => {
    await fetch(`/api/missions/${mid}`, { method: "DELETE" });
    onDeleted();
  };

  return (
    <aside className="mp-detail">
      <div className="mp-detail-hd">
        <div className="top">
          <span className="id">{m.id}</span>
          <span className={`badge ${m.status === "done" ? "ok" : m.status === "failed" ? "err" : "warn"}`}>
            <span className="d" />{m.status}
          </span>
          {data.live && (
            <span style={{ fontSize: 10, color: "var(--ok)", fontFamily: "var(--font-mono, monospace)" }}>● live</span>
          )}
          <button className="close" onClick={onClose}>{ICO.x}</button>
        </div>
        <h2>{m.title}</h2>
        <div className="mp-detail-meta">
          <span>agent <b className="mono">{m.agent_id}</b></span>
          <span>started <b className="mono">{fmtTs(m.start_ts)}</b></span>
          <span>duration <b className="mono">{fmtDuration(m.start_ts, m.end_ts)}</b></span>
          {m.source_channel && <span>via <b className="mono">{m.source_channel}</b></span>}
        </div>
      </div>

      <div className="mp-detail-stats">
        <div className="ds"><span className="k">cost</span><span className="v">{fmtCost(m.cost_usd ?? 0)}</span></div>
        <div className="ds"><span className="k">tokens in</span><span className="v">{fmtTokens(m.tokens_in ?? 0)}</span></div>
        <div className="ds"><span className="k">tokens out</span><span className="v">{fmtTokens(m.tokens_out ?? 0)}</span></div>
        <div className="ds"><span className="k">events</span><span className="v">{data.events.length}</span></div>
      </div>

      <div className="mp-detail-tabs">
        <button className={`t${tab === "timeline" ? " on" : ""}`} onClick={() => setTab("timeline")}>
          {ICO.tl}Timeline <span className="ct">{data.events.length}</span>
        </button>
        <button className={`t${tab === "output" ? " on" : ""}`} onClick={() => setTab("output")}>
          {ICO.doc}Output
        </button>
        <button className={`t${tab === "logs" ? " on" : ""}`} onClick={() => setTab("logs")}>
          {ICO.logs}Logs
        </button>
        <span style={{ marginLeft: "auto", paddingTop: 10 }}>
          {!confirmDel ? (
            <button className="t" style={{ color: "var(--err)" }} onClick={() => setConfirmDel(true)}>Delete</button>
          ) : (
            <span style={{ display: "inline-flex", gap: 6, fontSize: 11, padding: "10px 0" }}>
              <button className="t" style={{ color: "var(--err)", padding: "2px 8px", borderRadius: 4, background: "var(--err-soft)" }} onClick={remove}>Confirm</button>
              <button className="t" style={{ padding: "2px 8px" }} onClick={() => setConfirmDel(false)}>Cancel</button>
            </span>
          )}
        </span>
      </div>

      <div className="mp-detail-body scroll">
        {tab === "timeline" && (
          <div className="tl">
            {data.events.map((e) => {
              const { cls, pretty } = classifyEventKind(e.kind, e.payload);
              const body = summarizePayload(e.kind, e.payload);
              return (
                <div key={e.id} className={`tl-ev ${cls}`}>
                  <div className="node" />
                  <div className="tl-meta">
                    <div className="top">
                      <span className="ty">{pretty}</span>
                      <span className="ts">{fmtTime(e.ts)}</span>
                    </div>
                    {body && <div className="ds" dangerouslySetInnerHTML={{ __html: body }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "output" && (
          <div className="output-md">
            {output ? <ReactMarkdown>{output}</ReactMarkdown> : <p style={{ color: "var(--text-faint)", fontStyle: "italic" }}>No output yet.</p>}
          </div>
        )}

        {tab === "logs" && (
          <div className="logs">
            {data.events.map((e) => (
              <div key={e.id}>
                {JSON.stringify({ ts: e.ts, kind: e.kind, payload: e.payload })}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

const STATUSES: (MissionStatus | "all")[] = ["all", "running", "pending", "done", "failed", "halted"];

export default function MissionsPage() {
  const [missions, setMissions] = useState<MissionData[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [status, setStatus] = useState<MissionStatus | "all">("all");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const refresh = () => {
    fetch("/api/missions").then((r) => r.json()).then((data: MissionData[]) => {
      setMissions(data);
      // auto-deselect if current selection got deleted
      setSelected((sel) => (sel && data.some((m) => m.id === sel) ? sel : sel));
    });
  };

  useEffect(() => {
    refresh();
    fetch("/api/agents").then((r) => r.json()).then(setAgents);
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    return missions.filter((m) => {
      if (status !== "all" && m.status !== status) return false;
      if (agentFilter && m.agent_id !== agentFilter) return false;
      if (search && !m.title.toLowerCase().includes(search.toLowerCase()) && !m.id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [missions, status, agentFilter, search]);

  // Stats: this month
  const monthStats = useMemo(() => {
    const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
    const cutoff = Math.floor(som.getTime() / 1000);
    let total = 0, cost = 0, tokens = 0, done = 0;
    for (const m of missions) {
      if (m.start_ts < cutoff) continue;
      total++;
      cost += m.cost_usd ?? 0;
      tokens += (m.tokens_in ?? 0) + (m.tokens_out ?? 0);
      if (m.status === "done") done++;
    }
    return { total, cost, tokens, successRate: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [missions]);

  const running = missions.filter((m) => m.status === "running").length;
  const COST_CAP = 25;

  const onDeletedSelected = () => {
    setSelected(null);
    refresh();
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (checkedIds.size === filtered.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map((m) => m.id)));
    }
  };

  const bulkDelete = async () => {
    if (checkedIds.size === 0) return;
    if (!confirm(`Supprimer définitivement les ${checkedIds.size} missions sélectionnées ?`)) return;
    setBulkDeleting(true);
    await Promise.all([...checkedIds].map((id) => fetch(`/api/missions/${id}`, { method: "DELETE" })));
    setBulkDeleting(false);
    if (selected && checkedIds.has(selected)) setSelected(null);
    setCheckedIds(new Set());
    refresh();
  };

  return (
    <div className="mp-root">
      {/* page header */}
      <div className="mp-hd">
        <div className="mp-hd-top">
          <div>
            <h1>Missions</h1>
            <div className="sub">
              All agent-owned tasks · sorted by start time · last 30 days
            </div>
          </div>
          <div className="view-switch">
            <a className="on">Table</a>
            <Link href="/kanban" className="" style={{ color: "var(--text-dim)", textDecoration: "none" }}>Board</Link>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {checkedIds.size > 0 && (
              <button
                className="btn btn-sm"
                style={{ background: "var(--err-soft)", color: "var(--err)", borderColor: "var(--err)", opacity: bulkDeleting ? 0.6 : 1 }}
                onClick={bulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting…" : `Delete ${checkedIds.size} selected`}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} disabled={agents.length === 0}>
              + New mission
            </button>
          </div>
        </div>

        <div className="mp-stats">
          <div className="mp-stat">
            <span className="k">missions this month</span>
            <span className="v">{monthStats.total}</span>
            <span className="delta">{running} running</span>
          </div>
          <div className="mp-stat">
            <span className="k">total cost</span>
            <span className="v">{fmtCost(monthStats.cost)}</span>
            <div className="bar"><div className="f" style={{ width: `${Math.min(100, (monthStats.cost / COST_CAP) * 100)}%` }} /></div>
          </div>
          <div className="mp-stat">
            <span className="k">tokens consumed</span>
            <span className="v">{fmtTokens(monthStats.tokens)}</span>
            <span className="delta">in + out</span>
          </div>
          <div className="mp-stat">
            <span className="k">success rate</span>
            <span className="v">{monthStats.successRate}<span style={{ fontSize: 14, color: "var(--text-faint)" }}>%</span></span>
            <span className={`delta${monthStats.successRate < 80 ? " warn" : ""}`}>{monthStats.successRate >= 80 ? "▲ healthy" : "▼ check failures"}</span>
          </div>
        </div>
      </div>

      {/* filters */}
      <div className="mp-filters">
        {STATUSES.map((s) => (
          <button key={s}
            className={`mp-filter${status === s ? " on" : ""}`}
            onClick={() => setStatus(s)}>
            <span className="k">status:</span>
            <span className="v">{s}</span>
          </button>
        ))}
        <span className="sep" />
        <select className="mp-filter" value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
          style={{ paddingRight: 22 }}>
          <option value="">all agents</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="search">
          {ICO.search}
          <input className="input" placeholder="search title or id…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono, monospace)" }}>
          {filtered.length} of {missions.length}
        </span>
      </div>

      {/* body: table + detail */}
      <div className={`mp-body${selected ? "" : " no-detail"}`}>
        <div className="tbl-wrap scroll">
          {filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--text-faint)" }}>
              No missions match the current filters.
            </div>
          ) : (
            <table className="mp-tbl">
              <thead>
                <tr>
                  <th style={{ width: 32, paddingLeft: 8 }}>
                    <input
                      type="checkbox"
                      style={{ cursor: "pointer" }}
                      checked={filtered.length > 0 && checkedIds.size === filtered.length}
                      ref={(el) => { if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < filtered.length; }}
                      onChange={toggleCheckAll}
                    />
                  </th>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Agent</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th className="num">Cost</th>
                  <th className="num">Tokens</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}
                    className={selected === m.id ? "on" : ""}
                    onClick={() => setSelected(m.id)}>
                    <td style={{ paddingLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        style={{ cursor: "pointer" }}
                        checked={checkedIds.has(m.id)}
                        onChange={() => toggleCheck(m.id)}
                      />
                    </td>
                    <td><span className="id">{m.id.slice(0, 8)}</span></td>
                    <td>
                      <div className="title">{m.title}</div>
                      {m.source_channel && (
                        <div style={{ fontSize: 10.5, color: "var(--text-faint)", marginTop: 2 }}>via {m.source_channel}</div>
                      )}
                    </td>
                    <td>
                      <span className="ag">
                        <span className="g">{(m.agent_id ?? "?").charAt(0).toUpperCase()}</span>
                        <span className="nm">{m.agent_id}</span>
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {fmtTs(m.start_ts)}
                    </td>
                    <td className="mono" style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {fmtDuration(m.start_ts, m.end_ts)}
                    </td>
                    <td className="num">{fmtCost(m.cost_usd ?? 0)}</td>
                    <td className="num">
                      <span className="pill-num">{fmtTokens(m.tokens_in ?? 0)}<span className="sub">/{fmtTokens(m.tokens_out ?? 0)}</span></span>
                    </td>
                    <td>
                      <span className={`badge ${m.status === "done" ? "ok" : m.status === "failed" ? "err" : "warn"}`}>
                        <span className="d" />{m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <DetailPanel
            mid={selected}
            onClose={() => setSelected(null)}
            onDeleted={onDeletedSelected}
          />
        )}
      </div>

      {showNew && (
        <NewMissionDialog
          agents={agents}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); refresh(); setSelected(id); }}
        />
      )}
    </div>
  );
}
