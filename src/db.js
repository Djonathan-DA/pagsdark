// Banco de dados local em SQLite, usando o modulo nativo do Node (node:sqlite).
// Sem compilacao nativa: funciona direto no Node 22.5+.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from './config.js';

// Garante que as pastas de dados existem.
for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(DIRS.data, 'dark.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS workspaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,            -- youtube | instagram | tiktok | kwai
  display_name TEXT,
  external_id TEXT,                  -- id da conta na rede (canal, ig user, etc.)
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TEXT,
  scopes TEXT,
  meta TEXT,                         -- JSON extra por plataforma
  status TEXT NOT NULL DEFAULT 'connected',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS molds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  canvas_w INTEGER NOT NULL,
  canvas_h INTEGER NOT NULL,
  area_x INTEGER NOT NULL,
  area_y INTEGER NOT NULL,
  area_w INTEGER NOT NULL,
  area_h INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                -- source | rendered
  file_path TEXT NOT NULL,
  label TEXT,
  duration REAL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mold_id INTEGER REFERENCES molds(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running',  -- running | done | failed
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  output_dir TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS render_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES render_jobs(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  output_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | done | failed
  error TEXT
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,          -- YYYY-MM-DD
  posts_per_day INTEGER NOT NULL,
  time_slots TEXT NOT NULL,          -- JSON: ["08:00","10:00",...]
  account_ids TEXT NOT NULL,         -- JSON: [1,2,3]
  fanout TEXT NOT NULL DEFAULT 'cross', -- cross | roundrobin
  caption_template TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | done
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  media_path TEXT NOT NULL,
  caption TEXT,
  scheduled_at TEXT NOT NULL,        -- ISO em hora local
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | posting | posted | failed | canceled
  external_post_id TEXT,
  error TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_posts_due ON posts(status, scheduled_at);
`);

export default db;

// ----- Helpers genericos -----
export function all(sql, params = []) { return db.prepare(sql).all(...params); }
export function get(sql, params = []) { return db.prepare(sql).get(...params); }
export function run(sql, params = []) { return db.prepare(sql).run(...params); }
export function insert(sql, params = []) { return db.prepare(sql).run(...params).lastInsertRowid; }
