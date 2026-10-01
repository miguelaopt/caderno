#!/usr/bin/env node
/**
 * O Caderno. Servidor local, so para esta maquina.
 *
 *   npm run serve   ->  http://localhost:4321
 *
 * Node nativo, sem framework: e uma pagina e alguns endpoints a ler SQLite no
 * mesmo processo. Um Next.js aqui traria build e 300MB de node_modules para
 * renderizar listas.
 */

import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { openDb, getSetting, setSetting, MATERIAL_DIR } from '../lib/db.mjs';
import { materiaisDe, planear, registarEstudo, estadoDe, agoraS } from '../lib/plan.mjs';
import { baralhoDeHoje, registarCarta, quandoVolta } from '../lib/cards.mjs';
import { perguntar } from '../lib/chat.mjs';
import { nomeLimpo } from '../lib/moodle.mjs';

try { process.loadEnvFile('.env'); } catch {}

const PORT = Number(process.env.PORT || 4321);
const RAIZ = resolve(MATERIAL_DIR);
const db = openDb();
const DIA = 86400;

const json = (res, dados, codigo = 200) => {
  res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
};
const corpo = async (req) => JSON.parse(await new Response(req).text());
const semestre = () => getSetting(db, 'active_semester');

// ---------------------------------------------------------------------------

/** A barra do lado: cadeiras, contagens, estado do Moodle. */
function navegacao() {
  const sem = semestre();
  const mats = materiaisDe(db, sem);
  const agora = agoraS();

  const porCadeira = new Map();
  for (const m of mats) {
    const e = estadoDe(m, agora);
    const c = porCadeira.get(m.slug) ?? { slug: m.slug, nome: nomeLimpo(m.fullname), total: 0, emDia: 0, faltam: 0 };
    c.total++;
    if (e.estado === 'em-dia') c.emDia++;
    else if (e.estado !== 'ignorar') c.faltam++;
    porCadeira.set(m.slug, c);
  }
  for (const c of porCadeira.values()) c.pct = c.total ? Math.round((c.emDia / c.total) * 100) : 0;

  const { devidas, novas } = baralhoDeHoje(db, sem);
  const syncs = db.prepare(
    'SELECT finished_at FROM sync_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 2').all();
  // "Novo" = apareceu depois do sync ANTERIOR. Na primeira sincronizacao tudo
  // e novo, e dizer "40 materiais novos" nao informa nada — por isso, zero.
  const novosMoodle = syncs.length < 2 ? 0 : db.prepare(`
    SELECT count(*) n FROM files f JOIN modules m ON m.id = f.module_id
    JOIN courses c ON c.id = m.course_id
    WHERE c.semester = ? AND m.first_seen_at > ?`).get(sem, syncs[1].finished_at).n;

  return {
    semestre: sem,
    semestres: db.prepare('SELECT DISTINCT semester s FROM courses WHERE semester IS NOT NULL ORDER BY s DESC').all().map((r) => r.s),
    cadeiras: [...porCadeira.values()],
    cartasHoje: devidas + novas,
    fichas: mats.filter((m) => m.tipo === 'ficha-exercicios').length,
    novosMoodle,
    ultimoSync: syncs[0]?.finished_at ?? null,
  };
}

function sessao(minutos) {
  const mats = materiaisDe(db, semestre());
  const { sessao, candidatos } = planear(mats, minutos);
  return {
    candidatos,
    plano: sessao.map((s, i) => ({
      ordem: String(i + 1).padStart(2, '0'),
      id: s.id, titulo: s.modulo, ficheiro: s.filename,
      cadeira: s.slug, cadeiraLonga: nomeLimpo(s.fullname),
      nota: s.resumo?.split('. ').slice(0, 1).join('. ') + '.',
      minutos: s.minutos_sugeridos, estado: s.estado,
      dificuldade: s.dificuldade, tipo: s.tipo,
      resumo: s.resumo, topicos: s.topicos, perguntas: s.perguntas,
      feitos: s.feitos, precisa: s.precisa,
    })),
  };
}

