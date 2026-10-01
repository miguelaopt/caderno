/**
 * Analise do material com a API da Anthropic.
 *
 * So corre do lado do servidor — a chave nunca chega ao browser.
 * Ficheiros com llm_ok = 0 (pautas de notas e presencas) nunca passam por aqui.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

export const MODEL = process.env.LLM_MODEL || 'claude-sonnet-5';
export const EFFORT = process.env.LLM_EFFORT || 'low';

/**
 * Incrementar quando o prompt ou o schema mudarem. E o que faz o analyze
 * voltar a analisar material ja analisado — de outra forma ou nunca
 * atualizavas os resumos, ou pagavas tudo outra vez sem querer.
 *
 * v2: acrescentadas as perguntas de revisao.
 */
export const PROMPT_VERSION = 2;

const Analise = z.object({
  resumo: z.string().describe('3 a 5 frases sobre o que este material ensina'),
  topicos: z.array(z.string()).describe('conceitos concretos abordados, 3 a 10, cada um em poucas palavras'),
  tipo: z.enum(['slides', 'ficha-exercicios', 'enunciado', 'apontamentos', 'guiao-pratico', 'exame', 'administrativo', 'outro']),
  dificuldade: z.enum(['introdutorio', 'intermedio', 'avancado']),
  minutos_estudo: z.number().int().describe('minutos para estudar isto a sério, não para folhear'),
  prerequisitos: z.array(z.string()).describe('tópicos a dominar antes deste material; vazio se não houver'),
  perguntas: z.array(z.object({
    pergunta: z.string(),
    resposta: z.string().describe('resposta modelo, curta, para conferir depois de tentares'),
  })).describe('3 a 6 perguntas de revisão que obrigam a aplicar a matéria, não a repeti-la'),
});

const SYSTEM = `És um assistente de estudo para materiais de uma cadeira no Moodle.

Recebes o texto extraído de um documento de uma cadeira e devolves uma análise estruturada que vai alimentar um plano de estudo diário.

Regras:
- Escreve em português de Portugal.
- O resumo é para alguém que ainda não leu o documento: diz o que se aprende, não o que o documento contém ("explica o modelo relacional e a normalização até à 3FN", não "tem 40 slides sobre bases de dados").
- Os tópicos são para pesquisa e para ligar materiais entre si. Termos técnicos concretos ("normalização 3FN", "diagramas de casos de uso"), não categorias vagas ("conceitos", "introdução").
- minutos_estudo é tempo de estudo real, com apontamentos e exercícios — não o tempo de leitura.
- As perguntas de revisão são a parte mais importante. Faz perguntas que obrigam a aplicar ("dado este enunciado, que entidades e relações identificas?"), não a recitar ("o que é uma entidade?"). Se o documento é uma ficha de exercícios, as perguntas devem apontar para os exercícios que mais valem a pena.
- O texto vem de extração automática de PDF: tabelas e diagramas chegam desfeitos e há lixo de cabeçalhos e rodapés. Ignora isso e não o comentes.
- Se o documento não tiver matéria nenhuma (um horário, uma pauta, um aviso), usa tipo "administrativo", resumo de uma frase, minutos_estudo 0 e perguntas vazias.`;

let client;
export const getClient = () => (client ??= new Anthropic());

/**
 * Parametros de raciocinio por modelo — nao sao iguais entre familias.
 * Haiku nao aceita `effort` (erro) e usa budget_tokens em vez de adaptive;
 * para resumir, sai mais barato e chega bem sem pensar de todo.
 */
function paramsDoModelo(modelo = MODEL) {
  if (modelo.startsWith('claude-haiku')) return { output_config: { format: zodOutputFormat(Analise) } };
  return {
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(Analise), effort: EFFORT },
  };
}

/** O corpo do pedido, partilhado pela via normal e pela Batch. */
export function pedido(nomeMaterial, cadeira, texto, modelo = MODEL) {
  return {
    model: modelo,
    max_tokens: 16000,
    system: SYSTEM,
    ...paramsDoModelo(modelo),
    messages: [{
      role: 'user',
      content: `Cadeira: ${cadeira}\nMaterial: ${nomeMaterial}\n\n--- texto extraído do documento ---\n${texto}`,
    }],
  };
}

/** Estima os tokens de input sem gastar uma geração. */
export async function contarTokens(texto) {
  const r = await getClient().messages.countTokens({
    model: MODEL, system: SYSTEM, messages: [{ role: 'user', content: texto }],
  });
  return r.input_tokens;
}

export async function analisar(nomeMaterial, cadeira, texto) {
  const r = await getClient().messages.parse(pedido(nomeMaterial, cadeira, texto));
  return { analise: extrair(r, nomeMaterial), usage: r.usage };
}

/** Valida uma resposta, venha ela da via normal ou de um resultado de batch. */
export function extrair(mensagem, etiqueta = '') {
  if (mensagem.stop_reason === 'refusal')
    throw new Error(`Recusado pelo modelo (${mensagem.stop_details?.category}): ${etiqueta}`);
  if (mensagem.parsed_output) return mensagem.parsed_output;
  // Resultados da Batch nao passam por messages.parse(), por isso nao trazem
  // parsed_output — o JSON vem no bloco de texto e valida-se aqui.
  const texto = mensagem.content?.find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error(`Resposta sem texto: ${etiqueta}`);
  return Analise.parse(JSON.parse(texto));
}

/** Precos por milhao de tokens: [entrada, saida]. Atualizar se mudarem. */
const PRECO = {
  'claude-opus-5': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
};

/** A Batch API cobra metade. */
export function custo(inputTokens, outputTokens, { modelo = MODEL, batch = false } = {}) {
  const [pin, pout] = PRECO[modelo] || PRECO['claude-opus-5'];
  return ((inputTokens * pin + outputTokens * pout) / 1e6) * (batch ? 0.5 : 1);
}
