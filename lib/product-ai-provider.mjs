import Anthropic from '@anthropic-ai/sdk';
import { decryptToken, encryptToken } from './product-security.mjs';

const endpoints = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
};

export const AI_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'groq', 'compatible'];

export function aiSettings(db, userId) {
  const row = db.prepare('SELECT provider,base_url,summary_model,explain_model FROM ai_credentials WHERE user_id=?').get(userId);
  return row ? { ...row, hasKey: true } : null;
}

export function aiConfigured(db, userId) {
  return !!aiSettings(db, userId);
}

function validBaseUrl(value) {
  const allowed = (process.env.AI_ALLOWED_BASE_URLS || '').split(',').map((part) => part.trim().replace(/\/+$/, '')).filter(Boolean);
  const input = String(value || '').trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(input); } catch { throw new Error('URL do fornecedor inválido.'); }
  if (input.length > 2048 || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (process.env.NODE_ENV !== 'desktop' && !allowed.includes(input)))
    throw new Error('Este endpoint não está autorizado pelo operador.');
  return input;
}

export function saveAiSettings(db, userId, data) {
  const provider = String(data?.provider || '');
  if (!AI_PROVIDERS.includes(provider)) throw new Error('Escolhe um fornecedor de IA válido.');
  const summary = String(data.summaryModel || '').trim();
  const explain = String(data.explainModel || '').trim();
  if (!summary || !explain || summary.length > 120 || explain.length > 120 ||
      /[\r\n]/.test(summary + explain)) throw new Error('Indica modelos válidos para resumos e explicações.');
  const base = provider === 'compatible' ? validBaseUrl(data.baseUrl) : null;
  const old = db.prepare('SELECT provider,key_enc FROM ai_credentials WHERE user_id=?').get(userId);
  const submitted = String(data.apiKey || '');
  if (submitted && (submitted.length < 8 || submitted.length > 2048 || /[\r\n]/.test(submitted)))
    throw new Error('A chave de API deve ter entre 8 e 2048 caracteres, sem quebras de linha.');
  if (!submitted && !old) throw new Error('Introduz a tua chave de API.');
  if (!submitted && old.provider !== provider) throw new Error('Introduz a chave do novo fornecedor.');
  const encrypted = submitted ? encryptToken(submitted) : old.key_enc;
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO ai_credentials(user_id,provider,base_url,key_enc,summary_model,explain_model,updated_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider,base_url=excluded.base_url,
      key_enc=excluded.key_enc,summary_model=excluded.summary_model,explain_model=excluded.explain_model,
      updated_at=excluded.updated_at`).run(userId, provider, base, encrypted, summary, explain, Math.floor(Date.now() / 1000));
    db.prepare('DELETE FROM analyses WHERE file_id IN (SELECT id FROM files WHERE user_id=?)').run(userId);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return aiSettings(db, userId);
}

export function deleteAiSettings(db, userId) {
  db.prepare('DELETE FROM ai_credentials WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM analyses WHERE file_id IN (SELECT id FROM files WHERE user_id=?)').run(userId);
}

export function userAiClient(db, userId, kind) {
  const row = db.prepare('SELECT * FROM ai_credentials WHERE user_id=?').get(userId);
  if (!row) throw new Error('Configura a tua chave de IA nas Definições.');
  return {
    provider: row.provider,
    baseUrl: row.provider === 'compatible' ? validBaseUrl(row.base_url) : endpoints[row.provider],
    apiKey: decryptToken(row.key_enc),
    model: kind === 'summary' ? row.summary_model : row.explain_model,
  };
}

// Modelos com raciocínio gastam tokens a pensar antes de responder; sem limitar o esforço,
// o JSON chegava cortado («erros JSON»). Só se pede esforço baixo a quem o aceita.
const NO_ANSWER = 'O modelo gastou o limite de tokens a raciocinar e não chegou a responder. Escolhe um modelo mais rápido nas Definições.';
const anthropicEffort = (model) => /^claude-(?:opus|sonnet|fable|mythos)-(?:[5-9]|4-[6-9])/.test(model);
const openaiReasoning = (model) => /^(?:gpt-[5-9]|o\d)/.test(model);

async function providerError(response) {
  let detail = '';
  try { const data = await response.json(); detail = String(data.error?.message || data.message || '').slice(0, 200); } catch {}
  const advice = response.status === 429 || response.status === 413
    ? 'Passaste o limite por minuto do teu plano. No plano gratuito da Groq, espera um minuto e pede de novo.'
    : 'Confirma a chave, o ID do modelo e o saldo da conta.';
  return new Error(`O fornecedor de IA recusou o pedido (HTTP ${response.status})${detail ? `: ${detail}` : ''}. ${advice}`);
}

/** Devolve o texto, os tokens usados e se a resposta ficou cortada pelo limite de tokens. */
export async function generateAi(client, system, prompt, maxTokens, { json = false } = {}) {
  if (client.provider === 'anthropic') {
    const result = await new Anthropic({ apiKey: client.apiKey }).messages.create({
      model: client.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }],
      ...(anthropicEffort(client.model) ? { output_config: { effort: 'low' } } : {}),
    });
    const text = result.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
    if (!text.trim()) throw new Error(result.stop_reason === 'max_tokens' ? NO_ANSWER : 'O fornecedor de IA devolveu uma resposta vazia.');
    return { text, usage: { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens },
      truncated: result.stop_reason === 'max_tokens' };
  }
  const openai = client.provider === 'openai';
  const endpoint = `${client.baseUrl}/${openai ? 'responses' : 'chat/completions'}`;
  const request = openai
    ? { model: client.model, instructions: system, input: prompt, max_output_tokens: maxTokens, store: false,
      ...(openaiReasoning(client.model) ? { reasoning: { effort: 'low' } } : {}),
      ...(json ? { text: { format: { type: 'json_object' } } } : {}) }
    : { model: client.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      max_tokens: maxTokens, ...(client.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
      ...(client.provider === 'groq' && client.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
      ...(json && client.provider !== 'compatible' ? { response_format: { type: 'json_object' } } : {}) };
  // Planos gratuitos (Groq) respondem 429 quando se passa o limite por minuto: espera o que o fornecedor pedir e tenta de novo.
  let response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { authorization: `Bearer ${client.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(request) });
    if (response.status !== 429 || attempt === 2) break;
    const after = response.headers.has('retry-after') ? Number(response.headers.get('retry-after')) : NaN;
    await new Promise((done) => setTimeout(done, Math.min(65, after >= 0 ? after : 20) * 1000));
  }
  if (!response.ok) throw await providerError(response);
  const data = await response.json();
  const content = openai
    ? data.output?.filter((item) => item.type === 'message').flatMap((item) => item.content || [])
      .filter((item) => item.type === 'output_text').map((item) => item.text).join('') || data.output_text
    : data.choices?.[0]?.message?.content;
  const truncated = openai ? data.incomplete_details?.reason === 'max_output_tokens' : data.choices?.[0]?.finish_reason === 'length';
  if (typeof content !== 'string' || !content.trim())
    throw new Error(truncated ? NO_ANSWER : 'O fornecedor de IA devolveu uma resposta vazia.');
  return { text: content, usage: { input_tokens: data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? data.usage?.completion_tokens ?? 0 }, truncated };
}