function cadeira(slug) {
  const mats = materiaisDe(db, semestre()).filter((m) => m.slug === slug);
  if (!mats.length) return null;
  const agora = agoraS();
  const ORDEM = ['teoria', 'exercicios', 'exames', 'trabalhos', 'outros'];
  const NOMES = { teoria: 'Teoria', exercicios: 'Exercícios', exames: 'Exames', trabalhos: 'Trabalhos', outros: 'Outros' };

  const grupos = ORDEM.map((cat) => ({
    nome: NOMES[cat],
    itens: mats.filter((m) => m.category === cat).map((m) => {
      const e = estadoDe(m, agora);
      return {
        id: m.id, titulo: m.modulo, minutos: m.minutos_estudo,
        estado: e.estado, feitos: e.feitos, precisa: e.precisa,
        prox: e.prox ? Math.ceil((e.prox - agora) / DIA) : null,
      };
    }),
  })).filter((g) => g.itens.length);

  // A mesma regra da barra lateral: o material administrativo (0 minutos)
  // nao conta nem como feito nem como por fazer.
  const estados = mats.map((m) => estadoDe(m, agora).estado);
  const emDia = estados.filter((e) => e === 'em-dia').length;
  const faltam = estados.filter((e) => e !== 'em-dia' && e !== 'ignorar').length;
  const prazo = mats.find((m) => m.prazo)?.prazo;
  return {
    slug, nome: nomeLimpo(mats[0].fullname), total: emDia + faltam, emDia, faltam,
    prazo: prazo ? { titulo: prazo.title, dias: Math.ceil((prazo.due_at - agora) / DIA) } : null,
    grupos,
  };
}

/** Fichas de exercicios: as perguntas de revisao servem de lista de tarefas. */
function fichas() {
  const mats = materiaisDe(db, semestre()).filter((m) => m.tipo === 'ficha-exercicios');
  const agora = agoraS();
  return mats.map((m) => {
    const e = estadoDe(m, agora);
    return {
      id: m.id, titulo: m.modulo, cadeira: m.slug, ficheiro: m.filename,
      minutos: m.minutos_estudo, feitos: e.feitos, estado: e.estado,
      enunciado: m.resumo, topicos: m.topicos,
      // Nao ha alineas na analise; as perguntas de revisao apontam para os
      // exercicios que valem a pena ("No exercicio 18 (conferencia)...").
      tarefas: m.perguntas.map((p, i) => ({ n: i + 1, texto: p.pergunta })),
    };
  });
}

