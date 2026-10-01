/**
 * Em que pasta cai cada material.
 *
 * O sinal bom e o nome da SECCAO — os professores ja organizam o curso
 * ("Aulas Teoricas", "Aulas Praticas", "Avaliacoes"). O nome do modulo so
 * entra quando a seccao nao diz nada.
 */

import { basename } from 'node:path';

export const CATEGORIAS = ['teoria', 'exercicios', 'exames', 'trabalhos', 'outros'];

/** Minusculas e sem acentos: os nomes vem do Moodle em NFD e NFC misturados. */
const chave = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// A ORDEM importa: a primeira que bate ganha. "Trabalho Pratico" tem de
// cair em trabalhos, nao em exercicios por causa do "pratic".
/** @type {[RegExp, string][]} */
const REGRAS = [
  [/exame|teste|frequencia|epoca|mini.?teste|prova/, 'exames'],
  [/trabalho|projeto|projecto/, 'trabalhos'],
  [/teoric|teoria|apontament|slides?|apresentac|sebenta/, 'teoria'],
  [/pratic|ficha|exercic|laborat|guiao|tutorial|tarefa/, 'exercicios'],
];

/**
 * Pautas de notas e presencas. Ficam em outros/ e nunca vao para o LLM:
 * nao sao materia, e trazem notas e presencas de colegas.
 * Tem de olhar aos dois nomes — ha um modulo "Notas Ficha7" cujo ficheiro
 * se chama so "Ficha7_25_26.pdf".
 */
export function ehPauta(nomeModulo, nomeFicheiro = '') {
  // "Notas sobre o material a entregar" e materia, nao uma pauta. O lookahead
  // salva esses; na duvida a decisao e excluir, porque o custo de enganar-se
  // para o outro lado e mandar notas de colegas para a API da Anthropic.
  const re = /^\s*(notas?\b(?!\s*(sobre|acerca|para|importante|de\s+apoio|de\s+aula))|pauta|classificac|presenc|assidui)/;
  return re.test(chave(nomeModulo)) || re.test(chave(nomeFicheiro));
}

/** @returns {{categoria, origem}} origem: pauta|seccao|modulo|omissao */
export function categorizar(nomeSeccao, nomeModulo, nomeFicheiro = '') {
  if (ehPauta(nomeModulo, nomeFicheiro)) return { categoria: 'outros', origem: 'pauta' };
  // O nome do modulo ganha a seccao: numa seccao "Avaliacoes" o que
  // interessa e se aquilo e o enunciado do exame ou a ficha de treino.
  const mod = chave(nomeModulo);
  for (const [re, cat] of REGRAS) if (re.test(mod)) return { categoria: cat, origem: 'modulo' };
  const sec = chave(nomeSeccao);
  for (const [re, cat] of REGRAS) if (re.test(sec)) return { categoria: cat, origem: 'seccao' };
  return { categoria: 'outros', origem: 'omissao' };
}

/**
 * Nome de ficheiro seguro para escrever em disco.
 *
 * O filename vem do Moodle, logo e input nao confiavel: um "../../.ssh/x"
 * escreveria fora da pasta. basename() corta o caminho; o resto limpa o
 * que algumas instalações Moodle devolvem (NFD, espaços antes da extensão).
 */
export function nomeFicheiroSeguro(filename) {
  let n = basename(String(filename || '')).normalize('NFC');
  n = n.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_');
  n = n.replace(/\s+/g, ' ').replace(/\s+(\.[A-Za-z0-9]{1,8})$/, '$1').trim();
  n = n.replace(/^\.+/, '');
  return n || 'sem-nome';
}

/**
 * O documento e uma lista de pessoas? (pauta de notas, distribuicao por salas,
 * atribuicao de utilizadores...)
 *
 * Olha ao TEXTO, nao ao nome: o nome mente. "Distrib_salas_AS.pdf" e
 * "Atribuicao_esquemas.pdf" nao comecam por "Notas" e trazem 131 e 104 numeros
 * de aluno com nomes completos — um deles com a password da turma.
 *
 * Medido nos 40 documentos de Analise de Sistemas: as tres listas de pessoas
 * tinham 43, 104 e 131 numeros de aluno distintos; o material de estudo tinha
 * no maximo 3. O limiar de 15 fica no meio dessa distancia toda.
 */
export function ehListaDePessoas(texto, limiar = 15) {
  if (!texto) return false;
  return new Set(texto.match(/\b\d{5}\b/g) || []).size >= limiar;
}
