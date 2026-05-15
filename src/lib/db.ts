import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const ORCHESTRIA_DIR = path.join(process.cwd(), ".orchestria");
if (!fs.existsSync(ORCHESTRIA_DIR)) fs.mkdirSync(ORCHESTRIA_DIR, { recursive: true });

/**
 * SQLite path: `ORCHESTRIA_SQLITE` (absolute or relative to cwd), else canonical
 * `<project>/.orchestria/orchestria.db`. A legacy root `orchestria.db` (from earlier builds) is
 * auto-migrated by `consolidateLegacyDb()` at boot.
 */
function resolveDbPath(): string {
  const cwd = process.cwd();
  const fromEnv = process.env.ORCHESTRIA_SQLITE?.trim();
  if (fromEnv) {
    const p = path.isAbsolute(fromEnv) ? fromEnv : path.join(cwd, fromEnv);
    const dir = path.dirname(p);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return p;
  }
  return path.join(ORCHESTRIA_DIR, "orchestria.db");
}

/**
 * One-shot migration: if a legacy `<project>/orchestria.db` exists and `.orchestria/orchestria.db` is
 * empty/older, promote root → nested (renaming any old `.orchestria/orchestria.db` to a `.bak`).
 * This consolidates the two-DB confusion that arose during early development.
 */
function consolidateLegacyDb(): void {
  const cwd = process.cwd();
  const rootDb = path.join(cwd, "orchestria.db");
  const nestedDb = path.join(ORCHESTRIA_DIR, "orchestria.db");
  if (!fs.existsSync(rootDb)) return; // nothing to consolidate
  const rootMtime = fs.statSync(rootDb).mtimeMs;
  const nestedMtime = fs.existsSync(nestedDb) ? fs.statSync(nestedDb).mtimeMs : 0;
  if (rootMtime > nestedMtime) {
    if (fs.existsSync(nestedDb)) {
      const bak = path.join(ORCHESTRIA_DIR, `orchestria.db.bak-${Date.now()}`);
      fs.renameSync(nestedDb, bak);
      console.log(`[orchestria] backed up older .orchestria/orchestria.db → ${path.basename(bak)}`);
    }
    fs.renameSync(rootDb, nestedDb);
    // Also move WAL / SHM siblings if present so the new path stays consistent
    for (const ext of ["-wal", "-shm"]) {
      const from = rootDb + ext, to = nestedDb + ext;
      if (fs.existsSync(from)) fs.renameSync(from, to);
    }
    console.log(`[orchestria] promoted root orchestria.db → .orchestria/orchestria.db`);
  } else {
    // .orchestria/orchestria.db is newer — rename root one out of the way so it stops being picked up
    const bak = rootDb + `.bak-${Date.now()}`;
    fs.renameSync(rootDb, bak);
    console.log(`[orchestria] root orchestria.db is older than .orchestria/orchestria.db — moved to ${path.basename(bak)}`);
  }
}

/** One-shot migration: move .mos/mos.db → .orchestria/orchestria.db (rebranding). */
function migrateFromMos(): void {
  const cwd = process.cwd();
  const oldDb = path.join(cwd, ".mos", "mos.db");
  const newDb = path.join(ORCHESTRIA_DIR, "orchestria.db");
  if (!fs.existsSync(oldDb) || fs.existsSync(newDb)) return;
  fs.mkdirSync(ORCHESTRIA_DIR, { recursive: true });
  fs.renameSync(oldDb, newDb);
  for (const ext of ["-wal", "-shm"]) {
    const from = oldDb + ext;
    if (fs.existsSync(from)) fs.renameSync(from, newDb + ext);
  }
  console.log("[orchestria] migrated .mos/mos.db → .orchestria/orchestria.db");
}