async function arvore() {
  const cursos = db.prepare('SELECT slug, fullname FROM courses WHERE semester = ? ORDER BY slug').all(semestre());
  const out = [];
  for (const c of cursos) {
    const base = join(MATERIAL_DIR, c.slug);
    let cats = [];
    try { cats = (await readdir(base, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
    out.push({ slug: c.slug, nome: nomeLimpo(c.fullname), categorias: cats.sort() });
  }
  return out;
}

async function listar(slug, categoria) {
  const dir = resolve(join(MATERIAL_DIR, slug, categoria));
  if (dir !== RAIZ && !dir.startsWith(RAIZ + '/')) return { caminho: '', ficheiros: [] };
  let nomes = [];
  try { nomes = await readdir(dir); } catch { return { caminho: relative(process.cwd(), dir), ficheiros: [] }; }

  const idPor = new Map(db.prepare('SELECT id, path FROM files WHERE path IS NOT NULL').all().map((r) => [resolve(r.path), r.id]));
  const agora = agoraS();
  const ficheiros = [];
  for (const n of nomes.sort()) {
    const p = join(dir, n);
    const s = await stat(p).catch(() => null);
    if (!s?.isFile()) continue;
    ficheiros.push({
      nome: n, tamanho: s.size, data: Math.floor(s.mtimeMs / 1000),
      id: idPor.get(resolve(p)) ?? null,
      novo: s.mtimeMs / 1000 > agora - 7 * DIA,
    });
  }
  return { caminho: `material/${slug}/${categoria}`, ficheiros };
}

// ---------------------------------------------------------------------------

let aCorrer = null;   // um sync de cada vez

function sincronizar() {
  if (aCorrer) return { estado: 'já a correr' };
  aCorrer = { linhas: [], fim: null };
  const p = spawn(process.execPath, ['scripts/sync.mjs'], { cwd: process.cwd() });
  const junta = (d) => { aCorrer.linhas.push(...String(d).split('\n').filter(Boolean)); };
  p.stdout.on('data', junta);
  p.stderr.on('data', junta);
  p.on('close', (c) => { aCorrer.fim = c; });
  return { estado: 'a correr' };
}

// ---------------------------------------------------------------------------

const rotas = {
  'GET /api/nav': () => navegacao(),
  'GET /api/sessao': (u) => sessao(Math.min(Math.max(Number(u.searchParams.get('minutos')) || 45, 5), 300)),
  'GET /api/cadeira': (u) => cadeira(u.searchParams.get('slug')),
  'GET /api/fichas': () => fichas(),
  'GET /api/arvore': () => arvore(),
  'GET /api/ficheiros': (u) => listar(u.searchParams.get('slug'), u.searchParams.get('categoria')),
  'GET /api/sync': () => (aCorrer ? { ...aCorrer, terminado: aCorrer.fim !== null } : { linhas: [], terminado: true }),

  'GET /api/cartas': () => {
    const b = baralhoDeHoje(db, semestre());
    return {
      devidas: b.devidas, novas: b.novas, total: b.total,
      baralho: b.baralho.map((c) => ({
        file_id: c.file_id, idx: c.idx, pergunta: c.pergunta, resposta: c.resposta,
        cadeira: c.cadeira, doc: c.doc, nova: c.nova,
        volta: { bem: quandoVolta(c.historico, 'bem'), assim: quandoVolta(c.historico, 'assim'), mal: quandoVolta(c.historico, 'mal') },
      })),
    };
  },

  'POST /api/estudei': async (u, req) => {
    const c = await corpo(req);
    registarEstudo(db, Number(c.id), Number(c.minutos), c.resultado);
    return { ok: true };
  },
  'POST /api/carta': async (u, req) => {
    const c = await corpo(req);
    registarCarta(db, Number(c.file_id), Number(c.idx), c.resultado);
    return { ok: true };
  },
  'POST /api/semestre': async (u, req) => {
    setSetting(db, 'active_semester', (await corpo(req)).semestre);
    return { ok: true };
  },
  'POST /api/sync': () => sincronizar(),

  'POST /api/conversa': async (u, req) => {
    const c = await corpo(req);
    const doc = db.prepare(`
      SELECT f.text, f.llm_ok, m.name AS titulo, cu.fullname AS cadeira
      FROM files f JOIN modules m ON m.id = f.module_id JOIN courses cu ON cu.id = m.course_id
      WHERE f.id = ?`).get(Number(c.id));
    if (!doc) throw new Error('documento não encontrado');
    // A mesma porta de sempre: uma lista de pessoas nao sai desta maquina,
    // nem sequer numa conversa.
    if (!doc.llm_ok) throw new Error('este documento está marcado para não sair desta máquina');
    if (!doc.text) throw new Error('este documento não tem texto extraído');
    return perguntar({ titulo: doc.titulo, cadeira: doc.cadeira, texto: doc.text }, c.historico ?? [], c.pergunta);
  },
};

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(new URL('../web/index.html', import.meta.url)));
    }

    if (url.pathname.startsWith('/material/')) {
      const linha = db.prepare('SELECT path FROM files WHERE id = ?').get(Number(url.pathname.slice(10)));
      if (!linha?.path) return json(res, { erro: 'não encontrado' }, 404);
      const caminho = resolve(linha.path);
      if (caminho !== RAIZ && !caminho.startsWith(RAIZ + '/')) return json(res, { erro: 'fora de material/' }, 403);
      res.writeHead(200, {
        'content-type': extname(caminho) === '.pdf' ? 'application/pdf' : 'application/octet-stream',
        'content-disposition': 'inline',
      });
      return createReadStream(caminho).pipe(res);
    }

    const rota = rotas[`${req.method} ${url.pathname}`];
    if (!rota) return json(res, { erro: 'não existe' }, 404);
    return json(res, await rota(url, req));
  } catch (e) {
    json(res, { erro: e.message }, 500);
  }
});

servidor.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Caderno — semestre ${semestre() ?? '(nenhum)'}`);
  console.log(`  \x1b[1mhttp://localhost:${PORT}\x1b[0m\n`);
});
