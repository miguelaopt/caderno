/**
 * O motor do plano de estudo. Sem LLM: e aritmetica.
 *
 * Uma formula e deterministica e auditavel — vês porque e que uma coisa esta
 * no topo, e amanha com os mesmos dados da a mesma resposta. Um modelo daria
 * respostas diferentes de dia para dia sem razao nenhuma, e a confianca no
 * plano e o que faz um plano ser seguido.
 *
 * O plano e para a sessao que estas a comecar, nao para o dia de calendario:
 * nao ha planos de ontem por cumprir a acumular.
 */

const DIA = 86400;
export const agoraS = () => Math.floor(Date.now() / 1000);

/**
 * Repeticao espacada. Intervalos em dias, por numero de revisoes bem
 * sucedidas seguidas. Leitner simplificado — o SM-2 completo afina isto com
 * um factor de facilidade por item, e nao vale a complexidade para uma
 * cadeira de um semestre.
 * ponytail: se as revisoes comecarem a cair sempre no mesmo dia, passar a SM-2.
 */
const INTERVALOS = [1, 3, 7, 16, 35];

/** Quantas revisoes seguidas correram bem, e quando foi a ultima. */
function estadoRevisao(historico) {
  let seguidas = 0;
  for (const e of historico) {           // do mais antigo para o mais recente
    if (e.resultado === 'bem') seguidas++;
    else if (e.resultado === 'mal') seguidas = 0;
    // 'assim' mantem o nivel: precisa de outra passagem antes de espacar mais
  }
  return seguidas;
}

/**
 * @param minutosSeFalhou  quando definido, um "mal" traz o item de volta
 *   dentro deste numero de minutos em vez de so no dia seguinte. E o que se
 *   quer numa carta (volta na mesma sessao) e nao num material inteiro, que
 *   nao se reestuda dez minutos depois.
 */
export function proximaRevisao(historico, minutosSeFalhou = null) {
  if (!historico.length) return null;
  const ultimo = historico[historico.length - 1];
  if (minutosSeFalhou != null && ultimo.resultado === 'mal') return ultimo.studied_at + minutosSeFalhou * 60;
  // -1: a primeira passagem bem sucedida da o primeiro intervalo (1 dia),
  // nao o segundo. Contar os acertos como indice saltava um degrau.
  const nivel = Math.min(Math.max(estadoRevisao(historico) - 1, 0), INTERVALOS.length - 1);
  return ultimo.studied_at + INTERVALOS[nivel] * DIA;
}

/**
 * Um prazo a aproximar-se puxa tudo o que e daquela cadeira para cima.
 * Cresce depressa no fim: a duas semanas ainda ha tempo, a dois dias nao.
 */
export function urgencia(diasAtePrazo) {
  if (diasAtePrazo == null) return 1;
  if (diasAtePrazo < 0) return 1;          // ja passou, nao adianta
  if (diasAtePrazo <= 2) return 3.5;
  if (diasAtePrazo <= 5) return 2.6;
  if (diasAtePrazo <= 10) return 1.9;
  if (diasAtePrazo <= 21) return 1.4;
  if (diasAtePrazo <= 45) return 1.15;
  return 1;
}

/**
 * Peso por tipo de material: a ordem por que se aprende.
 *
 * Teoria antes de exercicios, exercicios antes de provas. Um exame ou prova
 * tipo em Setembro e desperdicio; nas duas semanas antes do exame passa a ser
 * a melhor coisa a fazer, e por isso o peso depende do prazo.
 */
export function pesoTipo(tipo, diasAtePrazo) {
  const perto = diasAtePrazo != null && diasAtePrazo <= 14;
  switch (tipo) {
    case 'exame': return perto ? 1.8 : 0.45;
    case 'ficha-exercicios': return perto ? 1.3 : 0.9;
    case 'enunciado': return 0.85;
    case 'guiao-pratico': return 0.9;
    case 'slides':
    case 'apontamentos': return 1;
    default: return 0.7;
  }
}

/**
 * Estado de um material e o peso base que lhe corresponde.
 *
 * "a-meio" ganha ao "novo" de proposito: acabar o que se comecou vale mais
 * do que abrir mais uma frente.
 */
