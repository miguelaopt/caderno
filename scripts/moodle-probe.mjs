#!/usr/bin/env node
/**
 * Fase 1 — sonda da Web Services API do Moodle.
 *
 * Objetivo: descobrir se os Web Services estao sequer acessiveis nesta
 * instalação Moodle, e despejar a estrutura real do JSON de uma cadeira para
 * inspecao. Nao faz parte da app; e descartavel.
 *
 * Correr:  node scripts/moodle-probe.mjs
 * Testes:  node test.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { callWs, resolveToken, baseUrl } from '../lib/moodle.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile('.env');
} catch {
  // sem .env: assume-se que as variaveis vem do ambiente
}

const env = process.env;
const OUT_DIR = env.MOODLE_OUT_DIR || 'out';
const REQUEST_GAP_MS = Number(env.MOODLE_REQUEST_GAP_MS || 500); // so para o aviso do --sections


// ---------------------------------------------------------------------------
// Resumo da estrutura (para eu perceber o JSON sem ler 20k linhas)
// ---------------------------------------------------------------------------

function summarizeContents(sections) {
  const porTipo = new Map();
  let totalModulos = 0;
  let totalFicheiros = 0;
  const exemplos = new Map();

  for (const sec of sections) {
    for (const mod of sec.modules || []) {
      totalModulos++;
      porTipo.set(mod.modname, (porTipo.get(mod.modname) || 0) + 1);
      if (!exemplos.has(mod.modname)) exemplos.set(mod.modname, mod);
      totalFicheiros += (mod.contents || []).filter((c) => c.type === 'file').length;
    }
  }
  return { seccoes: sections.length, totalModulos, totalFicheiros, porTipo, exemplos };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const log = console.log;
const h = (t) => log(`\n\x1b[1m${t}\x1b[0m\n${'-'.repeat(t.length)}`);

async function main() {
  const base = baseUrl();

  await mkdir(OUT_DIR, { recursive: true });

  // 1. Token
  h('1. Token');
  const token = await resolveToken();
  log('A usar uma chave Moodle sem a mostrar.');

  // 2. Site info — valida o token e diz-nos que funcoes temos
  h('2. core_webservice_get_site_info');
  const site = await callWs(token, 'core_webservice_get_site_info');
  log(`Site:     ${site.sitename}`);
  log(`Moodle:   ${site.release} (version ${site.version})`);
  log(`Utilizador: ${site.fullname} (${site.username}, id ${site.userid})`);
  log(`Funcoes disponiveis neste servico: ${(site.functions || []).length}`);

  const funcoes = new Set((site.functions || []).map((f) => f.name));
  const precisamos = [
    'core_enrol_get_users_courses',
    'core_course_get_contents',
    'core_calendar_get_action_events_by_timesort',
    'mod_assign_get_assignments',
    'core_files_get_files',
  ];
  for (const f of precisamos) {
    log(`  ${funcoes.has(f) ? '[ok]  ' : '[FALTA]'} ${f}`);
  }
  await writeFile(join(OUT_DIR, 'site-info.json'), JSON.stringify(site, null, 2));

  // 3. Cadeiras
  h('3. core_enrol_get_users_courses');
  const courses = await callWs(token, 'core_enrol_get_users_courses', {
    userid: String(site.userid),
  });
  log(`${courses.length} cadeiras:\n`);
  for (const c of courses) {
    const fim = c.enddate ? new Date(c.enddate * 1000).toISOString().slice(0, 10) : '—';
    log(`  ${String(c.id).padStart(6)}  ${c.shortname.padEnd(18)}  fim:${fim}  ${c.fullname}`);
  }
  await writeFile(join(OUT_DIR, 'courses.json'), JSON.stringify(courses, null, 2));

  if (courses.length === 0) {
    log('\nSem cadeiras — nada para inspecionar. Fim.');
    return;
  }

  // 4. Conteudos de UMA cadeira
  const alvo = env.MOODLE_COURSE_ID
    ? courses.find((c) => String(c.id) === String(env.MOODLE_COURSE_ID)) || { id: Number(env.MOODLE_COURSE_ID), shortname: '?' }
    : courses[0];

  h(`4. core_course_get_contents (curso ${alvo.id} — ${alvo.shortname})`);
  const contents = await callWs(token, 'core_course_get_contents', {
    courseid: String(alvo.id),
  });

  const ficheiro = join(OUT_DIR, `course-${alvo.id}-contents.json`);
  await writeFile(ficheiro, JSON.stringify(contents, null, 2));
  log(`JSON completo escrito em ${ficheiro}\n`);

  const s = summarizeContents(contents);
  log(`Seccoes: ${s.seccoes} | modulos: ${s.totalModulos} | ficheiros descarregaveis: ${s.totalFicheiros}`);
  log('\nModulos por tipo:');
  for (const [tipo, n] of [...s.porTipo].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(n).padStart(4)}  ${tipo}`);
  }
  log('\nCampos de um modulo tipico (chaves de nivel 1):');
  const [tipoEx, modEx] = [...s.exemplos][0];
  log(`  [${tipoEx}] ${Object.keys(modEx).join(', ')}`);
  const fileEx = (modEx.contents || [])[0];
  if (fileEx) log(`  contents[0]: ${Object.keys(fileEx).join(', ')}`);

  log('\nNota: os fileurl dos ficheiros precisam de ?token=<TOKEN> para download.');

  // 5. Varrimento opcional: nomes das seccoes de TODAS as cadeiras.
  // Serve para desenhar o mapeamento seccao -> categoria de pasta na Fase 2.
  if (process.argv.includes('--sections')) {
    h('5. Seccoes de todas as cadeiras (--sections)');
    log(`${courses.length} pedidos, ${REQUEST_GAP_MS}ms de intervalo. Paciencia.\n`);
    const todas = {};
    for (const c of courses) {
      let secs;
      try {
        secs = await callWs(token, 'core_course_get_contents', { courseid: String(c.id) });
      } catch (e) {
        log(`  ${String(c.id).padStart(4)}  ${c.shortname.split(' - ')[0]}\n         !! ${e.message.split('\n')[0]}`);
        continue;
      }
      todas[c.id] = secs;
      log(`  ${String(c.id).padStart(4)}  ${c.shortname.split(' - ')[0]}`);
      for (const sec of secs) {
        const tipos = {};
        for (const m of sec.modules || []) tipos[m.modname] = (tipos[m.modname] || 0) + 1;
        const ficheiros = (sec.modules || []).flatMap((m) => m.contents || []).filter((x) => x.type === 'file');
        const desc = Object.entries(tipos).map(([t, n]) => `${n}x${t}`).join(' ') || 'vazia';
        log(`          "${sec.name}"  -> ${desc}  (${ficheiros.length} ficheiros)`);
      }
    }
    await writeFile(join(OUT_DIR, 'all-contents.json'), JSON.stringify(todas, null, 2));
    log(`\nJSON de todas as cadeiras em ${join(OUT_DIR, 'all-contents.json')}`);
  }
}

if (import.meta.main) {
  try {
    await main();
    console.log('\n\x1b[32mFase 1 concluida.\x1b[0m');
  } catch (e) {
    console.error(`\n\x1b[31mFALHOU\x1b[0m\n${e.message}`);
    if (e.moodle) {
      console.error(`\n  errorcode: ${e.moodle.errorcode}`);
      console.error(`  mensagem do Moodle: ${e.moodle.message}`);
      if (e.moodle.kind !== 'CREDENCIAIS_INVALIDAS') {
        console.error('\n  Se o acesso estiver bloqueado neste Moodle, obtém uma chave na interface e consulta o README.md.');
      }
    }
    process.exit(1);
  }
}
