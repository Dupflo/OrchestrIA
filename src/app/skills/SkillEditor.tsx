"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

type SkillCategory = "dev" | "content" | "ops" | "life";
type SkillSource = "project" | "claude-global" | "claude-project";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  agents: string[];
  enabled: boolean;
  code?: string;
  source: SkillSource;
}

interface SkillDetail extends Skill { content?: string }

const CATEGORIES: { id: SkillCategory; label: string }[] = [
  { id: "dev",     label: "DEV" },
  { id: "content", label: "CONTENT" },
  { id: "ops",     label: "OPS" },
  { id: "life",    label: "LIFE" },
];

export default function SkillEditor({
  id, source = "project", isNew = false, onCreated, onDeleted,
}: {
  id: string;
  source?: SkillSource;
  isNew?: boolean;
  onCreated?: (newId: string) => void;
  onDeleted?: () => void;
}) {
  const isReadOnly = !isNew && source !== "project";

  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [newId, setNewId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SkillCategory>("dev");
  const [enabled, setEnabled] = useState(true);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) {
      setSkill(null); setLoading(false); setError(null);
      setNewId(""); setName(""); setDescription(""); setCategory("dev");
      setEnabled(true); setCode("");
      return;
    }
    setLoading(true); setError(null);
    fetch(`/api/skills/${id}?source=${source}`)
      .then((r) => r.json())
      .then((data: SkillDetail | { error?: string }) => {
        if ((data as { error?: string }).error) {
          setError("Skill introuvable.");
          return;
        }
        const s = data as SkillDetail;
        setSkill(s);
        setName(s.name);
        setDescription(s.description);
        setCategory(s.category);
        setEnabled(s.enabled);
        setCode(s.code ?? s.content ?? "");
      })
      .catch(() => setError("Impossible de charger le skill"))
      .finally(() => setLoading(false));
  }, [id, source, isNew]);

  const dirty = useMemo(() => {
    if (isNew) return newId.trim().length > 0;
    if (!skill) return false;
    return (
      name !== skill.name ||
      description !== skill.description ||
      category !== skill.category ||
      enabled !== skill.enabled ||
      code !== (skill.code ?? "")
    );
  }, [isNew, newId, skill, name, description, category, enabled, code]);

  const reset = () => {
    if (isNew) {
      setNewId(""); setName(""); setDescription(""); setCategory("dev");
      setEnabled(true); setCode(""); setError(null);
      return;
    }
    if (!skill) return;
    setName(skill.name); setDescription(skill.description);
    setCategory(skill.category); setEnabled(skill.enabled);
    setCode(skill.code ?? "");
  };

  const save = async () => {
    setSaving(true); setError(null);
    if (isNew) {
      const cleanId = newId.trim();
      if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
        setSaving(false);
        setError("id requis : alphanumeric / _ / -");
        return;
      }
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cleanId, name: name.trim() || cleanId,
          description: description.trim(), category, enabled, code,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? `HTTP ${res.status}`);
        return;
      }
      const created = (await res.json()) as Skill;
      onCreated?.(created.id);
      return;
    }
    const res = await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, category, enabled, code }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `HTTP ${res.status}`);
      return;
    }
    const updated = (await res.json()) as SkillDetail;
    setSkill(updated);
    setSavedAt(Date.now());
  };

  const remove = async () => {
    const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
    if (res.ok) onDeleted?.();
    else { setConfirmDelete(false); setError("Suppression échouée"); }
  };

  if (loading) return <div className="center-state">loading…</div>;
  if (error && !skill && !isNew) return <div className="center-state err">{error}</div>;

  const codeLines = code.split("\n").length;
  const codeChars = code.length;
  const saveLabel = saving ? (isNew ? "creating…" : "saving…")
    : dirty ? (isNew ? "ready to create" : "unsaved changes")
    : savedAt ? `all changes saved · ${new Date(savedAt).toTimeString().slice(0, 5)}`
    : isNew ? "fill in an id to create" : "no changes";

  // ── Helpers to extract frontmatter from SKILL.md content ───────────────────
  const parsedFm = useMemo(() => {
    if (!code) return { body: code, tools: [] as string[] };
    const fmMatch = code.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) return { body: code, tools: [] as string[] };
    const block = fmMatch[1];
    const body = fmMatch[2].trim();

    // allowed-tools: list
    const toolsMatch = block.match(/^allowed-tools:\s*\n((?:[ \t]+-[ \t]+.+\n?)+)/m);
    const tools = toolsMatch
      ? toolsMatch[1].split("\n").map((l) => l.replace(/^\s+-\s*/, "").trim()).filter(Boolean)
      : [];

    return { body, tools };
  }, [code]);

  // ── claude-* skills are read-only: improved display ─────────────────────────
  if (isReadOnly && skill) {
    const basePath = source === "claude-global" ? "~/.claude/skills/" : ".claude/skills/";
    return (
      <div className="edit-root">
        <header className="edit-hd">
          <div className="glyph-lg" style={{ borderColor: "rgba(200,156,255,0.4)", color: "#c89cff" }}>
            {skill.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1>{skill.name}</h1>
            <div className="breadcrumb">
              <span className="crumb">skills</span><span>/</span>
              <span className="crumb">{basePath}</span>
              <span className="crumb active">{skill.id}</span>
            </div>
          </div>
          <div className="edit-hd-actions">
            <span style={{
              fontFamily: "var(--font-mono, monospace)", fontSize: 10, padding: "4px 10px",
              borderRadius: 4, background: "rgba(200,156,255,0.08)",
              border: "1px solid rgba(200,156,255,0.3)", color: "#c89cff", letterSpacing: "0.04em",
            }}>
              READ ONLY · NATIVE
            </span>
          </div>
        </header>

        <div className="edit-body" style={{ flexDirection: "column", gap: 0 }}>
          {/* Metadata strip */}
          <div style={{
            display: "flex", flexDirection: "column", gap: 10,
            padding: "16px 24px", borderBottom: "1px solid var(--line)",
            background: "var(--bg-elev)",
          }}>
            {/* Invocation */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>INVOCATION</span>
                <code style={{
                  fontFamily: "var(--font-mono, monospace)", fontSize: 12, padding: "2px 8px",
                  background: "var(--accent-soft)", border: "1px solid var(--accent-line)",
                  borderRadius: 4, color: "var(--accent)",
                }}>/{skill.id}</code>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>SOURCE</span>
                <code style={{
                  fontFamily: "var(--font-mono, monospace)", fontSize: 11, padding: "2px 8px",
                  background: "rgba(200,156,255,0.06)", border: "1px solid rgba(200,156,255,0.2)",
                  borderRadius: 4, color: "#c89cff",
                }}>{basePath}{skill.id}/SKILL.md</code>
              </div>
            </div>

            {/* Description */}
            {skill.description && (
              <div style={{
                padding: "8px 12px", background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--line)", borderRadius: 6,
                fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6,
              }}>
                {skill.description}
              </div>
            )}

            {/* Allowed tools */}
            {parsedFm.tools.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "var(--text-faint)", letterSpacing: "0.06em" }}>TOOLS</span>
                {parsedFm.tools.map((t) => (
                  <span key={t} style={{
                    fontFamily: "var(--font-mono, monospace)", fontSize: 10, padding: "2px 8px",
                    background: "rgba(139,227,139,0.08)", border: "1px solid rgba(139,227,139,0.25)",
                    borderRadius: 3, color: "var(--ok)",
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Skill body content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
            <div className="hd" style={{ marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
              <div>
                <div className="lbl">// SKILL BODY</div>
                <div className="sub">{codeLines} lines · {code.length} chars</div>
              </div>
            </div>
            <div className="output-md" style={{ fontSize: 13, lineHeight: 1.7 }}>
              {parsedFm.body
                ? <ReactMarkdown>{parsedFm.body}</ReactMarkdown>
                : <span style={{ color: "var(--text-faint)" }}>(no content)</span>
              }
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-root">
      <header className="edit-hd">
        <div className="glyph-lg">S</div>
        <div>
          <h1>{isNew ? (newId || "new-skill") : (skill?.name ?? "")}</h1>
          <div className="breadcrumb">
            <span className="crumb">skills</span><span>/</span>
            {isNew ? (
              <span className="crumb active" style={{ color: "var(--accent)" }}>new skill</span>
            ) : (
              <>
                <span className="crumb">project</span><span>/</span>
                <span className="crumb active">{skill?.id}</span>
              </>
            )}
          </div>
        </div>
        <div className="edit-hd-actions">
          {!isNew && !confirmDelete && (
            <button className="btn btn-ghost btn-sm btn-delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          {!isNew && confirmDelete && (
            <>
              <span style={{ fontSize: 11, color: "var(--err)" }}>Confirm?</span>
              <button className="btn btn-sm" style={{ background: "var(--err)", color: "#fff", borderColor: "var(--err)" }} onClick={remove}>Yes, delete</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          )}
        </div>
      </header>

      <div className="edit-body">
        {/* left: code/markdown body */}
        <div className="claude-pane">
          <div className="hd">
            <div>
              <div className="lbl">// SKILL BODY</div>
              <div className="sub">Markdown / shell template. Loaded by agents when the skill is invoked.</div>
            </div>
            <div className="count">{codeLines} lines · {codeChars} chars</div>
          </div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
            placeholder={`# ${newId || "skill"}\n\nWrite the skill instructions here…`} />
        </div>

        {/* right: identity + meta */}
        <aside className="config-pane scroll">
          <section className="section">
            <div className="section-hd">
              <div className="section-hd-left">
                <span className="num">01</span>
                <span className="section-title">Identity</span>
              </div>
              <span className="section-hd-sub">how it&apos;s invoked</span>
            </div>
            {isNew && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label className="field-label">ID <span style={{ color: "var(--text-faint)", textTransform: "lowercase", letterSpacing: 0 }}>filesystem-safe · immuable</span></label>
                <input className="input mono" autoFocus placeholder="e.g. pr-create"
                  value={newId} onChange={(e) => setNewId(e.target.value)} />
                <div className="field-hint">stored in <code>.orchestria/skills/&lt;id&gt;/skill.json</code>. Invoked via <code>/&lt;id&gt;</code> in chat.</div>
              </div>
            )}
            <div className="field" style={{ marginBottom: 14 }}>
              <label className="field-label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={isNew ? "(défaut: id)" : ""} />
            </div>
            <div className="field">
              <label className="field-label">Description</label>
              <textarea className="textarea" rows={3} value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this skill do?" />
            </div>
          </section>

          <section className="section">
            <div className="section-hd">
              <div className="section-hd-left">
                <span className="num">02</span>
                <span className="section-title">Category</span>
              </div>
            </div>
            <div className="pill-row cols-4">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={`pill${category === c.id ? " on" : ""}`} onClick={() => setCategory(c.id)}>
                  <span className="lbl">{c.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-hd">
              <div className="section-hd-left">
                <span className="num">03</span>
                <span className="section-title">Enabled</span>
              </div>
            </div>
            <label className="flex-row" style={{ cursor: "pointer", padding: "10px 12px", background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 8 }}>
              <span className={`toggle${enabled ? " on" : ""}`} onClick={() => setEnabled(!enabled)}><span className="knob" /></span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {enabled ? "Active — discoverable in slash menu" : "Disabled — hidden from agents"}
              </span>
            </label>
          </section>

          {dirty && <div className="dirty-alert">⚠ changes pending — SAVE to apply</div>}
        </aside>
      </div>

      <div className="edit-footer">
        <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
          {isNew ? "Create skill" : "Save"}
        </button>
        <button className="btn btn-ghost" onClick={reset} disabled={!dirty || saving}>Reset</button>
        <div className={`save-status${dirty || saving ? "" : " saved"}${error ? " error" : ""}`}>
          <span className="d" />
          <span>{error ?? saveLabel}</span>
        </div>
      </div>
    </div>
  );
}
