#!/usr/bin/env node
/**
 * Gerir que cadeiras sao seguidas neste semestre.
 *
 *   node scripts/course.mjs list                 cadeiras no Moodle e quais sigo
 *   node scripts/course.mjs semester 2025/26-S1  define o semestre ativo
 *   node scripts/course.mjs track 543 AS         segue o curso 543 como "AS"
 *   node scripts/course.mjs forget AS            arquiva material/AS/ e limpa a BD
 */

import { rename, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { openDb, getSetting, setSetting, MATERIAL_DIR } from '../lib/db.mjs';
import { resolveToken, callWs, nomeLimpo } from '../lib/moodle.mjs';

try { process.loadEnvFile('.env'); } catch {}

const CATEGORIAS = ['teoria', 'exercicios', 'exames', 'trabalhos', 'outros'];
const existe = async (p) => access(p).then(() => true, () => false);
const hoje = () => new Date().toISOString().slice(0, 10);

const db = openDb();
const [cmd, ...args] = process.argv.slice(2);

// ---------------------------------------------------------------------------

async function list() {
  const semestre = getSetting(db, 'active_semester');
  console.log(`Semestre ativo: ${semestre || '(nenhum — corre "semester <nome>")'}\n`);

  const seguidas = new Map(db.prepare('SELECT * FROM courses').all().map((c) => [c.id, c]));
  const token = await resolveToken();
  const site = await callWs(token, 'core_webservice_get_site_info');
  const cursos = await callWs(token, 'core_enrol_get_users_courses', { userid: String(site.userid) });

  for (const c of cursos) {
    const s = seguidas.get(c.id);
    const marca = !s ? '     ' : s.semester === semestre ? ` [${s.slug}]` : ` (${s.slug}, ${s.semester})`;
    console.log(`  ${String(c.id).padStart(4)}${marca.padEnd(22)} ${nomeLimpo(c.fullname)}`);
  }

  // Cadeiras que sigo mas que ja nao estao na minha inscricao: o sinal de que
  // a edicao do ano passado foi substituida.
  const ids = new Set(cursos.map((c) => c.id));
  const orfas = [...seguidas.values()].filter((s) => !ids.has(s.id));
  if (orfas.length) {
    console.log('\nJa nao estas inscrito nestas, mas continuam a ser seguidas:');
    for (const o of orfas) console.log(`  ${o.id}  [${o.slug}]  -> node scripts/course.mjs forget ${o.slug}`);
  }
}

async function track(id, slug) {
  if (!id || !slug) throw new Error('uso: track <id-do-moodle> <SLUG>');
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw new Error(`slug invalido: "${slug}" (so letras, numeros, - e _ — vai ser um nome de pasta)`);

  const semestre = getSetting(db, 'active_semester');
  if (!semestre) throw new Error('Define primeiro o semestre: node scripts/course.mjs semester 2025/26-S1');

  const ocupado = db.prepare('SELECT * FROM courses WHERE slug = ?').get(slug);
  if (ocupado && ocupado.id !== Number(id))
    throw new Error(
      `O slug "${slug}" ja esta a ser usado pelo curso ${ocupado.id} (${nomeLimpo(ocupado.fullname)}).\n` +
      `  Se e a edicao antiga a dar lugar a esta:  node scripts/course.mjs forget ${slug}`,
    );

  const token = await resolveToken();
  const site = await callWs(token, 'core_webservice_get_site_info');
  const cursos = await callWs(token, 'core_enrol_get_users_courses', { userid: String(site.userid) });
  const c = cursos.find((x) => x.id === Number(id));
  if (!c) throw new Error(`Nao estas inscrito no curso ${id}. Corre "list" para ver os que ha.`);

  db.prepare(
    `INSERT INTO courses(id,shortname,fullname,slug,semester) VALUES(?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, semester=excluded.semester,
                                   shortname=excluded.shortname, fullname=excluded.fullname`,
  ).run(c.id, c.shortname, c.fullname, slug, semestre);

  for (const cat of CATEGORIAS) await mkdir(join(MATERIAL_DIR, slug, cat), { recursive: true });
  console.log(`[${slug}] ${nomeLimpo(c.fullname)} (curso ${c.id}) — semestre ${semestre}`);
  console.log(`Pastas em ${join(MATERIAL_DIR, slug)}/. Corre "node scripts/sync.mjs" para trazer o material.`);
}

async function forget(alvo) {
  if (!alvo) throw new Error('uso: forget <SLUG-ou-id>');
  const c = db.prepare('SELECT * FROM courses WHERE slug = ? OR id = ?').get(alvo, Number(alvo) || -1);
  if (!c) throw new Error(`Nao sigo nenhuma cadeira "${alvo}". Corre "list".`);

  const conta = (t, w) => db.prepare(`SELECT count(*) n FROM ${t} WHERE ${w}`).get(c.id).n;
  const mods = conta('modules', 'course_id = ?');
  const fich = db.prepare('SELECT count(*) n FROM files WHERE module_id IN (SELECT id FROM modules WHERE course_id = ?)').get(c.id).n;

  // Os ficheiros nao se apagam — arquivam-se. Se de facto os quiseres fora
  // daqui, um rm a pasta de arquivo resolve, e ai a escolha e tua.
  const pasta = join(MATERIAL_DIR, c.slug);
  let destino = null;
  if (await existe(pasta)) {
    destino = join(MATERIAL_DIR, '.arquivo', `${c.slug}-${c.id}-${hoje()}`);
    await mkdir(join(MATERIAL_DIR, '.arquivo'), { recursive: true });
    await rename(pasta, destino);
  }
  db.prepare('DELETE FROM courses WHERE id = ?').run(c.id); // cascade leva o resto

  console.log(`Esquecida [${c.slug}] ${nomeLimpo(c.fullname)} (curso ${c.id})`);
  console.log(`  base de dados: ${mods} modulos e ${fich} ficheiros removidos`);
  console.log(destino ? `  ficheiros:     movidos para ${destino}` : '  ficheiros:     nao havia pasta');
  console.log(`\nO slug "${c.slug}" esta livre:  node scripts/course.mjs track <novo-id> ${c.slug}`);
}

// ---------------------------------------------------------------------------

const comandos = {
  list,
  track: () => track(args[0], args[1]),
  forget: () => forget(args[0]),
  semester: () => {
    if (!args[0]) return console.log(getSetting(db, 'active_semester') || '(nenhum)');
    setSetting(db, 'active_semester', args[0]);
    console.log(`Semestre ativo: ${args[0]}`);
  },
};

try {
  if (!comandos[cmd]) {
    console.log('uso: node scripts/course.mjs <list|semester|track|forget> [args]');
    process.exit(cmd ? 1 : 0);
  }
  await comandos[cmd]();
} catch (e) {
  console.error(`\n\x1b[31m${e.message}\x1b[0m`);
  process.exit(1);
}
