"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const COL_DROPPABLE_PREFIX = "col:";

type KanbanCol = "backlog" | "todo" | "doing" | "done";
type NotifyOn = "never" | "failure" | "always";

interface KanbanCard {
  id: string;
  title: string;
  description: string | null;
  agent: string | null;
  col: KanbanCol;
  domain: string | null;
  tags: string[];
  due: string | null;
  progress: number | null;
  mission_id: string | null;
  not_before: string | null;
  notify_channel?: string | null;
  notify_on?: NotifyOn;
  target_chat_ids?: number[];
}

interface AgentOpt {
  id: string;
  name: string;
}

interface MissionEvent {
  id: number;
  ts: number;
  kind: string;
  payload: unknown;
}

const COLS: { id: KanbanCol; label: string; help: string }[] = [
  { id: "backlog", label: "Backlog",     help: "Captured, not yet committed" },
  { id: "todo",    label: "To do",       help: "Ready to be picked up" },
  { id: "doing",   label: "In progress", help: "An agent is on it now" },
  { id: "done",    label: "Done",        help: "Last 24 hours" },
];

const DOMAIN_CLS: Record<string, string> = {
  engineering: "eng", eng: "eng",
  writing: "writing",
  research: "research",
  ops: "ops",
  product: "eng",
  life: "life",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ──────────────────────────────────────────────
// New Card Dialog
// ──────────────────────────────────────────────
function NewCardDialog({
  onClose, onCreated, agents,
}: { onClose: () => void; onCreated: (c: KanbanCard) => void; agents: AgentOpt[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agent, setAgent] = useState<string>("");
  const [tags, setTags] = useState("");
  const [col, setCol] = useState<KanbanCol>("backlog");
  const [notBefore, setNotBefore] = useState("");
  const [due, setDue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    const res = await fetch("/api/kanban", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        col,
        agent: agent || null,
        tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
        not_before: notBefore || null,
        due: due || null,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const card = (await res.json()) as KanbanCard;
      onCreated(card);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card w-md" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>New card</h2>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Title</div>
          <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief task title (used as mission name)" />
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            Description <span style={{ color: "var(--text-muted)" }}>(optional — enrichit la mission)</span>
          </div>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Détails, contexte, contraintes…"
            rows={4}
            style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>
            Assigned agent <span style={{ color: "var(--text-muted)" }}>(needed to spawn)</span>
          </div>
          <select className="input" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">— none (planning only) —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Not before</div>
            <input type="datetime-local" className="input mono" value={notBefore}
              onChange={(e) => setNotBefore(e.target.value)} style={{ fontSize: 12 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Due</div>
            <input type="datetime-local" className="input mono" value={due}
              onChange={(e) => setDue(e.target.value)} style={{ fontSize: 12 }} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Tags (comma-separated)</div>
          <input className="input mono" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ops, urgent" />
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 4 }}>Column</div>
          <div style={{ display: "flex", gap: 6 }}>
            {COLS.map((c) => (
              <button key={c.id} className={`btn${col === c.id ? "" : " secondary"}`}
                style={{ fontSize: 12, padding: "3px 8px" }}
                onClick={() => setCol(c.id)}>{c.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={submit} disabled={submitting || !title.trim()} style={{ flex: 1 }}>Create</button>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Detail Panel
// ──────────────────────────────────────────────
function extractStepText(ev: MissionEvent): string | null {
  const p = ev.payload as Record<string, unknown>;
  if (ev.kind === "assistant" && p.message) {
    const msg = p.message as Record<string, unknown>;
    const content = msg.content as unknown[];
    if (Array.isArray(content)) {
      const texts = content
        .filter((c) => (c as Record<string, unknown>).type === "text")
        .map((c) => ((c as Record<string, unknown>).text as string ?? "").slice(0, 120))
        .filter(Boolean);
      if (texts.length) return texts.join(" ").slice(0, 160);
    }
  }
  if (ev.kind === "tool_use" && p.name) return `🔧 ${p.name as string}`;
  if (ev.kind === "MissionComplete") {
    const s = (p as { status?: string }).status ?? "done";
    return s === "done" ? "✅ Mission terminée" : "❌ Mission échouée";
  }
  return null;
}

interface ChannelInfo { name: string; type: string }
interface Subscriber { chat_id: number; username?: string; first_name?: string }

function DetailPanel({
  card, onClose, onDelete, onSpawn, onCardUpdated,
}: {
  card: KanbanCard;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSpawn: (card: KanbanCard) => void;
  onCardUpdated?: (c: KanbanCard) => void;
}) {
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Channels + subscribers for the notify picker
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [subscribers, setSubscribers] = useState<Record<string, Subscriber[]>>({});
  useEffect(() => {
    fetch("/api/channels").then((r) => r.json()).then((d: { configured: { name: string; config: { type: string } }[]; subscribers?: Record<string, Subscriber[]> }) => {
      setChannels((d.configured ?? []).map((c) => ({ name: c.name, type: c.config.type })));
      setSubscribers(d.subscribers ?? {});
    }).catch(() => {});
  }, []);

  // Notify state (mirrors card.notify_*, persisted via PATCH on change)
  const notifyChannel = card.notify_channel ?? "";
  const notifyOn = (card.notify_on ?? "never") as NotifyOn;
  const targetChatIds = card.target_chat_ids ?? [];

  const patchNotify = async (patch: { notify_channel?: string | null; notify_on?: NotifyOn; target_chat_ids?: number[] }) => {
    const res = await fetch(`/api/kanban/${card.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as KanbanCard;
      onCardUpdated?.(updated);
    }
  };

  useEffect(() => {
    if (!card.mission_id) return;
    setLoadingEvents(true);
    fetch(`/api/missions/${card.mission_id}`)
      .then((r) => r.json())
      .then((d: { events: MissionEvent[] }) => setEvents(d.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [card.mission_id]);

  const notBeforeMs = card.not_before ? new Date(card.not_before).getTime() : 0;
  const waitingForDate = notBeforeMs > Date.now();
  const canSpawn = !card.mission_id && card.agent && (card.col === "backlog" || card.col === "todo") && !waitingForDate;
  const isFailed = card.tags.includes("failed");

  const steps = events.map(extractStepText).filter(Boolean) as string[];

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 200,
      }} />

      {/* panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: "var(--bg-elev)", borderLeft: "1px solid var(--line-strong)",
        zIndex: 201, display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
      }}>
        {/* header */}
        <div style={{
          padding: "16px 20px 14px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className={`badge ${card.col === "done" ? "ok" : card.col === "doing" ? "warn" : "idle"}`}>
                <span className="d" />{card.col}
              </span>
              {isFailed && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, border: "1px solid var(--err)", color: "var(--err)" }}>
                  failed
                </span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>{card.title}</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-faint)", fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* description */}
          {card.description && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>Description</div>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: "var(--text)",
                whiteSpace: "pre-wrap", background: "var(--bg-elev-2)", borderRadius: 8,
                padding: "10px 12px", border: "1px solid var(--border)",
              }}>{card.description}</div>
            </div>
          )}

          {/* meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: 0.8 }}>Détails</div>
            {card.agent && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-faint)" }}>Agent</span>
                <span className="mono" style={{ color: "var(--text)" }}>{card.agent}</span>
              </div>
            )}
            {card.not_before && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-faint)" }}>Not before</span>
                <span className="mono" style={{ color: waitingForDate ? "var(--warn)" : "var(--text-faint)" }}>
                  {fmtDate(card.not_before)}
                </span>
              </div>
            )}
            {card.due && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-faint)" }}>Due</span>
                <span className="mono">{fmtDate(card.due)}</span>
              </div>
            )}
            {card.tags.filter((t) => t !== "failed").length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, alignItems: "center" }}>
                <span style={{ color: "var(--text-faint)" }}>Tags</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {card.tags.filter((t) => t !== "failed").map((t) => (
                    <span key={t} className="chip" style={{ fontSize: 10, padding: "1px 6px" }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {card.mission_id && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-faint)" }}>Mission</span>
                <a href={`/missions/${card.mission_id}`} style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  #{card.mission_id.slice(0, 14)}
                </a>
              </div>
            )}
          </div>

          {/* execution steps */}
          {card.mission_id && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                Étapes de réalisation
              </div>
              {loadingEvents ? (
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Chargement…</div>
              ) : steps.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>Aucune étape enregistrée</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: "50%", marginTop: 5,
                          background: i === steps.length - 1 ? "var(--accent)" : "var(--border)",
                          border: `1.5px solid ${i === steps.length - 1 ? "var(--accent)" : "var(--text-faint)"}`,
                        }} />
                        {i < steps.length - 1 && (
                          <div style={{ width: 1, flex: 1, minHeight: 14, background: "var(--border)", margin: "2px 0" }} />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4, paddingBottom: 10 }}>{s}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer actions */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid var(--border)",
          display: "flex", gap: 8, alignItems: "center",
        }}>
          {canSpawn && (
            <button
              className="btn"
              onClick={() => { onClose(); onSpawn(card); }}
              style={{ flex: 1 }}
            >
              ▶ Spawn agent
            </button>
          )}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn secondary"
              style={{ color: "var(--err)", borderColor: "var(--err)", flex: canSpawn ? undefined : 1 }}
            >
              Supprimer
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6, flex: 1 }}>
              <button
                className="btn"
                onClick={async () => {
                  await fetch(`/api/kanban/${card.id}`, { method: "DELETE" });
                  onDelete(card.id);
                }}
                style={{ flex: 1, background: "var(--err)", borderColor: "var(--err)" }}
              >
                Confirmer
              </button>
              <button className="btn secondary" onClick={() => setConfirmDelete(false)}>Annuler</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// Card (board tile)
// ──────────────────────────────────────────────
function CardTile({
  card, overlay = false, onSpawn, onClick,
}: {
  card: KanbanCard;
  overlay?: boolean;
  onSpawn?: (card: KanbanCard) => void;
  onClick?: (card: KanbanCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const notBeforeMs = card.not_before ? new Date(card.not_before).getTime() : 0;
  const waitingForDate = notBeforeMs > Date.now();
  const canSpawn = !card.mission_id && card.agent && (card.col === "backlog" || card.col === "todo") && !waitingForDate;
  const isFailed = card.tags.includes("failed");

  const progress = typeof card.progress === "number" ? Math.max(0, Math.min(100, card.progress)) : null;
  const visibleTags = card.tags.filter((t) => t !== "failed");
  const glyph = (card.agent ?? "?").charAt(0).toUpperCase();

  const inner = (
    <div
      className={`kb-card ${card.col}${overlay ? " dragging" : ""}`}
      onClick={() => onClick?.(card)}
      style={overlay ? { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } : undefined}
    >
      <div className="kb-card-top">
        {card.col === "done" && (
          <span className="check">
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7l3 3 5-6" />
            </svg>
          </span>
        )}
        <div className="title">{card.title}</div>
      </div>

      {card.description && <div className="desc">{card.description}</div>}

      {card.col === "doing" && progress !== null && (
        <div className="progress"><div className="fill" style={{ width: `${progress}%` }} /></div>
      )}

      {(visibleTags.length > 0 || isFailed || card.domain) && (
        <div className="tags">
          {card.domain && (
            <span className={`tg ${DOMAIN_CLS[card.domain] ?? ""}`}>{card.domain}</span>
          )}
          {visibleTags.map((t) => (
            <span key={t} className={`tg ${DOMAIN_CLS[t] ?? ""}`}>{t}</span>
          ))}
          {isFailed && <span className="tg failed">failed</span>}
        </div>
      )}

      <div className="kb-card-bot">
        {card.agent ? (
          <span className="ag">
            <span className="g">{glyph}</span>
            <span className="nm">{card.agent}</span>
          </span>
        ) : <span />}
        <span className="right">
          {(card.not_before || card.due) && (
            <span className={`due${waitingForDate ? " soon" : ""}`}>
              {card.not_before && (waitingForDate ? `⏳ ${fmtDate(card.not_before)}` : null)}
              {card.due && <>due {fmtDate(card.due)}</>}
            </span>
          )}
        </span>
      </div>

      {(canSpawn || card.mission_id) && (
        <div className="spawn-row">
          {canSpawn && onSpawn && (
            <button
              className="btn-spawn"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSpawn(card); }}
              title={waitingForDate ? `Cannot spawn before ${fmtDate(card.not_before!)}` : undefined}>
              ▶ Spawn
            </button>
          )}
          {card.mission_id && (
            <a
              className="mid"
              href={`/missions`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}>
              #{card.mission_id.slice(0, 10)}
            </a>
          )}
        </div>
      )}
    </div>
  );

  if (overlay) return inner;
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners}>{inner}</div>;
}

// ──────────────────────────────────────────────
// Column
// ──────────────────────────────────────────────
function Column({
  col, cards, onSpawn, onCardClick, onAdd,
}: {
  col: typeof COLS[number];
  cards: KanbanCard[];
  onSpawn: (card: KanbanCard) => void;
  onCardClick: (card: KanbanCard) => void;
  onAdd: () => void;
}) {
  // Make the column body a droppable target so cards can be dropped on an empty
  // column or above/below the card list (not just on top of another card).
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_DROPPABLE_PREFIX}${col.id}` });

  return (
    <div className={`kb-col ${col.id}${isOver ? " drop-over" : ""}`}>
      <div className="kb-col-hd">
        <span className="swatch" />
        <h3>{col.label}</h3>
        <span className="ct">{cards.length}</span>
        <button className="add" title={`Add to ${col.label}`} onClick={onAdd}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
        </button>
      </div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="kb-col-body scroll">
          {cards.length === 0 ? (
            <div className="kb-newcard" onClick={onAdd}>
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
              <span>{col.help}</span>
            </div>
          ) : cards.map((c) => (
            <CardTile key={c.id} card={c} onSpawn={onSpawn} onClick={onCardClick} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────
export default function KanbanPage() {
  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const refresh = useCallback(() => {
    fetch("/api/kanban").then((r) => r.json()).then(setCards);
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/agents").then((r) => r.json()).then((data: AgentOpt[]) =>
      setAgents(data.map((a) => ({ id: a.id, name: a.name })))
    );
  }, [refresh]);

  // keep selectedCard in sync with latest cards data
  useEffect(() => {
    if (!selectedCard) return;
    const updated = cards.find((c) => c.id === selectedCard.id);
    if (updated) setSelectedCard(updated);
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveCard(cards.find((c) => c.id === active.id) || null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveCard(null);
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    // 3 cases for `over.id` : a column droppable (`col:<id>`), another card id, or nothing usable
    let targetCol: KanbanCol | undefined;
    if (overId.startsWith(COL_DROPPABLE_PREFIX)) {
      targetCol = overId.slice(COL_DROPPABLE_PREFIX.length) as KanbanCol;
    } else {
      const overCard = cards.find((c) => c.id === overId);
      if (overCard) targetCol = overCard.col;
    }
    if (!targetCol) return;

    const cardId = String(active.id);
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.col === targetCol) return; // no-op within same column

    const notBeforeMs = card.not_before ? new Date(card.not_before).getTime() : 0;
    const shouldSpawn = targetCol === "doing" && card.agent && !card.mission_id
      && card.col !== "doing" && notBeforeMs <= Date.now();

    if (shouldSpawn) {
      setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, col: targetCol! } : c));
      spawnFromCard(card);
      return;
    }

    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, col: targetCol! } : c));
    fetch(`/api/kanban/${cardId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ col: targetCol }),
    });
  };

  const spawnFromCard = async (card: KanbanCard) => {
    if (!card.agent) return;
    const missionText = card.description
      ? `${card.title}\n\n${card.description}`
      : card.title;
    // Pass notify info in sourceMeta so dispatchMissionReply routes the output
    // to the configured channel (e.g. Telegram) at mission completion.
    const sourceMeta = card.notify_channel && card.notify_on !== "never"
      ? {
          notify_channel: card.notify_channel,
          notify_on: card.notify_on,
          target_chat_ids: card.target_chat_ids ?? [],
          card_id: card.id,
        }
      : undefined;
    const res = await fetch("/api/agents/spawn", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_name: card.agent,
        mission: missionText,
        kind: "mission",
        skip_kanban_card: true,
        source_meta: sourceMeta,
      }),
    });
    if (!res.ok) return;
    const { mission_id } = (await res.json()) as { mission_id: string };
    await fetch(`/api/kanban/${card.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ col: "doing", mission_id }),
    });
    refresh();
  };

  const handleDelete = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setSelectedCard(null);
  };

  const filteredCards = cards.filter((c) => {
    if (agentFilter && c.agent !== agentFilter) return false;
    if (domainFilter && c.domain !== domainFilter) return false;
    return true;
  });
  const colCards = (colId: KanbanCol) => filteredCards.filter((c) => c.col === colId);
  const total = filteredCards.length;
  const doneCount = filteredCards.filter((c) => c.col === "done").length;
  const doingCount = filteredCards.filter((c) => c.col === "doing").length;
  const domains = Array.from(new Set(cards.map((c) => c.domain).filter((d): d is string => !!d)));

  return (
    <div className="kb-root">
      {/* page header */}
      <div className="kb-ph">
        <div>
          <h1>Mission board</h1>
          <div className="sub">All cards across backlog → done · drag to move</div>
        </div>
        <div className="right">
          <div className="kb-view-switch">
            <a className="on">Board</a>
            <a href="/missions" style={{ color: "var(--text-dim)", textDecoration: "none" }}>Table</a>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ New card</button>
        </div>
      </div>

      {/* filter bar */}
      <div className="kb-filters">
        <div className={`kb-filter${agentFilter ? " on" : ""}`}>
          <span className="k">agent:</span>
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">all</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className={`kb-filter${domainFilter ? " on" : ""}`}>
          <span className="k">domain:</span>
          <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
            <option value="">all</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {(agentFilter || domainFilter) && (
          <button className="kb-filter" onClick={() => { setAgentFilter(""); setDomainFilter(""); }}>
            <span style={{ color: "var(--text-faint)" }}>×</span> clear
          </button>
        )}
        <div className="totals">
          <span>total<b>{total}</b></span>
          <span>doing<b>{doingCount}</b></span>
          <span>done<b>{doneCount}</b></span>
        </div>
      </div>

      {/* board */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="kb-board scroll">
          {COLS.map((col) => (
            <Column
              key={col.id}
              col={col}
              cards={colCards(col.id)}
              onSpawn={spawnFromCard}
              onCardClick={setSelectedCard}
              onAdd={() => setShowNew(true)}
            />
          ))}
        </div>
        <DragOverlay>{activeCard ? <CardTile card={activeCard} overlay /> : null}</DragOverlay>
      </DndContext>

      {showNew && (
        <NewCardDialog
          agents={agents}
          onClose={() => setShowNew(false)}
          onCreated={(c) => { setCards((prev) => [...prev, c]); setShowNew(false); }}
        />
      )}

      {selectedCard && (
        <DetailPanel
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onDelete={handleDelete}
          onSpawn={(card) => { setSelectedCard(null); spawnFromCard(card); }}
        />
      )}
    </div>
  );
}
