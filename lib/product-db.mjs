import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const PRODUCT_DB_PATH = process.env.PRODUCT_DB_PATH || 'data/product.db';
export const PRODUCT_FILES_DIR = process.env.PRODUCT_FILES_DIR || 'data/product-files';

const schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, plan TEXT NOT NULL DEFAULT 'free', email_verified_at INTEGER,
  stripe_customer_id TEXT, stripe_subscription_id TEXT, stripe_status TEXT, stripe_event_at INTEGER,
  complimentary_at INTEGER, complimentary_override_at INTEGER
);
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, processed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_verifications (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  sent_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS moodle_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_enc TEXT NOT NULL, moodle_user_id INTEGER NOT NULL,
  site_name TEXT NOT NULL, functions_json TEXT NOT NULL,
  connected_at INTEGER NOT NULL, last_error TEXT
);
CREATE TABLE IF NOT EXISTS ai_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, base_url TEXT, key_enc TEXT NOT NULL,
  summary_model TEXT NOT NULL, explain_model TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  moodle_id INTEGER, name TEXT NOT NULL, shortname TEXT NOT NULL,
  selected INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL CHECK(source IN ('moodle','manual')),
  exam_at INTEGER, last_synced_at INTEGER,
  UNIQUE(user_id,moodle_id)
);
CREATE INDEX IF NOT EXISTS courses_user ON courses(user_id,selected);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  moodle_module_id INTEGER, filename TEXT NOT NULL, fileurl TEXT,
  mime TEXT NOT NULL, size INTEGER NOT NULL, moodle_modified INTEGER,
  hash TEXT, path TEXT, text TEXT, text_status TEXT,
  source TEXT NOT NULL CHECK(source IN ('moodle','upload')),
  pages_json TEXT,
  first_seen_at INTEGER NOT NULL, changed_at INTEGER NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
  UNIQUE(course_id,moodle_module_id,filename)
);
CREATE INDEX IF NOT EXISTS files_course ON files(course_id,changed_at);
CREATE TABLE IF NOT EXISTS deadlines (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  moodle_module_id INTEGER, kind TEXT NOT NULL, title TEXT NOT NULL,
  due_at INTEGER NOT NULL, source TEXT NOT NULL,
  UNIQUE(course_id,moodle_module_id,kind,due_at)
);
CREATE TABLE IF NOT EXISTS analyses (
  file_id TEXT PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  hash TEXT NOT NULL, model TEXT NOT NULL, summary TEXT NOT NULL,
  topics_json TEXT NOT NULL, questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis_cache (
  hash TEXT NOT NULL, prompt_version INTEGER NOT NULL, model TEXT NOT NULL,
  summary TEXT NOT NULL, topics_json TEXT NOT NULL, questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY(hash,prompt_version)
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL, cost_usd REAL NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_user_month ON ai_usage(user_id,created_at);
CREATE TABLE IF NOT EXISTS study_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  studied_at INTEGER NOT NULL, minutes INTEGER NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS card_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL, studied_at INTEGER NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quiz_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL, answered_at INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK(correct IN (0,1))
);
CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  minutes_per_day INTEGER NOT NULL DEFAULT 45, digest_hour INTEGER,
  digest_channel TEXT, theme TEXT NOT NULL DEFAULT 'dark',
  minutes_by_weekday_json TEXT, last_seen_at INTEGER, ai_consent_at INTEGER,
  digest_sent_on TEXT
);
CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL,
  new_count INTEGER NOT NULL DEFAULT 0, error TEXT
);
CREATE INDEX IF NOT EXISTS sync_runs_user ON sync_runs(user_id,started_at);
`;

export function openProductDb(path = PRODUCT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(schema);
  const columns = (table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  if (!columns('users').has('email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER');
  for (const name of ['stripe_customer_id', 'stripe_subscription_id', 'stripe_status'])
    if (!columns('users').has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} TEXT`);
  if (!columns('users').has('stripe_event_at')) db.exec('ALTER TABLE users ADD COLUMN stripe_event_at INTEGER');
  if (!columns('users').has('complimentary_at')) db.exec('ALTER TABLE users ADD COLUMN complimentary_at INTEGER');
  if (!columns('users').has('complimentary_override_at')) db.exec('ALTER TABLE users ADD COLUMN complimentary_override_at INTEGER');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer ON users(stripe_customer_id)');
  const preferenceColumns = columns('preferences');
  if (!preferenceColumns.has('minutes_by_weekday_json')) db.exec('ALTER TABLE preferences ADD COLUMN minutes_by_weekday_json TEXT');
  if (!preferenceColumns.has('last_seen_at')) db.exec('ALTER TABLE preferences ADD COLUMN last_seen_at INTEGER');
  if (!preferenceColumns.has('ai_consent_at')) db.exec('ALTER TABLE preferences ADD COLUMN ai_consent_at INTEGER');
  if (!preferenceColumns.has('digest_sent_on')) db.exec('ALTER TABLE preferences ADD COLUMN digest_sent_on TEXT');
  if (!columns('files').has('pages_json')) db.exec('ALTER TABLE files ADD COLUMN pages_json TEXT');
  if (!columns('files').has('favorite')) db.exec('ALTER TABLE files ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1))');
  return db;
}
