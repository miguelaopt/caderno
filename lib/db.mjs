/**
 * Base de dados: SQLite via node:sqlite (nativo, sem dependencias).
 *
 * Schema idempotente — nao ha sistema de migracoes e nao vale a pena ter um
 * para uma base de dados de um so utilizador que se pode apagar e resincronizar.
 * ponytail: recriar do zero e a "migracao"; se um dia doer, ai sim.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { ehListaDePessoas } from './categorize.mjs';
import { dirname } from 'node:path';

export const DB_PATH = process.env.DB_PATH || 'data/estudo.db';
export const MATERIAL_DIR = process.env.MATERIAL_DIR || 'material';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id        INTEGER PRIMARY KEY,          -- id do Moodle
  shortname TEXT NOT NULL,
  fullname  TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,         -- 'AS' -> material/AS/
  semester  TEXT,                         -- NULL = nao seguida
  last_synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS modules (
  id        INTEGER PRIMARY KEY,          -- cmid do Moodle
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  modname   TEXT NOT NULL,
  name      TEXT NOT NULL,
  url       TEXT,
  category  TEXT NOT NULL,                -- teoria|exercicios|exames|trabalhos|outros
  category_source TEXT NOT NULL,          -- seccao|regra|manual
  moodle_lastmodified INTEGER,
  first_seen_at   INTEGER NOT NULL,
  last_changed_at INTEGER
);

CREATE TABLE IF NOT EXISTS files (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  filename  TEXT NOT NULL,
  fileurl   TEXT NOT NULL,
  mimetype  TEXT,
  filesize  INTEGER,
  moodle_timemodified INTEGER NOT NULL,   -- porta 1: vale a pena descarregar?
  content_hash TEXT,                      -- porta 2: sha256, vale a pena reanalisar?
  path      TEXT,                         -- material/AS/teoria/x.pdf
  text      TEXT,
  text_status TEXT,                       -- pendente|ok|falhou|vazio
  llm_ok    INTEGER NOT NULL DEFAULT 1,   -- 0 = pauta, nunca sai desta maquina
  downloaded_at INTEGER,
  UNIQUE(module_id, filename)
);

CREATE TABLE IF NOT EXISTS deadlines (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
  kind      TEXT NOT NULL,                -- entrega|exame|manual
  title     TEXT NOT NULL,
  due_at    INTEGER NOT NULL,
  source    TEXT NOT NULL,                -- moodle|manual
  done_at   INTEGER,
  UNIQUE(module_id, kind, due_at)
);

CREATE TABLE IF NOT EXISTS analyses (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  model   TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  topics  TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(file_id, prompt_version)
);

-- Nao ha tabela de planos: o plano calcula-se na hora, a partir do que se
-- sabe. Guardar planos por dia so serve para acumular atrasos por cumprir.
-- O que se guarda e o que aconteceu de facto.
DROP TABLE IF EXISTS plan_items;

CREATE TABLE IF NOT EXISTS study_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  studied_at INTEGER NOT NULL,
  minutes    INTEGER NOT NULL,
  resultado  TEXT NOT NULL          -- bem | assim | mal (alimenta a repeticao espacada)
);
CREATE INDEX IF NOT EXISTS idx_log_file ON study_log(file_id, studied_at);

-- Cada pergunta de revisao de uma analise e uma carta. Nao ha tabela de
-- cartas: a carta E a pergunta, identificada pelo ficheiro e pelo indice.
-- So o que aconteceu com ela e que se guarda.
CREATE TABLE IF NOT EXISTS card_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  studied_at INTEGER NOT NULL,
  resultado  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_card ON card_log(file_id, idx, studied_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL, finished_at INTEGER,
  status TEXT, error TEXT, stats TEXT
);

CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);
CREATE INDEX IF NOT EXISTS idx_files_module   ON files(module_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due  ON deadlines(due_at);
`;

export function openDb(path = DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export const getSetting = (db, key, fallback = null) =>
  db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;

export const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));

/**
 * Ficheiros a mandar para o LLM: com texto extraido, autorizados, e ainda sem
 * analise para esta versao do prompt.
 *
 * O filtro llm_ok = 1 e a garantia de que as pautas de notas e presencas nunca
 * saem desta maquina. Vive aqui, num sitio so, e nao espalhado por quem chama.
 *
 * A ordem e por valor de estudo, nao por id: materia primeiro, papelada por
 * ultimo. Assim um --limit testa o que interessa, e se o orcamento acabar a
 * meio ficaste com a materia analisada e a bibliografia por analisar.
 */
export function ficheirosPorAnalisar(db, promptVersion) {
  const candidatos = db.prepare(`
    SELECT f.id, f.filename, f.text, m.name AS modulo, m.category, c.slug, c.fullname
    FROM files f
    JOIN modules m ON m.id = f.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE f.llm_ok = 1
      AND f.text_status = 'ok'
      AND f.text IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.file_id = f.id AND a.prompt_version = ?)
    ORDER BY CASE m.category
               WHEN 'teoria'     THEN 1
               WHEN 'exercicios' THEN 2
               WHEN 'exames'     THEN 3
               WHEN 'trabalhos'  THEN 4
               ELSE 5 END,
             c.slug, f.id`).all(promptVersion);

  // Ultima porta antes de o texto sair da maquina. O nome do ficheiro ja
  // mentiu uma vez; aqui olha-se ao conteudo. A decisao fica gravada para
  // nao se repetir a verificacao nem o risco.
  const marcar = db.prepare('UPDATE files SET llm_ok = 0 WHERE id = ?');
  return candidatos.filter((f) => {
    if (!ehListaDePessoas(f.text)) return true;
    marcar.run(f.id);
    db.prepare('DELETE FROM analyses WHERE file_id = ?').run(f.id);
    return false;
  });
}
