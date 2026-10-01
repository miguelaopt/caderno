/**
 * Conversa sobre um documento.
 *
 * O contexto e SEMPRE um so documento, e o historico vai truncado. Uma
 * conversa aberta sobre PDFs reenvia o documento a cada pergunta: com 5 EUR
 * para o semestre, isso esvazia o orcamento mais depressa que os resumos
 * todos juntos.
 */

import { getClient, MODEL, custo } from './llm.mjs';

const SYSTEM = `Ajudas uma pessoa a compreender o material de uma cadeira no Moodle.

- Responde só a partir do documento que te é dado. Se a resposta não estiver lá, di-lo em vez de a inventares.
- Português de Portugal, tratamento por tu.
- Vai direto ao assunto. Sem introduções nem resumos do que ele perguntou.
- Explica como um colega que percebe da matéria explicaria, com um exemplo concreto quando ajudar.
- O texto vem de extração automática de PDF e chega desalinhado. Ignora isso.`;

/** Quantas trocas anteriores se reenviam. Mais do que isto e so custo. */
const HISTORICO_MAX = 6;

export async function perguntar(documento, historico, pergunta) {
  const msgs = [
    { role: 'user', content: `Documento em causa: ${documento.titulo} (${documento.cadeira})\n\n--- texto ---\n${documento.texto}` },
    { role: 'assistant', content: 'Li o documento. Pergunta.' },
    ...historico.slice(-HISTORICO_MAX).map((m) => ({ role: m.quem === 'tu' ? 'user' : 'assistant', content: m.texto })),
    { role: 'user', content: pergunta },
  ];

  const r = await getClient().messages.create({
    model: MODEL, max_tokens: 2000, system: SYSTEM,
    // O documento e o mesmo em todas as perguntas da conversa: em cache, a
    // segunda pergunta em diante custa uma fracao da primeira.
    cache_control: { type: 'ephemeral' },
    messages: msgs,
  });

  if (r.stop_reason === 'refusal') throw new Error('O modelo recusou responder a isto.');
  return {
    texto: r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
    custo: custo(r.usage.input_tokens, r.usage.output_tokens),
    cache: r.usage.cache_read_input_tokens ?? 0,
  };
}
