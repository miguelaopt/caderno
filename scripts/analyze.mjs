#!/usr/bin/env node
/**
 * Fase 3: resumos, topicos e perguntas de revisao, com a API da Anthropic.
 *
 *   node scripts/analyze.mjs --dry-run    conta tokens e estima o custo, sem gastar
 *   node scripts/analyze.mjs --batch      via Batch API: metade do preco (recomendado)
 *   node scripts/analyze.mjs --limit 3    poucos, para ver o resultado antes de gastar tudo
 *   node scripts/analyze.mjs              via normal: caro, mas responde na hora
 *
 * So se analisa o que ainda nao tem analise para o PROMPT_VERSION atual, e
 * nunca o que tem llm_ok = 0 (pautas de notas e presencas nao saem daqui).
 */

import { openDb, getSetting, setSetting, ficheirosPorAnalisar } from '../lib/db.mjs';
import { analisar, contarTokens, custo, pedido, extrair, getClient, MODEL, EFFORT, PROMPT_VERSION } from '../lib/llm.mjs';

try { process.loadEnvFile('.env'); } catch {}

const DRY = process.argv.includes('--dry-run');
const BATCH = process.argv.includes('--batch');
const iLimit = process.argv.indexOf('--limit');
const LIMIT = iLimit >= 0 ? Number(process.argv[iLimit + 1]) : Infinity;

const db = openDb();
const log = console.log;
const usd = (n) => `$${n.toFixed(2)}`;
const agora = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const guardar = db.prepare(`
  INSERT INTO analyses(file_id, model, prompt_version, summary, topics, created_at)
  VALUES(?,?,?,?,?,?)
  ON CONFLICT(file_id, prompt_version) DO UPDATE SET
    model=excluded.model, summary=excluded.summary, topics=excluded.topics, created_at=excluded.created_at`);

function gravarAnalise(fileId, a) {
  guardar.run(fileId, MODEL, PROMPT_VERSION, a.resumo, JSON.stringify({
    topicos: a.topicos, tipo: a.tipo, dificuldade: a.dificuldade,
    minutos_estudo: a.minutos_estudo, prerequisitos: a.prerequisitos, perguntas: a.perguntas,
  }), agora());
}

const resumoDe = (a) => [
  `    ${a.tipo} · ${a.dificuldade} · ${a.minutos_estudo}min · ${a.perguntas.length} perguntas`,
  a.topicos.length ? `    tópicos: ${a.topicos.slice(0, 5).join(', ')}` : null,
  `    ${a.resumo.replace(/\s+/g, ' ').slice(0, 150)}${a.resumo.length > 150 ? '…' : ''}`,
  a.perguntas[0] ? `    P: ${a.perguntas[0].pergunta.slice(0, 120)}` : null,
].filter(Boolean).join('\n');

// ---------------------------------------------------------------------------
// Batch API: metade do preco. Um batch costuma acabar em menos de uma hora,
// no maximo 24. Para material de estudo que se le no dia seguinte, isso e
// tempo nenhum — e o unico corte de custo que nao paga nada em qualidade.
// ---------------------------------------------------------------------------

async function recolher(batchId) {
  const client = getClient();
  let batch = await client.messages.batches.retrieve(batchId);

  while (batch.processing_status !== 'ended') {
    const c = batch.request_counts;
    log(`  ${batch.processing_status}: ${c.succeeded} prontos, ${c.processing} a processar, ${c.errored} com erro`);
    await sleep(30_000);
    batch = await client.messages.batches.retrieve(batchId);
  }

  let ok = 0, erros = 0, tIn = 0, tOut = 0;
  for await (const r of await client.messages.batches.results(batchId)) {
    const fileId = Number(r.custom_id.slice(1));
    if (r.result.type !== 'succeeded') {
      erros++;
      log(`  \x1b[31m${r.custom_id}: ${r.result.type} ${r.result.error?.type ?? ''}\x1b[0m`);
      continue;
    }
    try {
      const a = extrair(r.result.message, r.custom_id);
      gravarAnalise(fileId, a);
      tIn += r.result.message.usage.input_tokens;
      tOut += r.result.message.usage.output_tokens;
      ok++;
      const f = db.prepare('SELECT filename FROM files WHERE id=?').get(fileId);
      log(`  ${f?.filename ?? r.custom_id}\n${resumoDe(a)}`);
    } catch (e) {
      erros++;
      log(`  \x1b[31m${r.custom_id}: ${e.message}\x1b[0m`);
    }
  }

  setSetting(db, 'batch_pendente', '');
  log('\n' + '─'.repeat(50));
  log(`${ok} analisados, ${erros} falhas`);
  log(`${tIn.toLocaleString('pt-PT')} tokens de entrada, ${tOut.toLocaleString('pt-PT')} de saída`);
  log(`Custo real: \x1b[1m${usd(custo(tIn, tOut, { batch: true }))}\x1b[0m  (metade, por ser batch)`);
}

