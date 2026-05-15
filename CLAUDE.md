# Project context for AI coding assistants

OrchestrIA is a **local-first agentic OS**: a Next.js app that spawns and
supervises Claude CLI agents, persists runs/memory to SQLite, and exposes a web
dashboard.

## Architecture (where things live)

- `src/app/` — Next.js App Router pages (`/visualizer`, `/chat`, `/missions`,
  `/dashboard`, `/agents`, `/skills`, `/memory`, `/kanban`, `/routines`) and
  `src/app/api/*` route handlers.
- `src/lib/orchestrator/` — agent spawning (`agent.ts` drives the `claude` CLI
  over a `node-pty` pseudo-terminal — there is **no Anthropic SDK**), the
  registry, and config/memory loading.
- `src/lib/db.ts` — SQLite (`better-sqlite3`), WAL mode. Schema: `missions`,
  `events`, `kanban_cards`, `routines`, `remote_tokens`.
- `src/lib/channels/` — Telegram + webhook inbound, routing via `@agent` tags.
- `src/lib/routines/` — cron-style scheduler.
- `src/lib/remote/` — token issuing/auth for external agents.
- `.orchestria/` — user-space runtime: agent/skill/channel configs. Databases,
  logs, memory and channel secrets are git-ignored (see `.gitignore`).

## Conventions

- An agent is a directory `.orchestria/agents/<id>/` with `config.json` and an
  optional `system-prompt.md`. The source tree has **no hardcoded agent/skill
  names** — discovery is filesystem-driven.
- The internal discriminant for OrchestrIA-managed agents is
  `source: "orchestria"` (vs `"skill"` / `"agent"`).
- Path constants are centralized in `src/lib/orchestrator/config.ts`
  (`ORCHESTRIA_HOME`, etc.). Env vars use the `ORCHESTRIA_*` prefix.

## ⚠️ This is not the Next.js you may know

This repo runs Next.js 16, which has breaking changes vs. older majors. Before
writing framework code, check `node_modules/next/dist/docs/` and heed
deprecation notices rather than relying on training-data assumptions.

## Security rule (non-negotiable)

Never commit secrets or third-party data: bot tokens, passwords, API keys,
client data, databases, or `*.bak`. Channel credentials live in
`.orchestria/channels/*.json` (git-ignored); only `*.json.example` is tracked.
