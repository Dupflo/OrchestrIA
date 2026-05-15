"use client";

import { useEffect, useState } from "react";
import type { AgentConfig } from "@/lib/mock-data";
import type { RoutineWithStats } from "@/lib/routines/repo";
import { describeCron } from "@/lib/routines/cron";

// ─── Status helpers ──────────────────────────────────────────────────────────

interface ChannelInfo { name: string; type: string }

type RoutineStatus = "running" | "last_failed" | "scheduled" | "paused" | "never_run";

function deriveStatus(r: RoutineWithStats): RoutineStatus {
  if (r.paused) return "paused";
  if (r.running) return "running";
  if (r.last_status === "failed") return "last_failed";
  if (r.last_run_ts) return "scheduled";
  return "scheduled";
}

const STATUS_LABEL: Record<RoutineStatus, string> = {
  running: "RUNNING",
  last_failed: "LAST FAILED",
  scheduled: "SCHEDULED",
  paused: "PAUSED",
  never_run: "SCHEDULED",
};

const STATUS_COLOR: Record<RoutineStatus, string> = {
  running: "#34d399",
  last_failed: "#e26d6d",
  scheduled: "#9a9a93",
  paused: "#5a5a55",
  never_run: "#9a9a93",
};

function fmtDelta(sec: number): string {
  const abs = Math.abs(sec);
  if (abs < 60) return `${abs}s`;
  if (abs < 3600) return `${Math.round(abs / 60)}m`;
  if (abs < 86400) {
    const h = Math.floor(abs / 3600);
    const m = Math.round((abs % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(abs / 86400);
  const h = Math.round((abs % 86400) / 3600);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

function fmtNext(nextSec: number | null): string {
  if (!nextSec) return "paused";
  const delta = nextSec - Math.floor(Date.now() / 1000);
  return delta <= 0 ? "now" : `in ${fmtDelta(delta)}`;
}

function fmtLast(lastSec: number | null): string {
  if (!lastSec) return "—";
  const delta = Math.floor(Date.now() / 1000) - lastSec;
  return `${fmtDelta(delta)} ago`;
}

const fmtCost = (v: number) => v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;

// ─── Routine card ────────────────────────────────────────────────────────────

function RoutineCard({ r, onRun, onEdit }: {
  r: RoutineWithStats;
  onRun: () => void;
  onEdit: () => void;
}) {
  const status = deriveStatus(r);
  const color = STATUS_COLOR[status];
  const isPaused = status === "paused";
  const isFailed = status === "last_failed";
  const isRunning = status === "running";
  const notifyOn = r.notify_on ?? "failure";

  return (
    <div className="os-card" style={{
      borderColor: isFailed ? "rgba(226,109,109,0.5)" : isRunning ? "rgba(52,211,153,0.5)" : undefined,
      opacity: isPaused ? 0.55 : 1,
      position: "relative",
      transition: "border-color .2s",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, letterSpacing: "0.06em" }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase" }}>{r.id}</span>
            <span style={{ color: "var(--text-faint)", fontSize: 10 }}>·</span>
            <span style={{ fontSize: 10, color, fontWeight: 600 }}>{STATUS_LABEL[status]}</span>
            {isRunning && (
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: color, boxShadow: `0 0 8px ${color}`,
                animation: "pulse 1.4s infinite",
              }} />
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onRun} title="Run now"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text-dim)", padding: "4px 10px", fontSize: 12, cursor: "pointer",
            }}>▶</button>
          <button onClick={onEdit} title="Edit"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 6,
              color: "var(--text-dim)", padding: "4px 10px", fontSize: 12, cursor: "pointer",
            }}>···</button>
        </div>
      </div>

      {/* cron line */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="mono" style={{
          background: "rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 4,
          fontSize: 11, color: "var(--text-dim)",
        }}>{r.cron_expr}</span>
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic" }}>
          {describeCron(r.cron_expr)}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-faint)" }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: "#E07A5F",
          }} />
          <span className="mono">{r.agent_id}</span>
        </span>
        {r.skill_ref && (
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            border: "1px solid #a78bfa", color: "#a78bfa",
            fontFamily: "var(--font-mono, monospace)",
          }}>{r.skill_ref}</span>
        )}
      </div>

      {/* description */}
      {r.description && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45, marginBottom: 12 }}>
          {r.description}
        </div>
      )}

      {/* stats grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8, padding: "10px 0 4px",
        borderTop: "1px solid var(--border)",
      }}>
        <Stat label="NEXT" value={isPaused ? "paused" : fmtNext(r.next_run_ts)} dim={isPaused} />
        <Stat label="LAST" value={fmtLast(r.last_run_ts)} highlight={isFailed ? "err" : null} />
        <Stat label="RUNS MTD" value={String(r.runs_mtd)} />
        <Stat label="COST MTD" value={fmtCost(r.cost_mtd)} />
      </div>

      {/* notify chip */}
      {notifyOn !== "never" && (
        <div style={{
          marginTop: 8, display: "flex", justifyContent: "flex-end",
        }}>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 4,
            border: "1px solid var(--border)", color: "var(--text-faint)",
            letterSpacing: "0.06em",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ color: "var(--text-dim)" }}>◇</span>
            NOTIFY · {notifyOn.toUpperCase()}
            {r.notify_channel ? ` · ${String(r.notify_channel).toUpperCase()}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, dim }: { label: string; value: string; highlight?: "err" | null; dim?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "0.07em", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{
        fontSize: 12,
        color: highlight === "err" ? "#e26d6d" : dim ? "var(--text-faint)" : "var(--text)",
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Editor dialog ───────────────────────────────────────────────────────────

interface DraftRoutine {
  id: string;
  name: string;
  description: string;
  cron_expr: string;
  agent_id: string;
  prompt: string;
  skill_ref: string;
  notify_on: "always" | "failure" | "never";
  notify_channel: string;
  target_chat_ids: number[]; // empty = broadcast to all subscribers
  paused: boolean;
}

interface SubscriberInfo {
  chat_id: number;
  username?: string;
  first_name?: string;
  message_count: number;
}

function EditorDialog({
  initial,
  isNew,
  agents,
  channels,
  subscribers,
  onClose,
  onSaved,
  onDeleted,
}: {
  initial: DraftRoutine;
  isNew: boolean;
  agents: AgentConfig[];
  channels: ChannelInfo[];
  subscribers: Record<string, SubscriberInfo[]>;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [draft, setDraft] = useState<DraftRoutine>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof DraftRoutine>(k: K, v: DraftRoutine[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    setError(null);
    if (isNew && !/^[a-zA-Z0-9_-]+$/.test(draft.id)) {
      setError("id doit être alphanumeric / _ / -"); return;
    }
    if (!draft.name.trim() || !draft.cron_expr.trim() || !draft.agent_id || !draft.prompt.trim()) {
      setError("name, cron_expr, agent et prompt requis"); return;
    }
    setSubmitting(true);
    const payload = {
      id: draft.id,
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      cron_expr: draft.cron_expr.trim(),
      agent_id: draft.agent_id,
      prompt: draft.prompt.trim(),
      skill_ref: draft.skill_ref.trim() || undefined,
      notify_on: draft.notify_on,
      notify_channel: draft.notify_channel || undefined,
      target_chat_ids: draft.target_chat_ids,
      paused: draft.paused,
    };
    const res = isNew
      ? await fetch("/api/routines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`/api/routines/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSubmitting(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `HTTP ${res.status}`); return;
    }
    onSaved();
  };

  const remove = async () => {
    await fetch(`/api/routines/${draft.id}`, { method: "DELETE" });
    onDeleted?.();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card w-lg" style={{ gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{isNew ? "Nouvelle routine" : `Éditer ${draft.id}`}</h2>
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>×</button>
        </div>

        {isNew && (
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>ID</div>
            <input className="input mono" placeholder="e.g. morning-brief" value={draft.id}
              onChange={(e) => set("id", e.target.value)} autoFocus />
          </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Nom</div>
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Description</div>
          <input className="input" value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Cron (5 champs)</div>
            <input className="input mono" placeholder="0 8 * * 1-5" value={draft.cron_expr}
              onChange={(e) => set("cron_expr", e.target.value)} />
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, fontStyle: "italic" }}>
              {draft.cron_expr ? describeCron(draft.cron_expr) : "min hour dom month dow"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Agent</div>
            <select className="input mono" value={draft.agent_id} onChange={(e) => set("agent_id", e.target.value)}>
              <option value="">— choisir —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
            </select>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Prompt / mission</div>
          <textarea className="input" rows={4} value={draft.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            style={{ resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }} />
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Skill (optionnel, sera préfixé au prompt)</div>
          <input className="input mono" placeholder="/papers" value={draft.skill_ref}
            onChange={(e) => set("skill_ref", e.target.value)} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Notify on</div>
            <div style={{ display: "flex", gap: 4 }}>
              {(["always", "failure", "never"] as const).map((m) => (
                <button key={m} className={`btn${draft.notify_on === m ? "" : " secondary"}`}
                  style={{ fontSize: 11, padding: "3px 8px", flex: 1 }}
                  onClick={() => set("notify_on", m)}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Channel</div>
            <select className="input mono" value={draft.notify_channel}
              onChange={(e) => set("notify_channel", e.target.value)}
              disabled={draft.notify_on === "never"}>
              <option value="">— aucun —</option>
              {channels.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
            </select>
          </div>
        </div>

        {/* Per-routine recipient picker — only relevant when a channel is selected */}
        {draft.notify_on !== "never" && draft.notify_channel && (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Chats destinataires</span>
              <span style={{ fontSize: 10, color: "var(--text-faint)", fontStyle: "italic" }}>
                {draft.target_chat_ids.length === 0
                  ? "tous les subscribers"
                  : `${draft.target_chat_ids.length} sélectionné${draft.target_chat_ids.length > 1 ? "s" : ""}`}
              </span>
            </div>
            {(subscribers[draft.notify_channel] ?? []).length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-faint)", fontStyle: "italic", padding: "4px 0" }}>
                Aucun subscriber connu — envoie un message au bot pour t&apos;enregistrer.
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(subscribers[draft.notify_channel] ?? []).map((s) => {
                  const on = draft.target_chat_ids.includes(s.chat_id);
                  return (
                    <button
                      key={s.chat_id}
                      type="button"
                      onClick={() => {
                        const next = on
                          ? draft.target_chat_ids.filter((id) => id !== s.chat_id)
                          : [...draft.target_chat_ids, s.chat_id];
                        set("target_chat_ids", next);
                      }}
                      style={{
                        padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                        background: on ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${on ? "rgba(52,211,153,0.4)" : "var(--border)"}`,
                        color: on ? "#34d399" : "var(--text-dim)",
                        fontSize: 11, fontFamily: "var(--font-mono, monospace)",
                        display: "inline-flex", alignItems: "center", gap: 6,
                      }}>
                      <span>{on ? "✓" : "+"}</span>
                      <span>{s.first_name ?? s.username ?? s.chat_id}</span>
                      <span style={{ opacity: 0.5, fontSize: 9 }}>{s.chat_id}</span>
                    </button>
                  );
                })}
                {draft.target_chat_ids.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set("target_chat_ids", [])}
                    style={{
                      padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                      background: "transparent", border: "1px solid var(--border)",
                      color: "var(--text-faint)", fontSize: 11, fontFamily: "var(--font-mono, monospace)",
                    }}>
                    × tout déselectionner (broadcast)
                  </button>
                )}
              </div>
            )}
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, fontStyle: "italic" }}>
              Vide = broadcast à tous les subscribers. Sélectionne pour scoper à des chats précis.
            </div>
          </div>
        )}

        {!isNew && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-dim)" }}>
            <input type="checkbox" checked={draft.paused} onChange={(e) => set("paused", e.target.checked)} />
            Mettre en pause (ne s&apos;exécute plus automatiquement)
          </label>
        )}

        {error && (
          <div className="err-banner">{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={submit} disabled={submitting} style={{ flex: 1 }}>
            {submitting ? "…" : isNew ? "Créer" : "Enregistrer"}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={submitting}>Annuler</button>
        </div>

        {!isNew && onDeleted && (
          !confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              style={{
                marginTop: 4, background: "transparent", border: "1px solid var(--err)", borderRadius: 6,
                color: "var(--err)", fontSize: 12, padding: "5px 0", cursor: "pointer", width: "100%",
              }}>
              Supprimer cette routine
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={remove}
                style={{
                  flex: 1, background: "var(--err)", border: "1px solid var(--err)", borderRadius: 6,
                  color: "#fff", fontSize: 12, padding: "5px 0", cursor: "pointer",
                }}>Confirmer la suppression</button>
              <button onClick={() => setConfirmDelete(false)}
                style={{
                  background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                  color: "var(--text-faint)", fontSize: 12, padding: "5px 12px", cursor: "pointer",
                }}>Annuler</button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

const EMPTY: DraftRoutine = {
  id: "", name: "", description: "", cron_expr: "0 8 * * 1-5",
  agent_id: "", prompt: "", skill_ref: "",
  notify_on: "failure", notify_channel: "", target_chat_ids: [], paused: false,
};

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<RoutineWithStats[]>([]);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [subscribers, setSubscribers] = useState<Record<string, SubscriberInfo[]>>({});
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ draft: DraftRoutine; isNew: boolean } | null>(null);

  const reload = async () => {
    const [rs, ags, chs] = await Promise.all([
      fetch("/api/routines").then((r) => r.json()),
      fetch("/api/agents").then((r) => r.json()),
      fetch("/api/channels").then((r) => r.json()),
    ]);
    setRoutines(rs);
    setAgents(ags);
    setChannels((chs.configured ?? []).map((c: { name: string; config: { type: string } }) => ({ name: c.name, type: c.config.type })));
    setSubscribers(chs.subscribers ?? {});
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, []);

  const runNow = async (id: string) => {
    await fetch(`/api/routines/${id}/run`, { method: "POST" });
    reload();
  };

  const openEdit = (r: RoutineWithStats) => {
    let target: number[] = [];
    const raw = (r as RoutineWithStats & { target_chat_ids?: string | null }).target_chat_ids;
    if (raw) { try { target = JSON.parse(raw) as number[]; } catch { /* ignore */ } }
    setEditor({
      draft: {
        id: r.id, name: r.name, description: r.description ?? "",
        cron_expr: r.cron_expr, agent_id: r.agent_id, prompt: r.prompt,
        skill_ref: r.skill_ref ?? "", notify_on: r.notify_on,
        notify_channel: r.notify_channel ?? "",
        target_chat_ids: target,
        paused: !!r.paused,
      },
      isNew: false,
    });
  };

  const total = routines.length;
  const active = routines.filter((r) => !r.paused).length;
  const running = routines.filter((r) => r.running).length;
  const nextRoutine = [...routines]
    .filter((r) => !r.paused && r.next_run_ts)
    .sort((a, b) => (a.next_run_ts ?? 0) - (b.next_run_ts ?? 0))[0];

  return (
    <div style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* breadcrumb header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, fontSize: 12 }}>
        <a href="/visualizer" style={{ color: "var(--text-faint)", textDecoration: "none" }}>← BACK · MESH</a>
        <span style={{ color: "var(--text-faint)" }}>/</span>
        <span className="mono" style={{ fontWeight: 600, letterSpacing: "0.06em" }}>ROUTINES.CRON</span>
        <span style={{ color: "var(--text-faint)", marginLeft: 12 }}>
          {loading ? "loading…" : `${active}/${total} active · ${running} running${nextRoutine?.next_run_ts ? ` · next ${fmtNext(nextRoutine.next_run_ts)}` : ""}`}
        </span>
        <button className="btn" onClick={() => setEditor({ draft: EMPTY, isNew: true })}
          style={{ marginLeft: "auto" }}>+ New routine</button>
      </div>

      {!loading && total === 0 ? (
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>Aucune routine pour le moment.</div>
          <div style={{ fontSize: 12 }}>Crée ton premier cron — par exemple un brief matinal à 08:00.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {routines.map((r) => (
            <RoutineCard key={r.id} r={r}
              onRun={() => runNow(r.id)}
              onEdit={() => openEdit(r)}
            />
          ))}
        </div>
      )}

      {editor && (
        <EditorDialog
          initial={editor.draft}
          isNew={editor.isNew}
          agents={agents}
          channels={channels}
          subscribers={subscribers}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); reload(); }}
          onDeleted={editor.isNew ? undefined : () => { setEditor(null); reload(); }}
        />
      )}
    </div>
  );
}
