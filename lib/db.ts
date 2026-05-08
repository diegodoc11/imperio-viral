// SQLite usando el módulo nativo node:sqlite (incluido en Node v22+).
// Cero dependencias nativas — no requiere Python ni Visual Studio.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/content.db";

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;

  const absPath = path.resolve(DB_PATH);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  _db = new DatabaseSync(absPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  return _db;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id              TEXT PRIMARY KEY,
  short_code      TEXT,
  url             TEXT NOT NULL,
  type            TEXT NOT NULL,

  owner_username  TEXT,
  owner_full_name TEXT,
  owner_id        TEXT,

  caption         TEXT,
  hashtags        TEXT NOT NULL DEFAULT '[]',
  mentions        TEXT NOT NULL DEFAULT '[]',
  location_name   TEXT,

  video_url       TEXT,
  video_duration  REAL,
  images          TEXT NOT NULL DEFAULT '[]',
  display_url     TEXT,

  music_artist    TEXT,
  music_track     TEXT,
  music_id        TEXT,

  likes_count        INTEGER NOT NULL DEFAULT 0,
  comments_count     INTEGER NOT NULL DEFAULT 0,
  video_view_count   INTEGER,
  video_play_count   INTEGER,
  shares_count       INTEGER,

  posted_at       INTEGER NOT NULL,
  scraped_at      INTEGER NOT NULL,
  source_hashtag  TEXT,
  source_profile  TEXT,
  language        TEXT,

  viral_velocity        REAL,
  engagement_score      REAL,
  engagement_rate       REAL,
  viral_score           REAL,
  viralidad_multiplier  REAL,
  viral_tier            TEXT,

  raw_json        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_scraped_at  ON posts(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_posted_at   ON posts(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_viral_score ON posts(viral_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_type        ON posts(type);
CREATE INDEX IF NOT EXISTS idx_posts_hashtag     ON posts(source_hashtag);
-- idx_posts_language se crea en runMigrations() porque la columna 'language'
-- se añade vía ALTER TABLE en DBs preexistentes y este script se ejecuta
-- antes de la migración.

CREATE TABLE IF NOT EXISTS decisions (
  post_id     TEXT PRIMARY KEY,
  decision    TEXT NOT NULL CHECK (decision IN ('replicate','maybe','skip')),
  notes       TEXT,
  decided_at  INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_decisions_decision ON decisions(decision);

CREATE TABLE IF NOT EXISTS transcriptions (
  post_id          TEXT PRIMARY KEY,
  transcription    TEXT NOT NULL,
  language         TEXT,
  transcribed_at   INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hashtag       TEXT,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  items_count   INTEGER,
  apify_run_id  TEXT,
  error         TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  username                  TEXT PRIMARY KEY,
  full_name                 TEXT,
  bio                       TEXT,
  followers_count           INTEGER,
  following_count           INTEGER,
  posts_count               INTEGER,
  profile_pic_url           TEXT,
  is_verified               INTEGER,
  language                  TEXT,
  median_engagement_score   REAL,
  median_engagement_rate    REAL,
  median_views              REAL,
  scraped_at                INTEGER NOT NULL
);

-- Jobs asíncronos lanzados desde la app (scrape de perfil / hashtag).
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  input         TEXT NOT NULL,
  status        TEXT NOT NULL,
  message       TEXT,
  result        TEXT,
  error         TEXT,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_started_at ON jobs(started_at DESC);
`;

// Migraciones idempotentes para DBs existentes que se crearon antes de
// añadir nuevas columnas. CREATE TABLE IF NOT EXISTS no añade columnas a
// tablas que ya existen, así que parchamos con ALTER TABLE controlado.
function runMigrations(): void {
  const db = getDb();
  const cols = db
    .prepare("PRAGMA table_info(posts)")
    .all() as Array<{ name: string }>;
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has("language")) {
    db.exec("ALTER TABLE posts ADD COLUMN language TEXT");
  }
  if (!colNames.has("engagement_score")) {
    db.exec("ALTER TABLE posts ADD COLUMN engagement_score REAL");
  }
  if (!colNames.has("source_profile")) {
    db.exec("ALTER TABLE posts ADD COLUMN source_profile TEXT");
  }
  if (!colNames.has("viralidad_multiplier")) {
    db.exec("ALTER TABLE posts ADD COLUMN viralidad_multiplier REAL");
  }
  if (!colNames.has("viral_tier")) {
    db.exec("ALTER TABLE posts ADD COLUMN viral_tier TEXT");
  }
  if (!colNames.has("hashtag_heat_mult")) {
    db.exec("ALTER TABLE posts ADD COLUMN hashtag_heat_mult REAL");
  }
  if (!colNames.has("hashtag_heat_tier")) {
    db.exec("ALTER TABLE posts ADD COLUMN hashtag_heat_tier TEXT");
  }
  if (!colNames.has("view_rate")) {
    db.exec("ALTER TABLE posts ADD COLUMN view_rate REAL");
  }
  // Idempotentes — corren tanto en DBs frescas (con la columna ya en
  // CREATE TABLE) como en migradas.
  db.exec("CREATE INDEX IF NOT EXISTS idx_posts_language ON posts(language)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_posts_engagement_score ON posts(engagement_score DESC)"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_posts_source_profile ON posts(source_profile)"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_posts_viral_tier ON posts(viral_tier)"
  );
}

export function initSchema(): void {
  const db = getDb();
  db.exec(SCHEMA_SQL);
  runMigrations();
}
