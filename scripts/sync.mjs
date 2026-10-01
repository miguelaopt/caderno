#!/usr/bin/env node
/**
 * Sincronizacao incremental: Moodle -> material/ + base de dados.
 *
 *   node scripts/sync.mjs             sincroniza as cadeiras do semestre ativo
 *   node scripts/sync.mjs --dry-run   diz o que faria, sem escrever nada
 *   node scripts/sync.mjs --slug AS   so uma cadeira
 *
 * Duas portas para nao reprocessar o que ja foi processado:
 *   1. timemodified do Moodle  -> vale a pena descarregar? (nao gasta rede)
 *   2. sha256 dos bytes        -> vale a pena extrair e reanalisar?
 * O Moodle mexe no timemodified por dá cá aquela palha; o hash e a defesa real.
 */

import { createHash } from 'node:crypto';
import { writeFile, rename, mkdir, access, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { openDb, getSetting, MATERIAL_DIR } from '../lib/db.mjs';
import { resolveToken, callWs, getBytes, nomeLimpo, MoodleError } from '../lib/moodle.mjs';
import { categorizar, nomeFicheiroSeguro, ehListaDePessoas } from '../lib/categorize.mjs';
import { extrairTexto } from '../lib/extract.mjs';

try { process.loadEnvFile('.env'); } catch {}

const DRY = process.argv.includes('--dry-run');
const iSlug = process.argv.indexOf('--slug');
const SO_SLUG = iSlug >= 0 ? process.argv[iSlug + 1] : null;  // indexOf da -1: argv[0] e o node
const agora = () => Math.floor(Date.now() / 1000);
const existe = (p) => access(p).then(() => true, () => false);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const kb = (n) => `${(n / 1024).toFixed(0)}kB`;

const db = openDb();
const log = console.log;

// ---------------------------------------------------------------------------

/** Escrita atomica: um sync interrompido nao deixa um PDF truncado. */
async function gravar(caminho, bytes) {
  await mkdir(dirname(caminho), { recursive: true });
  const tmp = `${caminho}.parcial`;
  await writeFile(tmp, bytes);
  await rename(tmp, caminho);
}

/** Caminho livre: dois modulos podem publicar ficheiros com o mesmo nome. */
function caminhoLivre(slug, categoria, filename, moduleId) {
  const nome = nomeFicheiroSeguro(filename);
  const base = join(MATERIAL_DIR, slug, categoria, nome);
  const dono = db.prepare('SELECT module_id FROM files WHERE path = ?').get(base);
  if (!dono || dono.module_id === moduleId) return base;
  const p = nome.lastIndexOf('.');
  const [raiz, ext] = p > 0 ? [nome.slice(0, p), nome.slice(p)] : [nome, ''];
  return join(MATERIAL_DIR, slug, categoria, `${raiz}-${moduleId}${ext}`);
}

// ---------------------------------------------------------------------------

const upsertModule = db.prepare(`
  INSERT INTO modules(id,course_id,section_name,modname,name,url,category,category_source,moodle_lastmodified,first_seen_at,last_changed_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    section_name=excluded.section_name, modname=excluded.modname, name=excluded.name,
    url=excluded.url, moodle_lastmodified=excluded.moodle_lastmodified,
    last_changed_at=excluded.last_changed_at,
    -- uma categoria posta a mao nao e pisada pelo sync
    category        = CASE WHEN modules.category_source='manual' THEN modules.category        ELSE excluded.category        END,
    category_source = CASE WHEN modules.category_source='manual' THEN 'manual'                ELSE excluded.category_source END`);

const upsertDeadline = db.prepare(`
  INSERT INTO deadlines(course_id,module_id,kind,title,due_at,source) VALUES(?,?,?,?,?,'moodle')
  ON CONFLICT(module_id,kind,due_at) DO UPDATE SET title=excluded.title`);

const getFile = db.prepare('SELECT * FROM files WHERE module_id=? AND filename=?');
const insertFile = db.prepare(`
  INSERT INTO files(module_id,filename,fileurl,mimetype,filesize,moodle_timemodified,llm_ok)
  VALUES(?,?,?,?,?,?,?)`);
const touchFile = db.prepare(`
  UPDATE files SET fileurl=?, mimetype=?, filesize=?, moodle_timemodified=?, llm_ok=? WHERE id=?`);
const saveConteudo = db.prepare(`
  UPDATE files SET content_hash=?, path=?, text=?, text_status=?, downloaded_at=? WHERE id=?`);

// ---------------------------------------------------------------------------

async function syncCurso(curso, token, stats) {
  log(`\n\x1b[1m[${curso.slug}]\x1b[0m ${nomeLimpo(curso.fullname)}`);

  let seccoes;
  try {
    seccoes = await callWs(token, 'core_course_get_contents', { courseid: String(curso.id) });
  } catch (e) {
    if (e instanceof MoodleError && e.kind === 'CURSO_INEXISTENTE') {
      log(`  ja nao existe no Moodle -> node scripts/course.mjs forget ${curso.slug}`);
      stats.erros.push(`${curso.slug}: curso inexistente`);
      return;
    }
    throw e;
  }

  for (const sec of seccoes) {
    for (const mod of sec.modules || []) {
      const ficheiros = (mod.contents || []).filter((c) => c.type === 'file');
      const primeiro = ficheiros[0]?.filename || '';
      const { categoria, origem } = categorizar(sec.name, mod.name, primeiro);
      const llmOk = origem === 'pauta' ? 0 : 1;

      const jaVisto = db.prepare('SELECT id FROM modules WHERE id=?').get(mod.id);
      if (!DRY) {
        upsertModule.run(mod.id, curso.id, sec.name, mod.modname, mod.name, mod.url ?? null,
          categoria, origem === 'pauta' ? 'modulo' : origem,
          mod.contentsinfo?.lastmodified ?? null, agora(), agora());  // first_seen_at so conta no INSERT
      }
      if (!jaVisto) stats.modulosNovos++;

      // Prazos: vem no mesmo pedido, em dates[] com dataid "duedate".
      for (const d of mod.dates || []) {
        if (d.dataid !== 'duedate' || !d.timestamp) continue;
        if (!DRY) upsertDeadline.run(curso.id, mod.id, 'entrega', mod.name, d.timestamp);
        stats.prazos++;
      }

      for (const f of ficheiros) {
        await syncFicheiro(curso, mod, f, categoria, llmOk, token, stats);
      }
    }
  }
  if (!DRY) db.prepare('UPDATE courses SET last_synced_at=? WHERE id=?').run(agora(), curso.id);
}

async function syncFicheiro(curso, mod, f, categoria, llmOk, token, stats) {
  const linha = getFile.get(mod.id, f.filename);
  const id = linha
    ? (DRY ? linha.id : (touchFile.run(f.fileurl, f.mimetype ?? null, f.filesize ?? null, f.timemodified, llmOk, linha.id), linha.id))
    : (DRY ? null : insertFile.run(mod.id, f.filename, f.fileurl, f.mimetype ?? null, f.filesize ?? null, f.timemodified, llmOk).lastInsertRowid);

  const mudou = !linha || linha.moodle_timemodified !== f.timemodified;
  const sumido = linha?.path && !(await existe(linha.path));
  if (!mudou && !sumido) return;

  const etiqueta = `  ${categoria.padEnd(11)} ${nomeFicheiroSeguro(f.filename)}`;
  if (DRY) {
    log(`${etiqueta}  ${!linha ? 'NOVO' : sumido ? 'em falta no disco' : 'ALTERADO'} (${kb(f.filesize || 0)})`);
    stats.porDescarregar++;
    return;
  }

  let bytes;
  try {
    bytes = await getBytes(f.fileurl, token);
  } catch (e) {
    log(`${etiqueta}  \x1b[31mfalhou o download\x1b[0m: ${e.message.split('\n')[0]}`);
    stats.erros.push(`${curso.slug}/${f.filename}: ${e.message.split('\n')[0]}`);
    return;
  }

  const hash = sha256(bytes);
  const caminho = caminhoLivre(curso.slug, categoria, f.filename, mod.id);

  // O Moodle mexeu no timemodified mas os bytes sao os mesmos: nada a reanalisar.
  if (linha?.content_hash === hash && (await existe(caminho))) {
    log(`${etiqueta}  timemodified mudou, conteudo nao — nada a fazer`);
    stats.inalterados++;
    return;
  }

  await gravar(caminho, bytes);
  // O ficheiro pode ter mudado de categoria (uma regra mudou, ou o professor
  // renomeou o modulo): a copia antiga fica para tras se nao a limparmos.
  if (linha?.path && linha.path !== caminho) await unlink(linha.path).catch(() => {});

  const { status, texto, erro } = await extrairTexto(bytes, f.mimetype, f.filename);
  // Com o texto na mao ja se ve o que o nome escondia: uma lista de pessoas
  // nunca sai desta maquina, chame-se ela o que se chamar.
  if (ehListaDePessoas(texto)) db.prepare('UPDATE files SET llm_ok = 0 WHERE id = ?').run(id);
  saveConteudo.run(hash, caminho, texto || null, status, agora(), id);
  // Conteudo novo invalida o resumo antigo (Fase 3 volta a analisar).
  if (linha?.content_hash && linha.content_hash !== hash)
    db.prepare('DELETE FROM analyses WHERE file_id=?').run(id);

  const nota = status === 'ok' ? `${texto.length} chars`
    : status === 'vazio' ? '\x1b[33msem texto (digitalizado? so OCR resolveria)\x1b[0m'
    : status === 'falhou' ? `\x1b[31mextracao falhou: ${erro}\x1b[0m` : 'nao e PDF';
  log(`${etiqueta}  ${linha ? 'atualizado' : 'novo'} ${kb(bytes.length)}, ${nota}`);
  linha ? stats.atualizados++ : stats.novos++;
  stats.bytes += bytes.length;
}

// ---------------------------------------------------------------------------

async function main() {
  const semestre = getSetting(db, 'active_semester');
  if (!semestre) throw new Error('Nenhum semestre ativo. Corre: node scripts/course.mjs semester 2025/26-S1');

  const cursos = SO_SLUG
    ? db.prepare('SELECT * FROM courses WHERE slug=?').all(SO_SLUG)
    : db.prepare('SELECT * FROM courses WHERE semester=? ORDER BY slug').all(semestre);

  if (!cursos.length)
    throw new Error(SO_SLUG ? `Nao sigo nenhuma cadeira "${SO_SLUG}".`
      : `Nenhuma cadeira seguida em ${semestre}. Corre: node scripts/course.mjs track <id> <SLUG>`);

  log(`Semestre ${semestre} — ${cursos.length} cadeira(s)${DRY ? '  \x1b[33m[dry-run: nao escreve nada]\x1b[0m' : ''}`);

  const stats = { modulosNovos: 0, novos: 0, atualizados: 0, inalterados: 0, porDescarregar: 0, prazos: 0, bytes: 0, erros: [] };
  const runId = DRY ? null : db.prepare('INSERT INTO sync_runs(started_at,status) VALUES(?,?)').run(agora(), 'a-correr').lastInsertRowid;
  const token = await resolveToken();

  try {
    for (const c of cursos) await syncCurso(c, token, stats);
  } finally {
    if (runId) db.prepare('UPDATE sync_runs SET finished_at=?, status=?, stats=? WHERE id=?')
      .run(agora(), stats.erros.length ? 'com-erros' : 'ok', JSON.stringify(stats), runId);
  }

  log('\n' + '─'.repeat(50));
  if (DRY) log(`${stats.porDescarregar} ficheiro(s) por descarregar. Corre sem --dry-run.`);
  else log(`${stats.novos} novos, ${stats.atualizados} atualizados, ${stats.inalterados} sem mudanca real, ${kb(stats.bytes)} descarregados`);
  log(`${stats.modulosNovos} modulos novos, ${stats.prazos} prazos`);

  // Analises da edicao anterior da cadeira (guardadas por hash antes do
  // "forget") voltam a colar-se aos PDFs que o professor reaproveitou.
  if (!DRY && db.prepare("SELECT 1 FROM sqlite_master WHERE name='analyses_por_hash'").get()) {
    const r = db.prepare(`INSERT OR IGNORE INTO analyses(file_id,model,prompt_version,summary,topics,created_at)
      SELECT f.id,c.model,c.prompt_version,c.summary,c.topics,c.created_at
      FROM files f JOIN analyses_por_hash c ON c.content_hash=f.content_hash`).run();
    if (r.changes) log(`${r.changes} analise(s) recuperadas da edicao anterior (sem custo)`);
  }

  const proximos = db.prepare(`
    SELECT c.slug, d.title, d.due_at FROM deadlines d JOIN courses c ON c.id=d.course_id
    WHERE d.due_at > ? AND d.done_at IS NULL ORDER BY d.due_at LIMIT 5`).all(agora());
  if (proximos.length) {
    log('\nProximos prazos:');
    for (const p of proximos) {
      const dias = Math.ceil((p.due_at - agora()) / 86400);
      log(`  ${new Date(p.due_at * 1000).toISOString().slice(0, 10)}  (${dias}d)  [${p.slug}] ${p.title}`);
    }
  }
  if (stats.erros.length) {
    log(`\n\x1b[31m${stats.erros.length} erro(s):\x1b[0m`);
    for (const e of stats.erros) log(`  ${e}`);
  }
}

try {
  await main();
} catch (e) {
  console.error(`\n\x1b[31m${e.message}\x1b[0m`);
  process.exit(1);
}