export function estadoDe(material, agora) {
  const feitos = material.historico.reduce((s, e) => s + e.minutes, 0);
  const precisa = material.minutos_estudo || 0;

  if (precisa === 0) return { estado: 'ignorar', peso: 0, feitos, precisa };
  if (feitos === 0) return { estado: 'novo', peso: 1.0, feitos, precisa };
  if (feitos < precisa) return { estado: 'a-meio', peso: 1.5, feitos, precisa };

  const prox = proximaRevisao(material.historico);
  if (agora < prox) return { estado: 'em-dia', peso: 0, feitos, precisa, prox };

  // Quanto mais atrasada a revisao, mais urgente — mas com tecto, para uma
  // cadeira abandonada nao afogar tudo o resto.
  const atraso = Math.min((agora - prox) / (7 * DIA), 2);
  return { estado: 'a-rever', peso: 1.2 + atraso, feitos, precisa, prox };
}

/**
 * Monta a sessao.
 *
 * @param materiais  ja com analise e historico
 * @param minutos    tempo disponivel agora
 */
export function planear(materiais, minutos, agora = agoraS()) {
  const pontuados = materiais.map((m) => {
    const st = estadoDe(m, agora);
    const dias = m.dias_ate_prazo;
    const u = urgencia(dias);
    const t = pesoTipo(m.tipo, dias);
    return { ...m, ...st, urgencia: u, score: st.peso * u * t };
  }).filter((m) => m.score > 0);

  // Score primeiro; empatados, a ordem em que o professor os publicou, que
  // costuma ser a ordem pedagogica.
  pontuados.sort((a, b) => b.score - a.score || a.module_id - b.module_id);

  const sessao = [];
  let restam = minutos;
  for (const m of pontuados) {
    if (restam <= 0) break;
    // Uma ficha de 180min nao cabe em 45. Entra na mesma, em bocado — o que
    // ficar por fazer conta-se no historico e aparece como "a-meio" a seguir.
    const emFalta = m.estado === 'a-rever' ? Math.ceil(m.precisa * 0.3) : m.precisa - m.feitos;
    const bloco = Math.min(emFalta, restam);
    if (bloco < 5) continue;                  // menos de 5 min nao vale abrir
    sessao.push({ ...m, minutos_sugeridos: bloco, parcial: bloco < emFalta });
    restam -= bloco;
  }
  return { sessao, sobram: restam, candidatos: pontuados.length };
}

// ---------------------------------------------------------------------------
// Leitura da base de dados
// ---------------------------------------------------------------------------

/** Materiais das cadeiras do semestre ativo, com analise e historico. */
export function materiaisDe(db, semestre, agora = agoraS()) {
  const linhas = db.prepare(`
    SELECT f.id, f.filename, f.path, m.id AS module_id, m.name AS modulo, m.category,
           c.id AS course_id, c.slug, c.fullname, a.summary, a.topics
    FROM files f
    JOIN modules m ON m.id = f.module_id
    JOIN courses c ON c.id = m.course_id
    JOIN analyses a ON a.file_id = f.id
    WHERE c.semester = ?
    ORDER BY m.id`).all(semestre);

  const hist = db.prepare('SELECT studied_at, minutes, resultado FROM study_log WHERE file_id = ? ORDER BY studied_at');
  // Prazo mais proximo ainda por cumprir, por cadeira.
  const prazos = new Map();
  for (const d of db.prepare(`
      SELECT course_id, title, due_at FROM deadlines
      WHERE done_at IS NULL AND due_at > ? ORDER BY due_at`).all(agora)) {
    if (!prazos.has(d.course_id)) prazos.set(d.course_id, d);
  }

  return linhas.map((r) => {
    const t = r.topics ? JSON.parse(r.topics) : {};
    const prazo = prazos.get(r.course_id);
    return {
      ...r,
      resumo: r.summary,
      topicos: t.topicos ?? [],
      tipo: t.tipo, dificuldade: t.dificuldade,
      minutos_estudo: t.minutos_estudo ?? 0,
      perguntas: t.perguntas ?? [],
      prazo: prazo ?? null,
      dias_ate_prazo: prazo ? Math.ceil((prazo.due_at - agora) / DIA) : null,
      historico: hist.all(r.id),
    };
  });
}

export function registarEstudo(db, fileId, minutos, resultado, quando = agoraS()) {
  if (!['bem', 'assim', 'mal'].includes(resultado)) throw new Error(`resultado inválido: ${resultado}`);
  db.prepare('INSERT INTO study_log(file_id, studied_at, minutes, resultado) VALUES(?,?,?,?)')
    .run(fileId, quando, Math.max(1, Math.round(minutos)), resultado);
}