consolidateLegacyDb();
migrateFromMos();
const DB_PATH = resolveDbPath();

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  // Agents live on the filesystem (<project>/.orchestria/agents/<name>/), not in SQLite.
  // FK enforcement off so legacy schemas with REFERENCES agents(id) keep working.
  _db.pragma("foreign_keys = OFF");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      status      TEXT DEFAULT 'pending',
      domain      TEXT,
      cost_usd    REAL DEFAULT 0,
      tokens_in   INTEGER DEFAULT 0,
      tokens_out  INTEGER DEFAULT 0,
      start_ts    INTEGER DEFAULT (unixepoch()),
      end_ts      INTEGER,
      created_at  INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id  TEXT NOT NULL,
      agent_id    TEXT,
      ts          INTEGER DEFAULT (unixepoch()),
      kind        TEXT NOT NULL,
      body        TEXT
    );

    CREATE TABLE IF NOT EXISTS remote_tokens (
      jti           TEXT PRIMARY KEY,
      client_name   TEXT NOT NULL,
      token_hash    TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      revoked_at    INTEGER,
      last_used_at  INTEGER,
      call_count    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kanban_cards (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      agent       TEXT,
      col         TEXT NOT NULL DEFAULT 'backlog',
      domain      TEXT,
      tags        TEXT DEFAULT '[]',
      due         TEXT,
      progress    REAL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS routines (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      description     TEXT,
      cron_expr       TEXT NOT NULL,
      agent_id        TEXT NOT NULL,
      prompt          TEXT NOT NULL,
      skill_ref       TEXT,
      notify_on       TEXT NOT NULL DEFAULT 'failure',
      notify_channel  TEXT,
      paused          INTEGER NOT NULL DEFAULT 0,
      last_run_ts     INTEGER,
      last_status     TEXT,
      next_run_ts     INTEGER,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_missions_agent ON missions(agent_id);
    CREATE INDEX IF NOT EXISTS idx_events_mission ON events(mission_id);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_col ON kanban_cards(col);
  `);

  ensureColumn(_db, "missions", "source_channel", "TEXT");
  ensureColumn(_db, "missions", "source_meta", "TEXT");
  ensureColumn(_db, "missions", "claude_session_id", "TEXT");
  ensureColumn(_db, "missions", "kind", "TEXT NOT NULL DEFAULT 'mission'");
  ensureColumn(_db, "missions", "routine_id", "TEXT");
  ensureColumn(_db, "kanban_cards", "mission_id", "TEXT");
  ensureColumn(_db, "kanban_cards", "not_before", "TEXT");
  ensureColumn(_db, "kanban_cards", "description", "TEXT");
  ensureColumn(_db, "kanban_cards", "notify_channel", "TEXT");
  ensureColumn(_db, "kanban_cards", "notify_on", "TEXT NOT NULL DEFAULT 'never'");
  ensureColumn(_db, "kanban_cards", "target_chat_ids", "TEXT");

  // ── Migrate legacy `routines` schemas (some agents have inserted via raw SQL with different column names)
  const routineCols = _db.prepare(`PRAGMA table_info(routines)`).all() as { name: string }[];
  const rCols = new Set(routineCols.map((c) => c.name));
  if (rCols.has("title") && !rCols.has("name")) {
    _db.exec(`ALTER TABLE routines RENAME COLUMN title TO name`);
  }
  if (rCols.has("cron") && !rCols.has("cron_expr")) {
    _db.exec(`ALTER TABLE routines RENAME COLUMN cron TO cron_expr`);
  }
  if (rCols.has("enabled") && !rCols.has("paused")) {
    _db.exec(`ALTER TABLE routines ADD COLUMN paused INTEGER NOT NULL DEFAULT 0`);
    _db.exec(`UPDATE routines SET paused = CASE WHEN enabled = 0 THEN 1 ELSE 0 END`);
  }
  ensureColumn(_db, "routines", "description", "TEXT");
  ensureColumn(_db, "routines", "prompt",      "TEXT");
  ensureColumn(_db, "routines", "skill_ref",   "TEXT");
  ensureColumn(_db, "routines", "notify_on",   "TEXT NOT NULL DEFAULT 'failure'");
  ensureColumn(_db, "routines", "last_status", "TEXT");
  ensureColumn(_db, "routines", "next_run_ts", "INTEGER");
  // JSON array of chat_ids to scope notifications to. null = broadcast to all subscribers.
  ensureColumn(_db, "routines", "target_chat_ids", "TEXT");
  // Fixed interval in seconds (overrides cron_expr when set — enables sub-minute scheduling).
  ensureColumn(_db, "routines", "interval_seconds", "INTEGER");
  // Backfill: any row created via legacy schema lacks prompt + next_run_ts.
  // - prompt: fall back to name so the scheduler has something to send
  // - next_run_ts: set to now so the scheduler picks it up on the next tick
  _db.exec(`UPDATE routines SET prompt = name WHERE prompt IS NULL OR prompt = ''`);
  _db.exec(`UPDATE routines SET next_run_ts = unixepoch() WHERE next_run_ts IS NULL AND paused = 0`);

  _db.exec(`CREATE INDEX IF NOT EXISTS idx_missions_routine ON missions(routine_id);`);

  return _db;
}

function ensureColumn(db: Database.Database, table: string, name: string, def: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
