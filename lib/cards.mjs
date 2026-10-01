/**
 * Flashcards: as perguntas de revisao das analises, com repeticao espacada.
 *
 * Nao ha tabela de cartas. A carta E a pergunta que o modelo ja escreveu —
 * identificada pelo ficheiro e pelo indice dentro dele. So o historico se
 * guarda. Assim uma reanalise atualiza as cartas sem migracao nenhuma.
 */

import { proximaRevisao, agoraS } from './plan.mjs';

/** Uma carta falhada volta na mesma sessao, nao no dia seguinte. */
const FALHA_MIN = 10;

/** Todas as cartas das cadeiras do semestre, com o historico de cada uma. */
export function todasAsCartas(db, semestre) {
  const linhas = db.prepare(`
    SELECT f.id AS file_id, f.filename, m.name AS modulo, c.slug, c.fullname, a.topics
    FROM files f
    JOIN modules m ON m.id = f.module_id
    JOIN courses c ON c.id = m.course_id
    JOIN analyses a ON a.file_id = f.id
    WHERE c.semester = ? AND f.llm_ok = 1
    ORDER BY m.id`).all(semestre);

  const hist = db.prepare(
    'SELECT studied_at, resultado FROM card_log WHERE file_id = ? AND idx = ? ORDER BY studied_at');

  const cartas = [];
  for (const l of linhas) {
    const perguntas = (l.topics ? JSON.parse(l.topics).perguntas : null) ?? [];
    perguntas.forEach((p, idx) => {
      const historico = hist.all(l.file_id, idx);
      cartas.push({
        file_id: l.file_id, idx,
        pergunta: p.pergunta, resposta: p.resposta,
        cadeira: l.slug, curso: l.fullname, doc: l.modulo || l.filename,
        historico,
        nova: historico.length === 0,
        prox: proximaRevisao(historico, FALHA_MIN),
      });
    });
  }
  return cartas;
}

/**
 * O baralho de hoje: o que esta em atraso primeiro, depois cartas novas ate
 * ao limite. Um limite diario evita a avalanche de 180 cartas no primeiro dia,
 * que e o que faz desistir.
 */
export function baralhoDeHoje(db, semestre, { novasPorDia = 8, agora = agoraS() } = {}) {
  const todas = todasAsCartas(db, semestre);
  const devidas = todas.filter((c) => !c.nova && agora >= c.prox).sort((a, b) => a.prox - b.prox);
  const novas = todas.filter((c) => c.nova).slice(0, novasPorDia);
  return { baralho: [...devidas, ...novas], devidas: devidas.length, novas: novas.length, total: todas.length };
}

export function registarCarta(db, fileId, idx, resultado, quando = agoraS()) {
  if (!['bem', 'assim', 'mal'].includes(resultado)) throw new Error(`resultado inválido: ${resultado}`);
  db.prepare('INSERT INTO card_log(file_id, idx, studied_at, resultado) VALUES(?,?,?,?)')
    .run(fileId, idx, quando, resultado);
}

/** Quando volta esta carta, para o botao dizer "volta em 4 dias". */
export function quandoVolta(historico, resultado, agora = agoraS()) {
  const prox = proximaRevisao([...historico, { studied_at: agora, minutes: 0, resultado }], FALHA_MIN);
  const dias = (prox - agora) / 86400;
  if (dias < 0.5) return 'volta ainda hoje';
  return dias < 1.5 ? 'volta amanhã' : `volta em ${Math.round(dias)} dias`;
}
