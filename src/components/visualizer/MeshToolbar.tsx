"use client";

import { useState } from "react";
import type { AgentConfig } from "@/lib/mock-data";

// ─── Sub-component: New agent dialog (with parent selector) ──────────────────

interface Draft {
  id: string;
  name: string;
  model: string;
  permissionMode: AgentConfig["permissionMode"];
  systemPrompt: string;
  cwd: string;
  allowedTools: string;
  parent: string;
}

function makeDraft(parent: string): Draft {
  return {
    id: "",
    name: "",
    model: "claude-sonnet-4-6",
    permissionMode: "auto",
    systemPrompt: "",
    cwd: "~",
    allowedTools: "Bash, Read, Edit, Write",
    parent,
  };
}

function AddAgentDialog({
  parents,
  defaultParent,
  onClose,
  onCreated,
}: {
  parents: AgentConfig[];
  defaultParent: string;
  onClose: () => void;
  onCreated: (cfg: AgentConfig) => void;
}) {
  const [draft, setDraft] = useState<Draft>(makeDraft(defaultParent));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!draft.id.trim()) { setError("id required"); return; }
    if (!/^[a-zA-Z0-9_-]+$/.test(draft.id)) { setError("id must be alphanumeric / _ / -"); return; }
    setSubmitting(true);
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: draft.id.trim(),
        name: draft.name.trim() || draft.id.trim(),
        model: draft.model,
        permissionMode: draft.permissionMode,
        systemPrompt: draft.systemPrompt,
        cwd: draft.cwd.trim() || "~",
        allowedTools: draft.allowedTools.split(",").map((s) => s.trim()).filter(Boolean),
        parent: draft.parent || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? `HTTP ${res.status}`);
      return;
    }
    onCreated((await res.json()) as AgentConfig);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxHeight: "85vh", overflowY: "auto",
          background: "var(--bg-elev)", border: "1px solid var(--line-strong)",
          borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {draft.parent ? `Nouveau sous-agent de « ${draft.parent} »` : "Nouvel agent"}
          </h2>
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>×</button>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Agent parent</div>
          <select className="input mono" value={draft.parent} onChange={(e) => set("parent", e.target.value)}>
            <option value="">— racine (aucun parent) —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
            ))}
          </select>
          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
            Choisis un parent pour créer un sous-agent rattaché dans le mesh.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>ID (filesystem-safe)</div>
          <input className="input mono" placeholder="e.g. forge" value={draft.id}
            onChange={(e) => set("id", e.target.value)} autoFocus />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Nom affiché</div>
          <input className="input" placeholder="(défaut: id)" value={draft.name}
            onChange={(e) => set("name", e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Modèle</div>
          <select className="input" value={draft.model} onChange={(e) => set("model", e.target.value)}>
            {["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Permission mode</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["auto", "acceptEdits", "plan", "bypassPermissions"] as const).map((m) => (
              <button key={m} className={`btn${draft.permissionMode === m ? "" : " secondary"}`}
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => set("permissionMode", m)}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Working directory</div>
          <input className="input mono" placeholder="~" value={draft.cwd}
            onChange={(e) => set("cwd", e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Outils autorisés</div>
          <input className="input mono" placeholder="Bash, Read, Edit, Write" value={draft.allowedTools}
            onChange={(e) => set("allowedTools", e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>System prompt</div>
          <textarea className="input" rows={5} value={draft.systemPrompt}
            onChange={(e) => set("systemPrompt", e.target.value)}
            style={{ resize: "vertical", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }} />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "var(--err)", padding: "6px 10px", background: "var(--err-soft)", borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={submit} disabled={submitting || !draft.id.trim()} style={{ flex: 1 }}>
            {submitting ? "Création…" : "Créer l'agent"}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={submitting}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-component: Run task dialog ──────────────────────────────────────────

function RunTaskDialog({
  agent,
  onClose,
  onSpawned,
}: {
  agent: AgentConfig;
  onClose: () => void;
  onSpawned: (missionId: string) => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/agents/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: agent.id, mission: text.trim() }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `HTTP ${res.status}`);
      return;
    }
    const j = (await res.json()) as { mission_id: string };
    onSpawned(j.mission_id);
  };

  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        backdropFilter: "blur(4px)",
      }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, background: "var(--bg-elev)", border: "1px solid var(--line-strong)",
          borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Lancer une tâche · <span className="mono" style={{ color: "var(--accent)" }}>{agent.name}</span>
          </h2>
          <button className="btn-ghost" onClick={onClose} disabled={submitting}>×</button>
        </div>
        <textarea
          className="input"
          autoFocus
          rows={5}
          placeholder="Décris la mission à lancer…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ resize: "vertical", fontSize: 13 }}
        />
        {error && (
          <div style={{ fontSize: 12, color: "var(--err)", padding: "6px 10px", background: "var(--err-soft)", borderRadius: 6 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={submit} disabled={submitting || !text.trim()} style={{ flex: 1 }}>
            {submitting ? "Lancement…" : "▶ Lancer"}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={submitting}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main MeshToolbar ────────────────────────────────────────────────────────

interface Props {
  selectedAgent: AgentConfig | null;
  mosAgents: AgentConfig[];
  onAgentCreated: (cfg: AgentConfig) => void;
  onAgentRemoved: (id: string) => void;
  onMissionSpawned?: (missionId: string) => void;
}

export default function MeshToolbar({
  selectedAgent,
  mosAgents,
  onAgentCreated,
  onAgentRemoved,
  onMissionSpawned,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isMosSelected = selectedAgent !== null && (selectedAgent.source === "orchestria" || !selectedAgent.source);
  const isReadOnlySelected = selectedAgent !== null && (selectedAgent.source === "skill" || selectedAgent.source === "agent");

  const remove = async () => {
    if (!selectedAgent) return;
    setRemoving(true);
    const res = await fetch(`/api/agents/${selectedAgent.id}`, { method: "DELETE" });
    setRemoving(false);
    setConfirmRemove(false);
    if (res.ok) onAgentRemoved(selectedAgent.id);
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 280, // au-dessus de la console (h=248 + offset 16) — aligné avec .zoom + .legend
          transform: "translateX(-50%)",
          zIndex: 30,
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(20,20,20,0.85)",
          border: "1px solid var(--line-strong)",
          borderRadius: 10,
          backdropFilter: "blur(8px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          alignItems: "center",
        }}
      >
        {selectedAgent && (
          <div style={{ paddingRight: 8, marginRight: 4, borderRight: "1px solid var(--border)" }}>
            <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: "0.06em" }}>SÉLECTION</div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: "#E07A5F" }}>
              {selectedAgent.name}
            </div>
          </div>
        )}

        <button
          onClick={() => setShowRun(true)}
          disabled={!isMosSelected}
          title={!selectedAgent ? "Sélectionne un agent" : isReadOnlySelected ? "Skills/agents Claude non lançables" : "Lancer une mission"}
          style={{
            background: isMosSelected ? "var(--accent)" : "transparent",
            color: isMosSelected ? "#0a0a0a" : "var(--text-faint)",
            border: isMosSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: isMosSelected ? "pointer" : "not-allowed",
            letterSpacing: "0.04em",
          }}
        >
          ▶ RUN TASK
        </button>

        <button
          onClick={() => setShowAdd(true)}
          style={{
            background: "transparent",
            color: "var(--text-dim)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          + ADD AGENT
        </button>

        {!confirmRemove ? (
          <button
            onClick={() => setConfirmRemove(true)}
            disabled={!isMosSelected}
            title={
              !selectedAgent ? "Sélectionne un agent" :
              isReadOnlySelected ? "Skills/agents Claude non supprimables" :
              "Supprimer cet agent"
            }
            style={{
              background: "transparent",
              color: isMosSelected ? "var(--err)" : "var(--text-faint)",
              border: `1px solid ${isMosSelected ? "var(--err)" : "var(--border)"}`,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              cursor: isMosSelected ? "pointer" : "not-allowed",
              letterSpacing: "0.04em",
            }}
          >
            × REMOVE
          </button>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--err)" }}>Confirmer ?</span>
            <button onClick={remove} disabled={removing}
              style={{
                background: "var(--err)", color: "#fff", border: "1px solid var(--err)",
                borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
              }}>
              {removing ? "…" : "Oui"}
            </button>
            <button onClick={() => setConfirmRemove(false)}
              style={{
                background: "transparent", color: "var(--text-faint)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
              }}>
              Non
            </button>
          </div>
        )}
      </div>

      {showAdd && (
        <AddAgentDialog
          parents={mosAgents}
          defaultParent={isMosSelected ? selectedAgent!.id : ""}
          onClose={() => setShowAdd(false)}
          onCreated={(cfg) => {
            onAgentCreated(cfg);
            setShowAdd(false);
          }}
        />
      )}

      {showRun && selectedAgent && (
        <RunTaskDialog
          agent={selectedAgent}
          onClose={() => setShowRun(false)}
          onSpawned={(mid) => {
            onMissionSpawned?.(mid);
            setShowRun(false);
          }}
        />
      )}
    </>
  );
}
