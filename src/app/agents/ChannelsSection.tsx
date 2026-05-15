"use client";

import { useEffect, useState } from "react";
import type { ChannelConfig, ChannelType } from "@/lib/channels/types";

// ─── Channel display meta ────────────────────────────────────────────────────

interface ChannelMeta {
  type: ChannelType;
  label: string;
  glyph: string;
  color: string;
  description: string;
}

const META: ChannelMeta[] = [
  { type: "telegram", label: "telegram", glyph: "◇", color: "#229ED9", description: "Bot Telegram (long polling). Token via env var." },
  { type: "imessage", label: "imessage", glyph: "◇", color: "#34d399", description: "macOS Messages.app — AppleScript bridge." },
  { type: "discord",  label: "discord",  glyph: "◆", color: "#5865F2", description: "Bot Discord (runtime à venir)." },
];

interface ChannelEntry { name: string; config: ChannelConfig }
interface RunningInfo  { name: string; type: string; polling: boolean }

// ─── Setup dialog per type ───────────────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4, letterSpacing: "0.05em" }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function SetupDialog({ type, existing, onClose, onSaved }: {
  type: ChannelType;
  existing: ChannelEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = META.find((m) => m.type === type)!;
  const isNew = !existing;
  const [name, setName] = useState(existing?.name ?? type);

  // Telegram + Discord: token field (raw or env var)
  const [tokenInput, setTokenInput] = useState(
    existing?.config.type === "telegram" ? (existing.config.bot_token ?? existing.config.bot_token_env ?? "") :
    existing?.config.type === "discord"  ? (existing.config.bot_token_env ?? "") : ""
  );

  // Telegram: allowed chat ids
  const [allowedChatIds, setAllowedChatIds] = useState(
    existing?.config.type === "telegram" ? (existing.config.allowed_chat_ids ?? []).join(", ") : ""
  );

  // iMessage: allowed handles + poll interval
  const [allowedHandles, setAllowedHandles] = useState(
    existing?.config.type === "imessage" ? (existing.config.allowed_handles ?? []).join(", ") : ""
  );
  const [pollInterval, setPollInterval] = useState(
    existing?.config.type === "imessage" ? String(existing.config.poll_interval_sec ?? 5) : "5"
  );

  // Discord: guild_id + channel_id
  const [guildId, setGuildId] = useState(
    existing?.config.type === "discord" ? (existing.config.guild_id ?? "") : ""
  );
  const [channelId, setChannelId] = useState(
    existing?.config.type === "discord" ? (existing.config.channel_id ?? "") : ""
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const looksLikeRawToken = tokenInput.includes(":") || tokenInput.length > 40;

  const submit = async () => {
    setError(null);
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) { setError("name doit être alphanumeric / _ / -"); return; }
    if ((type === "telegram" || type === "discord") && !tokenInput.trim()) {
      setError("token requis"); return;
    }

    let config: ChannelConfig;
    if (type === "telegram") {
      const ids = allowedChatIds.split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !isNaN(n));
      config = {
        type, default_agent: "_main",
        allowed_chat_ids: ids,
        ...(looksLikeRawToken ? { bot_token: tokenInput.trim() } : { bot_token_env: tokenInput.trim() }),
      };
    } else if (type === "imessage") {
      const handles = allowedHandles.split(",").map((s) => s.trim()).filter(Boolean);
      const poll = parseInt(pollInterval) || 5;
      config = { type, default_agent: "_main", allowed_handles: handles, poll_interval_sec: poll };
    } else if (type === "discord") {
      config = {
        type, default_agent: "_main",
        bot_token_env: tokenInput.trim(),
        ...(guildId.trim() ? { guild_id: guildId.trim() } : {}),
        ...(channelId.trim() ? { channel_id: channelId.trim() } : {}),
      };
    } else {
      setError(`unsupported type: ${type}`); return;
    }

    setSubmitting(true);
    const res = await fetch(`/api/channels/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSubmitting(false);
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok || j.error) { setError(j.error ?? `HTTP ${res.status}`); return; }
    onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card w-sm" style={{ width: 480, gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            <span style={{ color: meta.color }}>{meta.glyph}</span> {isNew ? `Configurer ${meta.label}` : `Éditer ${name}`}
          </h2>
          <button className="btn-ghost" onClick={onClose}>×</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{meta.description}</div>

        {isNew && (
          <FieldRow label="NAME (identifiant interne)">
            <input className="input mono" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </FieldRow>
        )}

        {/* ── TELEGRAM ── */}
        {type === "telegram" && (
          <>
            <FieldRow
              label={`BOT TOKEN${tokenInput ? (looksLikeRawToken ? "  ← token brut" : "  ← env var") : "  (token brut OU nom de var d'env)"}`}
              hint={looksLikeRawToken
                ? `⚠ Token stocké en clair dans .orchestria/channels/${name}.json — préfère une variable d'env.`
                : `Obtiens le token via @BotFather, mets-le dans .env.local sous ce nom.`}
            >
              <input className="input mono"
                type={looksLikeRawToken ? "password" : "text"}
                value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
                placeholder="TELEGRAM_BOT_TOKEN  ou  1234567:ABCdef…" />
            </FieldRow>
            <FieldRow label="ALLOWED CHAT IDS (CSV · vide = tous)">
              <input className="input mono" placeholder="123456789, 987654321"
                value={allowedChatIds} onChange={(e) => setAllowedChatIds(e.target.value)} />
            </FieldRow>
          </>
        )}

        {/* ── IMESSAGE ── */}
        {type === "imessage" && (
          <>
            <FieldRow
              label="ALLOWED HANDLES (emails ou numéros de téléphone · vide = tous)"
              hint="Requiert macOS · Messages.app ouvert · permission Accessibilité accordée à Terminal/Node."
            >
              <input className="input mono" placeholder="+33612345678, user@me.com"
                value={allowedHandles} onChange={(e) => setAllowedHandles(e.target.value)} />
            </FieldRow>
            <FieldRow label="POLL INTERVAL (secondes)" hint="Fréquence de vérification des nouveaux messages dans Messages.app.">
              <input className="input mono" type="number" min={1} max={60} style={{ width: 80 }}
                value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} />
            </FieldRow>
          </>
        )}

        {/* ── DISCORD ── */}
        {type === "discord" && (
          <>
            <FieldRow
              label={`BOT TOKEN ENV VAR${tokenInput ? (looksLikeRawToken ? "  ← token brut détecté" : "") : ""}`}
              hint="Nom de la variable d'env dans .env.local contenant le token du bot Discord."
            >
              <input className="input mono"
                type={looksLikeRawToken ? "password" : "text"}
                value={tokenInput} onChange={(e) => setTokenInput(e.target.value)}
                placeholder="DISCORD_BOT_TOKEN" />
            </FieldRow>
            <FieldRow label="GUILD ID (optionnel)" hint="Restreindre le bot à un seul serveur Discord.">
              <input className="input mono" placeholder="123456789012345678"
                value={guildId} onChange={(e) => setGuildId(e.target.value)} />
            </FieldRow>
            <FieldRow label="CHANNEL ID (optionnel)" hint="Restreindre les réponses à un canal spécifique.">
              <input className="input mono" placeholder="987654321098765432"
                value={channelId} onChange={(e) => setChannelId(e.target.value)} />
            </FieldRow>
            <div style={{ padding: "8px 12px", background: "rgba(88,101,242,0.08)", border: "1px solid rgba(88,101,242,0.2)", borderRadius: 6, fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
              ℹ Le support Discord est en cours de développement. La configuration est sauvegardée mais le bot ne tourne pas encore.
            </div>
          </>
        )}

        {error && <div className="err-banner">{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={submit} disabled={submitting} style={{ flex: 1 }}>
            {submitting ? "…" : isNew ? "Activer" : "Enregistrer"}
          </button>
          <button className="btn secondary" onClick={onClose} disabled={submitting}>Annuler</button>
        </div>
      </div>
    </div>
  );
}

// ─── Channels Section (main component) ───────────────────────────────────────

interface Subscriber {
  chat_id: number;
  username?: string;
  first_name?: string;
  first_seen: number;
  last_seen: number;
  message_count: number;
}

export default function ChannelsSection() {
  const [entries, setEntries] = useState<ChannelEntry[]>([]);
  const [running, setRunning] = useState<RunningInfo[]>([]);
  const [subscribers, setSubscribers] = useState<Record<string, Subscriber[]>>({});
  const [setupFor, setSetupFor] = useState<{ type: ChannelType; existing: ChannelEntry | null } | null>(null);

  const reload = () =>
    fetch("/api/channels").then((r) => r.json()).then((d: { configured: ChannelEntry[]; running: RunningInfo[]; subscribers?: Record<string, Subscriber[]> }) => {
      setEntries(d.configured);
      setRunning(d.running);
      setSubscribers(d.subscribers ?? {});
    });

  useEffect(() => { reload(); }, []);

  const findEntry = (type: ChannelType): ChannelEntry | null =>
    entries.find((e) => e.config.type === type) ?? null;
  const isRunning = (name: string) => running.some((r) => r.name === name);

  const toggle = async (entry: ChannelEntry, on: boolean) => {
    // Simulated on/off: delete to "disable" — but better: keep the config and just don't poll.
    // For now, we just call PUT to re-trigger; full pause would need an `enabled` flag.
    if (on) {
      await fetch(`/api/channels/${entry.name}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry.config) });
    } else {
      // For "off" we keep the config but stop the poller via DELETE then re-PUT next time
      await fetch(`/api/channels/${entry.name}`, { method: "DELETE" });
    }
    reload();
  };

  const active = entries.length;
  const paired = entries.length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, marginTop: 22 }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--text-faint)" }}>
          // CHANNELS
        </div>
        <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
          <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{active}</span> active ·{" "}
          <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{paired}</span> paired
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {META.map((m) => {
          const entry = findEntry(m.type);
          const live = entry && isRunning(entry.name);
          const setup = !entry;
          const subs = entry ? (subscribers[entry.name] ?? []) : [];

          return (
            <div key={m.type} style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: "10px 12px", borderRadius: 6,
              border: `1px solid ${live ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
              background: live ? "rgba(52,211,153,0.04)" : "rgba(255,255,255,0.02)",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: m.color, fontSize: 14, fontFamily: "var(--font-mono, monospace)" }}>{m.glyph}</span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{m.label}</span>

              {setup ? (
                <>
                  <span style={{
                    fontSize: 9, padding: "3px 8px", borderRadius: 3,
                    border: "1px solid var(--text-faint)", color: "var(--text-faint)",
                    fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em",
                  }}>NEEDS<br/>SETUP</span>
                  <button onClick={() => setSetupFor({ type: m.type, existing: null })}
                    style={{
                      background: "transparent", border: "1px solid var(--border)",
                      color: "var(--text-dim)", borderRadius: 4,
                      padding: "4px 10px", fontSize: 10, cursor: "pointer",
                      letterSpacing: "0.06em",
                    }}>SETUP</button>
                  <div style={{ width: 30, height: 18, borderRadius: 9, background: "var(--border)" }} />
                </>
              ) : (
                <>
                  <span style={{
                    fontSize: 9, padding: "3px 8px", borderRadius: 3,
                    border: `1px solid ${live ? "#34d399" : "var(--text-faint)"}`,
                    color: live ? "#34d399" : "var(--text-faint)",
                    fontFamily: "var(--font-mono, monospace)", letterSpacing: "0.04em",
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: live ? "#34d399" : "var(--text-faint)" }} />
                    {live ? "ONLINE" : "OFFLINE"}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-faint)" }}>paired…</span>
                  <button onClick={() => toggle(entry, !live)}
                    style={{
                      width: 34, height: 18, borderRadius: 9, padding: 1,
                      background: live ? "#34d399" : "var(--border)",
                      border: 0, cursor: "pointer",
                      display: "flex", alignItems: "center",
                      justifyContent: live ? "flex-end" : "flex-start",
                    }}>
                    <span style={{
                      display: "block", width: 14, height: 14, borderRadius: "50%",
                      background: "#0a0a0a",
                    }} />
                  </button>
                  <button onClick={() => setSetupFor({ type: m.type, existing: entry })}
                    style={{
                      background: "transparent", border: 0, color: "var(--text-faint)",
                      cursor: "pointer", fontSize: 14, padding: "0 4px",
                    }}>···</button>
                </>
              )}
            </div>
            {entry && subs.length > 0 && (
              <div style={{
                paddingTop: 6, marginTop: 2,
                borderTop: "1px dashed var(--border)",
                fontSize: 10, color: "var(--text-faint)",
              }}>
                <div style={{ marginBottom: 4, letterSpacing: "0.05em" }}>
                  SUBSCRIBERS · {subs.length}
                </div>
                {subs.map((s) => (
                  <div key={s.chat_id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontFamily: "var(--font-mono, monospace)", marginBottom: 2,
                  }}>
                    <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{s.chat_id}</span>
                    {(s.username || s.first_name) && (
                      <span style={{ color: "var(--text-faint)" }}>
                        — {s.first_name ?? ""}{s.username ? ` @${s.username}` : ""}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 9 }}>{s.message_count} msg</span>
                    <button
                      onClick={async () => {
                        if (!confirm(`Supprimer le subscriber ${s.chat_id} ?\nIl ne recevra plus les notifications routines (mais sera re-enregistré s'il écrit au bot).`)) return;
                        await fetch(`/api/channels/${entry!.name}/subscribers/${s.chat_id}`, { method: "DELETE" });
                        reload();
                      }}
                      title="Supprimer ce chat"
                      style={{
                        background: "transparent", border: 0,
                        color: "var(--text-faint)", cursor: "pointer",
                        fontSize: 11, padding: "0 4px", lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            {entry && subs.length === 0 && (
              <div style={{
                paddingTop: 6, marginTop: 2,
                borderTop: "1px dashed var(--border)",
                fontSize: 10, color: "var(--text-faint)", fontStyle: "italic",
              }}>
                Envoie un message au bot pour t&apos;enregistrer comme subscriber.
              </div>
            )}
            </div>
          );
        })}
      </div>

      {/* Permission relay info */}
      {entries.find((e) => e.config.type === "telegram") && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 6,
          background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-faint)",
        }}>
          <span style={{ color: "#e6b85c" }}>⚡</span>
          permission relay via <span style={{
            fontFamily: "var(--font-mono, monospace)", padding: "1px 6px", borderRadius: 3,
            border: "1px solid var(--border)", color: "var(--text-dim)",
          }}>telegram</span>
        </div>
      )}

      {setupFor && (
        <SetupDialog
          type={setupFor.type}
          existing={setupFor.existing}
          onClose={() => setSetupFor(null)}
          onSaved={() => { setSetupFor(null); reload(); }}
        />
      )}
    </>
  );
}
