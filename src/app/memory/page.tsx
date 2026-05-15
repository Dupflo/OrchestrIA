"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AgentConfig } from "@/lib/mock-data";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MemoryFile {
  name: string;
  size: string;
  bytes: number;
  modified: number;
}

type ViewMode = "split" | "raw" | "preview";

// ─── Inline icons ───────────────────────────────────────────────────────────

const ICO = {
  doc: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 2.5h7l4 4V17a.5.5 0 01-.5.5h-11A.5.5 0 014 17V3a.5.5 0 01.5-.5z" /><path d="M12 2.5V6h4" /></svg>,
  plus: <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>,
  trash: <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" /></svg>,
};

// ─── New file dialog ───────────────────────────────────────────────────────

function NewFileDialog({
  agent, onClose, onCreated,
}: { agent: string; onClose: () => void; onCreated: (filename: string) => void }) {
  const [name, setName] = useState("notes.md");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { setError("filename: letters, digits, . _ -"); return; }
    if (!name.endsWith(".md")) { setError("must end with .md"); return; }
    setSubmitting(true);
    const res = await fetch(`/api/memory/${agent}/${encodeURIComponent(name)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      setError(err.error ?? `HTTP ${res.status}`);
      return;
    }
    onCreated(name);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New memory file</h2>
        <div className="field">
          <label className="field-label">filename for <code>{agent}</code></label>
          <input className="input mono" autoFocus placeholder="e.g. decisions.md"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <div className="field-hint">Stored at <code>.orchestria/agents/{agent}/memory/{name}</code></div>
        </div>
        {error && <div className="err-banner">{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={submit} disabled={submitting} style={{ flex: 1 }}>
            {submitting ? "…" : "Create"}
          </button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [filesByAgent, setFilesByAgent] = useState<Record<string, MemoryFile[]>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>("split");

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((data: AgentConfig[]) => {
      // Only OrchestrIA agents (skills/native are read-only — not editable here)
      const mos = data.filter((a) => a.source === "orchestria" || !a.source);
      setAgents(mos);
      if (mos.length > 0 && !activeAgent) setActiveAgent(mos[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFiles = (agent: string) => {
    fetch(`/api/memory/${agent}`).then((r) => r.json()).then((data: MemoryFile[]) => {
      setFiles(data);
      setFilesByAgent((prev) => ({ ...prev, [agent]: data }));
    });
  };

  useEffect(() => {
    if (!activeAgent) return;
    loadFiles(activeAgent);
    setSelectedFile(null);
    setContent("");
    setOriginal("");
  }, [activeAgent]);

  // Prefetch file counts for the agent picker
  useEffect(() => {
    agents.forEach((a) => {
      if (a.id === activeAgent) return;
      if (filesByAgent[a.id]) return;
      fetch(`/api/memory/${a.id}`).then((r) => r.ok ? r.json() : []).then((data: MemoryFile[]) => {
        setFilesByAgent((prev) => ({ ...prev, [a.id]: data }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, activeAgent]);

  const openFile = async (name: string) => {
    if (!activeAgent) return;
    const res = await fetch(`/api/memory/${activeAgent}/${encodeURIComponent(name)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { content: string };
    setSelectedFile(name);
    setContent(data.content);
    setOriginal(data.content);
  };

  const save = async () => {
    if (!activeAgent || !selectedFile) return;
    setSaving(true);
    const res = await fetch(`/api/memory/${activeAgent}/${encodeURIComponent(selectedFile)}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSaving(false);
    if (res.ok) {
      setOriginal(content);
      loadFiles(activeAgent);
    }
  };

  const remove = async () => {
    if (!activeAgent || !selectedFile) return;
    if (!confirm(`Delete ${selectedFile}?\nThis cannot be undone.`)) return;
    await fetch(`/api/memory/${activeAgent}/${encodeURIComponent(selectedFile)}`, { method: "DELETE" });
    setSelectedFile(null); setContent(""); setOriginal("");
    loadFiles(activeAgent);
  };

  // keyboard: ⌘S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (content !== original) save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, original, activeAgent, selectedFile]);

  const dirty = content !== original;
  const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
  const TOKEN_BUDGET = 200_000; // ~200k tokens of project memory
  const estimatedTokens = Math.ceil(totalBytes / 3.5);
  const pct = Math.min(100, (estimatedTokens / TOKEN_BUDGET) * 100);

  const lines = useMemo(() => content.split("\n").length, [content]);
  const chars = content.length;
  const words = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);

  const glyph = (name: string) => name.charAt(0).toUpperCase();

  return (
    <div className="mem-root">
      {/* ── left tree ─────────────────────────────────────────────── */}
      <aside className="mem-tree">
        <div className="mem-tree-hd">
          <h2>Memory</h2>
          <div className="sub">Per-agent persistent notes, loaded into the system prompt at spawn.</div>
          <div className="agent-pick">
            {agents.length === 0 ? (
              <div className="row" style={{ cursor: "default" }}>
                <span style={{ color: "var(--text-faint)" }}>No OrchestrIA agents yet.</span>
              </div>
            ) : agents.map((a) => {
              const fileCount = filesByAgent[a.id]?.length ?? 0;
              return (
                <div key={a.id}
                  className={`row${activeAgent === a.id ? " on" : ""}`}
                  onClick={() => setActiveAgent(a.id)}>
                  <span className="g">{glyph(a.name)}</span>
                  <span className="nm">{a.name}</span>
                  <span className="ct">{fileCount}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mem-tree-body">
          {activeAgent && (
            <div className="tree-section">
              <div className="lbl" title={`.orchestria/agents/${activeAgent}/memory/`}>
                <span style={{
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono, monospace)", textTransform: "none", letterSpacing: 0,
                  minWidth: 0, flex: 1,
                }}>
                  .orchestria/agents/{activeAgent}/memory/
                </span>
                <span className="ct">{files.length}</span>
              </div>
              {files.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--text-faint)", padding: "8px" }}>
                  No files yet. Create one below.
                </div>
              ) : files.map((f) => (
                <div key={f.name}
                  className={`tree-file${selectedFile === f.name ? " on" : ""}`}
                  onClick={() => openFile(f.name)}>
                  <span className="ic">{ICO.doc}</span>
                  <span className="nm">{f.name}</span>
                  {selectedFile === f.name && dirty && <span className="dot" title="unsaved" />}
                  <span className="sz">{f.size}</span>
                  <button
                    className="del"
                    title={`Delete ${f.name}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete ${f.name}?\nThis cannot be undone.`)) return;
                      await fetch(`/api/memory/${activeAgent}/${encodeURIComponent(f.name)}`, { method: "DELETE" });
                      if (selectedFile === f.name) {
                        setSelectedFile(null);
                        setContent(""); setOriginal("");
                      }
                      loadFiles(activeAgent);
                    }}>
                    {ICO.trash}
                  </button>
                </div>
              ))}
              <button className="add-file" onClick={() => setShowNew(true)}>
                {ICO.plus}<span>new file…</span>
              </button>
            </div>
          )}
        </div>

        <div className="tree-foot">
          <div className="mem-meter">
            <div className="row">
              <span>memory used</span>
              <span className="v">{(totalBytes / 1024).toFixed(1)} KB</span>
            </div>
            <div className="mem-bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
            <div className="hint">~{estimatedTokens.toLocaleString()} tokens · loaded into system prompt</div>
          </div>
        </div>
      </aside>

      {/* ── right editor ──────────────────────────────────────────── */}
      <section className="mem-edit">
        {!selectedFile ? (
          <div className="mem-empty">
            {activeAgent ? "Select a file to edit, or create one with + new file." : "Select an agent."}
          </div>
        ) : (
          <>
            {/* breadcrumb header */}
            <div className="editor-hd">
              <div className="breadcrumb">
                <span>memory</span><span className="sep">/</span>
                <span>{activeAgent}</span><span className="sep">/</span>
                <span className="cur">{selectedFile}</span>
              </div>
              <div className="editor-hd-actions">
                <div className={`save-pill${saving ? " saving" : dirty ? " dirty" : ""}`}>
                  <span className="d" />
                  <span>{saving ? "saving…" : dirty ? "unsaved" : "saved"}</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setContent(original)} disabled={!dirty}>Discard</button>
                <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
                  {saving ? "…" : "Save"} <span className="kbd mono" style={{ marginLeft: 6, fontSize: 9, opacity: 0.6 }}>⌘S</span>
                </button>
              </div>
            </div>

            {/* toolbar with view tabs + delete */}
            <div className="editor-toolbar">
              <button className="tb-btn" title="Delete file" onClick={remove}>{ICO.trash}</button>
              <span className="tb-sep" />
              <button className={`tb-tab${view === "split" ? " on" : ""}`} onClick={() => setView("split")}>
                <span className="d" />split
              </button>
              <button className={`tb-tab${view === "raw" ? " on" : ""}`} onClick={() => setView("raw")}>
                <span className="d" />raw
              </button>
              <button className={`tb-tab${view === "preview" ? " on" : ""}`} onClick={() => setView("preview")}>
                <span className="d" />preview
              </button>
              <span className="tb-spacer" />
              <span style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-mono, monospace)" }}>
                {selectedFile}
              </span>
            </div>

            {/* split body */}
            <div className={`editor-body ${view === "split" ? "" : "single"}`}>
              {view !== "preview" && (
                <div className="pane raw">
                  <textarea
                    className="raw-area"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                    placeholder={`# ${selectedFile}\n\nWrite agent memory here…`}
                  />
                </div>
              )}
              {view !== "raw" && (
                <div className="pane">
                  <div className="preview">
                    {content.trim() ? (
                      <ReactMarkdown>{content}</ReactMarkdown>
                    ) : (
                      <p style={{ color: "var(--text-faint)", fontStyle: "italic" }}>Preview will appear here.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* footer stats */}
            <div className="editor-foot">
              <div className="foot-stat"><span className="k">lines</span><span className="v">{lines}</span></div>
              <div className="foot-stat"><span className="k">words</span><span className="v">{words}</span></div>
              <div className="foot-stat"><span className="k">chars</span><span className="v">{chars}</span></div>
              <div className="foot-stat"><span className="k">~tokens</span><span className="v">{Math.ceil(chars / 3.5).toLocaleString()}</span></div>
              <span className="foot-spacer" />
              <div className="foot-stat"><span className="k">scope</span><span className="v">USER</span></div>
            </div>
          </>
        )}
      </section>

      {showNew && activeAgent && (
        <NewFileDialog
          agent={activeAgent}
          onClose={() => setShowNew(false)}
          onCreated={(name) => {
            setShowNew(false);
            loadFiles(activeAgent);
            openFile(name);
          }}
        />
      )}
    </div>
  );
}