async function submeter(alvos) {
  const batch = await getClient().messages.batches.create({
    requests: alvos.map((f) => ({
      custom_id: `f${f.id}`,
      params: pedido(f.modulo || f.filename, f.fullname, f.text),
    })),
  });
  setSetting(db, 'batch_pendente', batch.id);
  log(`Batch ${batch.id} submetido com ${alvos.length} documentos.`);
  log('Costuma acabar em menos de 1h (máximo 24h). Podes fazer Ctrl+C —');
  log('a próxima corrida com --batch retoma e recolhe os resultados.\n');
  await recolher(batch.id);
}

// ---------------------------------------------------------------------------

async function main() {
  const pendente = getSetting(db, 'batch_pendente');
  if (pendente) {
    log(`Há um batch por recolher (${pendente}).\n`);
    return recolher(pendente);
  }

  const porAnalisar = ficheirosPorAnalisar(db, PROMPT_VERSION);
  const excluidos = db.prepare('SELECT count(*) n FROM files WHERE llm_ok = 0').get().n;
  const semTexto = db.prepare("SELECT count(*) n FROM files WHERE text_status IN ('vazio','falhou')").get().n;

  if (!porAnalisar.length) {
    log(`Nada por analisar (prompt v${PROMPT_VERSION}).`);
    log(`${excluidos} excluídos por serem pautas, ${semTexto} sem texto extraível.`);
    return;
  }

  log(`${porAnalisar.length} documento(s) por analisar`);
  log(`modelo ${MODEL}, esforço ${EFFORT}, prompt v${PROMPT_VERSION}${BATCH ? ', via Batch (metade do preço)' : ''}`);
  log(`${excluidos} excluídos por serem pautas, ${semTexto} sem texto extraível.\n`);

  const alvos = porAnalisar.slice(0, LIMIT);

  if (DRY) {
    let total = 0;
    for (const f of alvos) {
      const t = await contarTokens(f.text);
      total += t;
      log(`  ${String(t).padStart(7)} tokens  [${f.slug}] ${f.filename}`);
    }
    const saida = alvos.length * 1500;  // analise + perguntas + raciocinio
    log(`\n${total.toLocaleString('pt-PT')} tokens de entrada, ~${saida.toLocaleString('pt-PT')} de saída`);
    log(`  via normal: ${usd(custo(total, saida))}`);
    log(`  via batch:  \x1b[1m${usd(custo(total, saida, { batch: true }))}\x1b[0m`);
    log('\nA estimativa de saída é grosseira. Corre com --limit 3 --batch para o número real.');
    return;
  }

  if (BATCH) return submeter(alvos);

  let tIn = 0, tOut = 0, falhas = 0;
  for (const [i, f] of alvos.entries()) {
    const etiqueta = `[${i + 1}/${alvos.length}] [${f.slug}] ${f.filename}`;
    try {
      const { analise, usage } = await analisar(f.modulo || f.filename, f.fullname, f.text);
      gravarAnalise(f.id, analise);
      tIn += usage.input_tokens; tOut += usage.output_tokens;
      log(`${etiqueta}\n${resumoDe(analise)}`);
    } catch (e) {
      falhas++;
      log(`${etiqueta}\n    \x1b[31m${e.message}\x1b[0m`);
    }
  }

  log('\n' + '─'.repeat(50));
  log(`${alvos.length - falhas} analisados, ${falhas} falhas`);
  log(`Custo real: \x1b[1m${usd(custo(tIn, tOut))}\x1b[0m`);
  log(`Teria custado ${usd(custo(tIn, tOut, { batch: true }))} com --batch.`);

  const restam = porAnalisar.length - alvos.length;
  if (restam) log(`\nFaltam ${restam}.`);
}

try {
  if (import.meta.main) await main();
} catch (e) {
  console.error(`\n\x1b[31m${e.message}\x1b[0m`);
  if (/api.?key|authentication/i.test(e.message))
    console.error('\nFalta ANTHROPIC_API_KEY no .env. Vai a console.anthropic.com > API keys.');
  process.exit(1);
}
