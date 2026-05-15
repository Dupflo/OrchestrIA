"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SkillEditor from "./SkillEditor";

type SkillCategory = "dev" | "content" | "ops" | "life";
type SkillSource = "project" | "claude-global" | "claude-project";

interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  agents: string[];
  enabled: boolean;
  source: SkillSource;
}

const SOURCE_LABEL: Record<SkillSource, string> = {
  "project":         "ORCHESTRIA",
  "claude-global":   "CLAUDE",
  "claude-project":  "PROJECT",
};

function SkillItem({ s, active, onSelect }: { s: Skill; active: boolean; onSelect: () => void }) {
  const isProject = s.source === "project";
  const cls = active ? "active" : !isProject ? "readonly skill" : "";
  return (
    <div className={`a-item ${cls}`} onClick={onSelect}>
      <div className="a-glyph">S</div>
      <div className="a-meta">
        <div className="a-name-row">
          <span className="a-name">{s.name}</span>
          {isProject ? (
            <span className="a-model">{s.category}</span>
          ) : (
            <span className="a-badge skill">{SOURCE_LABEL[s.source]}</span>
          )}
        </div>
        <div className="a-sub">
          <span className={`a-status-dot ${s.enabled ? "ok" : ""}`} />
          <span>{s.description ? (s.description.length > 50 ? s.description.slice(0, 50) + "…" : s.description) : "no description"}</span>
        </div>
      </div>
    </div>
  );
}

function SkillsPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedId = sp.get("id");
  const selectedSource = (sp.get("source") ?? "project") as SkillSource;

  const NEW_SENTINEL = "__new__";
  const isNew = selectedId === NEW_SENTINEL;

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const reload = () =>
    fetch("/api/skills").then((r) => r.json()).then((data: Skill[]) => setSkills(data)).finally(() => setLoading(false));

  useEffect(() => { reload(); }, []);

  const projectSkills = useMemo(() => skills.filter((s) => s.source === "project"), [skills]);
  const claudeSkills = useMemo(() => skills.filter((s) => s.source !== "project"), [skills]);

  const matches = (s: Skill) =>
    !query.trim() ||
    s.name.toLowerCase().includes(query.toLowerCase()) ||
    s.id.toLowerCase().includes(query.toLowerCase()) ||
    s.description.toLowerCase().includes(query.toLowerCase());

  const filteredProject = projectSkills.filter(matches);
  const filteredClaude = claudeSkills.filter(matches);

  const select = (id: string, source: SkillSource = "project") =>
    router.replace(`/skills?id=${encodeURIComponent(id)}${source !== "project" ? `&source=${source}` : ""}`);

  const onDeleted = () => {
    reload().then(() => {
      const remaining = skills.filter((s) => s.source === "project" && s.id !== selectedId);
      if (remaining.length > 0) router.replace(`/skills?id=${encodeURIComponent(remaining[0].id)}`);
      else router.replace("/skills");
    });
  };

  return (
    <div className="agents-layout">
      {/* ── left column: skills list ────────────────────────── */}
      <aside className="col-list">
        <div className="list-hd">
          <div className="list-hd-row">
            <h2>Skills</h2>
            <span className="count">
              {loading ? "…" : `${projectSkills.length} project · ${claudeSkills.length} native`}
            </span>
          </div>
          <div className="searchbar">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="9" cy="9" r="5.5" /><path d="M13 13l3.5 3.5" />
            </svg>
            <input className="input" placeholder="Search skills, categories…"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className={`new-agent${isNew ? " active" : ""}`}
            onClick={() => router.replace(`/skills?id=${NEW_SENTINEL}`)}>
            <span className="plus">+</span>
            <span>New skill</span>
          </button>
        </div>

        <div className="agent-list scroll">
          {loading ? (
            <div className="list-empty">loading…</div>
          ) : filteredProject.length === 0 && filteredClaude.length === 0 ? (
            <div className="list-empty">
              No skills{query ? ` matching "${query}"` : ""}.
            </div>
          ) : (
            <>
              {filteredProject.length > 0 && (
                <div className="list-section">
                  <div className="lbl">PROJECT<span className="ct">{filteredProject.length}</span></div>
                  {filteredProject.map((s) => (
                    <SkillItem key={`p-${s.id}`} s={s}
                      active={!isNew && selectedSource === "project" && selectedId === s.id}
                      onSelect={() => select(s.id, "project")} />
                  ))}
                </div>
              )}
              {filteredClaude.length > 0 && (
                <div className="list-section">
                  <div className="lbl" style={{ color: "#c89cff" }}>
                    NATIVE CLAUDE<span className="ct">{filteredClaude.length}</span>
                  </div>
                  {filteredClaude.map((s) => (
                    <SkillItem key={`c-${s.source}-${s.id}`} s={s}
                      active={!isNew && selectedSource === s.source && selectedId === s.id}
                      onSelect={() => select(s.id, s.source)} />
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
          <SkillEditor
            key="__new__"
            id={NEW_SENTINEL}
            isNew
            onCreated={(newId) => {
              reload().then(() => router.replace(`/skills?id=${encodeURIComponent(newId)}`));
            }}
          />
        ) : selectedId && skills.some((s) => s.id === selectedId && s.source === selectedSource) ? (
          <SkillEditor
            key={`${selectedSource}-${selectedId}`}
            id={selectedId}
            source={selectedSource}
            onDeleted={onDeleted}
          />
        ) : (
          <div className="empty-editor">
            <div className="ico">S</div>
            <p>Select a skill to view or edit, or create a new one.</p>
            <small>Native Claude skills are read-only.</small>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={<div className="center-state">loading…</div>}>
      <SkillsPageInner />
    </Suspense>
  );
}
