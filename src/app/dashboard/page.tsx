"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyPoint {
  day: string;
  total: number;
  done: number;
  failed: number;
  cost: number;
  tokens_in: number;
  tokens_out: number;
}
interface AgentStat {
  agent_id: string;
  total: number;
  running: number;
  done: number;
  failed: number;
  cost: number;
  tokens_in: number;
  tokens_out: number;
}
interface RecentMission {
  id: string;
  agent_id: string;
  title: string;
  status: string;
  start_ts: number;
  end_ts: number | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}
interface Stats {
  counts: {
    total: number; running: number; done: number; failed: number;
    total_cost: number; total_tokens_in: number; total_tokens_out: number;
  };
  activeAgents: number;
  daily: DailyPoint[];
  byAgent: AgentStat[];
  recent: RecentMission[];
}

type ChartView = "cost" | "missions" | "tokens";
type RangeKey = "24h" | "7d" | "30d";

// ─── Format helpers ─────────────────────────────────────────────────────────

function fmtCost(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Mini spark ────────────────────────────────────────────────────────────

function MiniSpark({ data, max = 1 }: { data: number[]; max?: number }) {
  const m = Math.max(max, ...data, 1);
  return (
    <div className="mini-spark">
      {data.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(2, (v / m) * 100)}%` }} />
      ))}
    </div>
  );
}

// ─── Status → CSS class for traces ─────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  done: "ok", running: "run", failed: "err", pending: "warn", halted: "warn",
};

const TOOLTIP_STYLE = {
  background: "var(--bg-elev-2)", border: "1px solid var(--line-strong)",
  borderRadius: 8, fontSize: 11, color: "var(--text)",
  fontFamily: "'JetBrains Mono', monospace",
};

// ─── Main page ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<ChartView>("cost");
  const [range, setRange] = useState<RangeKey>("7d");

  useEffect(() => {
    const load = () =>
      fetch("/api/dashboard/stats")
        .then((r) => r.json()).then(setStats)
        .catch((e) => console.error(e));
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  // Slice daily series to the chosen range
  const daily = useMemo(() => {
    if (!stats?.daily) return [];
    const take = range === "24h" ? 1 : range === "7d" ? 7 : 30;
    return stats.daily.slice(-take);
  }, [stats?.daily, range]);

  const sparkData = useMemo(() => daily.map((d) => d.cost || 0), [daily]);

  // Successrate over the daily slice
  const slice = useMemo(() => {
    if (!stats) return { total: 0, done: 0, failed: 0, cost: 0, tokens: 0 };
    let total = 0, done = 0, failed = 0, cost = 0, tokens = 0;
    for (const d of daily) {
      total += d.total ?? 0;
      done += d.done ?? 0;
      failed += d.failed ?? 0;
      cost += d.cost ?? 0;
      tokens += (d.tokens_in ?? 0) + (d.tokens_out ?? 0);
    }
    return { total, done, failed, cost, tokens };
  }, [daily, stats]);

  if (!stats) {
    return (
      <div className="dash-root">
        <div style={{ color: "var(--text-faint)", fontSize: 13, padding: 40 }}>Loading…</div>
      </div>
    );
  }

  const { counts, activeAgents, byAgent, recent } = stats;
  const successRate = slice.total > 0 ? Math.round((slice.done / slice.total) * 100) : 0;
  const COST_CAP = 25;

  // Mission funnel — from current totals
  const funnel = [
    { key: "queued",  label: "queued",  n: counts.total - counts.running - counts.done - counts.failed, kind: "queue" as const },
    { key: "running", label: "running", n: counts.running, kind: "queue" as const },
    { key: "done",    label: "done",    n: counts.done,    kind: "ok" as const },
    { key: "halted",  label: "halted",  n: 0,              kind: "warn" as const },
    { key: "failed",  label: "failed",  n: counts.failed,  kind: "err" as const },
  ].map((r) => ({ ...r, n: Math.max(0, r.n) }));
  const funnelMax = Math.max(...funnel.map((r) => r.n), 1);

  // Top agents — sort by cost desc
  const topAgents = [...byAgent].sort((a, b) => b.cost - a.cost).slice(0, 7);
  const agentMax = Math.max(...topAgents.map((a) => a.cost), 0.01);

  return (
    <div className="dash-root">
      {/* ── page header ─────────────────────────────────────────────── */}
      <div className="dash-ph">
        <div>
          <div className="lbl">// DASHBOARD</div>
          <div className="big">
            {fmtCost(slice.cost)} <span style={{ fontSize: 13, color: "var(--text-faint)", marginLeft: 4 }}>spent · {range}</span>
          </div>
          <div className="sub">
            <b>{slice.total}</b> missions · <b>{counts.running}</b> running · <b>{activeAgents}</b> agents actifs
          </div>
        </div>
        <div className="right">
          <div className="seg">
            {(["24h", "7d", "30d"] as RangeKey[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={range === r ? "on" : ""}>{r}</button>
            ))}
          </div>
          <div className="live-pill"><span className="d" />live · 10s</div>
        </div>
      </div>

      {/* ── KPI strip (5-up) ────────────────────────────────────────── */}
      <div className="kpi-row">
        <div className="kpi accent">
          <div className="k">Total spend</div>
          <div className="v">{fmtCost(slice.cost)}</div>
          <div className="d">
            <span className="label">cap</span>
            <span className="warn">{fmtCost(COST_CAP)}</span>
          </div>
          <MiniSpark data={sparkData} max={Math.max(...sparkData, 0.01)} />
        </div>

        <div className="kpi">
          <div className="k">Missions</div>
          <div className="v">{slice.total}</div>
          <div className="d">
            <span className="ok">{slice.done}</span>
            <span className="label">done</span>
            <span className="down">{slice.failed}</span>
            <span className="label">fail</span>
          </div>
        </div>

        <div className="kpi">
          <div className="k">Success rate</div>
          <div className="v">{successRate}<span className="u">%</span></div>
          <div className="d">
            <span className={successRate >= 80 ? "ok" : "warn"}>{successRate >= 80 ? "▲ healthy" : "▼ check fails"}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="k">Tokens</div>
          <div className="v">{fmtTokens(slice.tokens)}</div>
          <div className="d">
            <span className="label">in</span>
            <span>{fmtTokens(counts.total_tokens_in)}</span>
            <span className="label">·</span>
            <span className="label">out</span>
            <span>{fmtTokens(counts.total_tokens_out)}</span>
          </div>
        </div>

        <div className="kpi">
          <div className="k">Running</div>
          <div className="v">{counts.running}</div>
          <div className="d">
            <span className="label">live</span>
            <span className="ok">● {activeAgents} agents</span>
          </div>
        </div>
      </div>

      {/* ── row: spend chart (left) + mission funnel (right) ────────── */}
      <div className="row-2">
        <div className="dcard">
          <div className="dcard-hd">
            <div>
              <div className="t">// Spend</div>
              <div className="h">{view === "cost" ? "Daily cost ($)" : view === "missions" ? "Missions per day" : "Tokens per day"}</div>
            </div>
            <div className="right">
              <div className="seg">
                {(["cost", "missions", "tokens"] as ChartView[]).map((v) => (
                  <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="dcard-bd" style={{ paddingTop: 4 }}>
            <ResponsiveContainer width="100%" height={220}>
              {view === "cost" ? (
                <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E07A5F" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#E07A5F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtCost(v)} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmtCost(Number(v)), "spend"]} />
                  <Area type="monotone" dataKey="cost" stroke="#E07A5F" strokeWidth={1.8} fill="url(#gradCost)" dot={false} />
                </AreaChart>
              ) : view === "missions" ? (
                <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDone" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8be38b" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#8be38b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="done" stroke="#8be38b" strokeWidth={1.8} fill="url(#gradDone)" dot={false} />
                  <Area type="monotone" dataKey="failed" stroke="#e26d6d" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 2" />
                </AreaChart>
              ) : (
                <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7ec5ff" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#7ec5ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E07A5F" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#E07A5F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "var(--text-faint)", fontSize: 10, fontFamily: "var(--font-mono, monospace)" }} tickLine={false} axisLine={false} tickFormatter={fmtTokens} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [fmtTokens(Number(v)), ""]} />
                  <Area type="monotone" dataKey="tokens_in" stroke="#7ec5ff" strokeWidth={1.8} fill="url(#gradIn)" dot={false} />
                  <Area type="monotone" dataKey="tokens_out" stroke="#E07A5F" strokeWidth={1.8} fill="url(#gradOut)" dot={false} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* mission funnel */}
        <div className="dcard">
          <div className="dcard-hd">
            <div>
              <div className="t">// Funnel</div>
              <div className="h">Mission outcomes</div>
            </div>
            <div className="right">all time</div>
          </div>
          <div className="dcard-bd">
            <div className="funnel">
              {funnel.map((r) => (
                <div key={r.key} className={`fn-row ${r.kind}`}>
                  <span className="lbl">{r.label}</span>
                  <div className="track">
                    <i style={{ width: `${(r.n / funnelMax) * 100}%` }}>{r.n > 0 ? r.n : ""}</i>
                  </div>
                  <span className="ct">{r.n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── row: top agents (bars) + traces table ───────────────────── */}
      <div className="row-2">
        <div className="dcard">
          <div className="dcard-hd">
            <div>
              <div className="t">// Agents</div>
              <div className="h">Top by spend</div>
            </div>
            <div className="right">{byAgent.length} configured</div>
          </div>
          <div className="dcard-bd">
            {topAgents.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No agent activity yet.</div>
            ) : (
              <div className="bar-list">
                {topAgents.map((a) => (
                  <div key={a.agent_id} className="br-row">
                    <div className="top">
                      <span className="nm">{a.agent_id}</span>
                      <span className="ct">{fmtCost(a.cost)} · {a.done}/{a.total}</span>
                    </div>
                    <div className="bar"><i style={{ width: `${Math.max(2, (a.cost / agentMax) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dcard">
          <div className="dcard-hd">
            <div>
              <div className="t">// Traces</div>
              <div className="h">Recent missions</div>
            </div>
            <div className="right">
              <Link href="/missions" style={{ color: "var(--text-faint)", textDecoration: "none" }}>view all →</Link>
            </div>
          </div>
          <div className="dcard-bd" style={{ padding: 12 }}>
            <div className="traces">
              <div className="tr-row head">
                <span>id</span><span /><span>title</span>
                <span style={{ textAlign: "right" }}>tokens</span>
                <span style={{ textAlign: "right" }}>cost</span>
                <span style={{ textAlign: "right" }}>status</span>
              </div>
              {recent.slice(0, 8).map((m) => (
                <div key={m.id} className="tr-row">
                  <span className="id">{m.id.slice(0, 10)}</span>
                  <span className="g">{(m.agent_id ?? "?").charAt(0).toUpperCase()}</span>
                  <Link href={`/missions`} className="title">{m.title}</Link>
                  <span className="met">{fmtTokens(m.tokens_in + m.tokens_out)}</span>
                  <span className="met">{fmtCost(m.cost_usd)}</span>
                  <span className={`st ${STATUS_CLS[m.status] ?? ""}`}>{m.status}</span>
                </div>
              ))}
              {recent.length === 0 && (
                <div className="tr-row" style={{ color: "var(--text-faint)", justifyContent: "center", gridTemplateColumns: "1fr", textAlign: "center" }}>
                  <span>No traces yet.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* deep links */}
      <div className="deep-links">
        <Link href="/missions">missions <span>→</span></Link>
        <Link href="/kanban">board <span>→</span></Link>
        <Link href="/routines">routines <span>→</span></Link>
        <Link href="/visualizer">mesh <span>→</span></Link>
        <Link href="/agents">agents <span>→</span></Link>
      </div>
    </div>
  );
}
