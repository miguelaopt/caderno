/**
 * Cliente da Web Services API do Moodle.
 *
 * A API devolve HTTP 200 mesmo em erro. Todo o tratamento disso vive aqui,
 * para que quem chama possa assumir que uma resposta e uma resposta.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { encryptToken, decryptToken } from './product-security.mjs';

const service = () => process.env.MOODLE_SERVICE || 'moodle_mobile_app';
const requestGapMs = () => Number(process.env.MOODLE_REQUEST_GAP_MS || 500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Classificacao de erros
//
// Duas formas de corpo distintas:
//   /login/token.php      -> { error, errorcode }
//   /webservice/rest/...  -> { exception, errorcode, message }
// ---------------------------------------------------------------------------

/** @returns {{kind, hint, errorcode, message} | null} null = nao e erro */
export function classifyMoodleError(body) {
  if (!body || typeof body !== 'object') return null;
  const code = body.errorcode;
  const msg = body.message || body.error || '';
  if (!code && !body.exception && !body.error) return null;

  const known = {
    enablewsdescription: ['WEBSERVICES_DESATIVADOS', 'Os Web Services estao desativados no site. So um administrador do Moodle pode ligar.'],
    webservicesnotenabled: ['WEBSERVICES_DESATIVADOS', 'Os Web Services estao desativados no site.'],
    enablemobilewebservicedescription: ['SERVICO_MOBILE_DESATIVADO', 'O servico da app movel esta desativado.'],
    servicenotavailable: ['SERVICO_MOBILE_DESATIVADO', `O servico "${service()}" nao existe ou nao esta disponivel para a tua conta.`],
    disabledservice: ['SERVICO_MOBILE_DESATIVADO', `O servico "${service()}" existe mas esta desativado.`],
    invalidlogin: ['CREDENCIAIS_INVALIDAS', 'Utilizador ou palavra-passe Moodle incorretos. Se a conta usa SSO, esta forma de ligação pode não estar disponível.'],
    usernotconfirmed: ['CREDENCIAIS_INVALIDAS', 'A conta existe mas nao esta confirmada.'],
    passwordisexpired: ['CREDENCIAIS_INVALIDAS', 'A password expirou; muda-a no Moodle primeiro.'],
    invalidtoken: ['TOKEN_INVALIDO', 'O token nao e valido ou foi revogado. Corre o probe com --save-token para gerar outro.'],
    accessexception: ['FUNCAO_NAO_AUTORIZADA', 'O teu perfil nao tem permissao para esta funcao, ou a funcao nao esta na lista do servico.'],
    nopermissions: ['FUNCAO_NAO_AUTORIZADA', 'Sem permissoes para esta operacao.'],
    accessdenied: ['FUNCAO_NAO_AUTORIZADA', 'Acesso negado a esta funcao.'],
    requirecorrectaccess: ['FUNCAO_NAO_AUTORIZADA', 'A funcao nao esta autorizada para este token/servico.'],
    sitemaintenance: ['SITE_EM_MANUTENCAO', 'O site esta em modo de manutencao.'],
    sitepolicynotagreed: ['POLITICA_POR_ACEITAR', 'Tens de aceitar a politica do site no Moodle (via browser) antes de usar a API.'],
    // O curso deixou de existir ou perdeste a inscricao. Interessa ao sync:
    // e o sinal de que a cadeira do ano passado foi substituida.
    invalidrecord: ['CURSO_INEXISTENTE', 'Esse curso ja nao existe no Moodle.'],
    errorcoursecontextnotvalid: ['CURSO_INEXISTENTE', 'Esse curso ja nao existe ou perdeste o acesso.'],
  };

  if (code && known[code]) return { kind: known[code][0], hint: known[code][1], errorcode: code, message: msg };
  if (body.exception === 'webservice_access_exception')
    return { kind: 'FUNCAO_NAO_AUTORIZADA', hint: 'A funcao nao esta autorizada para este token/servico.', errorcode: code, message: msg };
  return { kind: 'DESCONHECIDO', hint: 'Erro nao mapeado.', errorcode: code, message: msg };
}

export class MoodleError extends Error {
  constructor(info, contexto) {
    super(`[${info.kind}] ${contexto}\n  ${info.hint}`);
    this.name = 'MoodleError';
    // Nao fazer Object.assign(this, info): info.message e a mensagem crua do
    // Moodle e apagaria a mensagem formatada do Error.
    this.kind = info.kind;
    this.errorcode = info.errorcode;
    this.hint = info.hint;
    this.moodleMessage = info.message;
    this.contexto = contexto;
    this.moodle = info;
  }
}

export function assertNoMoodleError(body, contexto) {
  const err = classifyMoodleError(body);
  if (err) throw new MoodleError(err, contexto);
  return body;
}

// ---------------------------------------------------------------------------
// HTTP — um pedido de cada vez, com intervalo minimo. Sem paralelismo.
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function throttle() {
  const turn = requestQueue.then(async () => {
    const wait = lastRequestAt + requestGapMs() - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  requestQueue = turn.catch(() => {});
  return turn;
}

export function post(url, params) {
  return request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
}

async function request(url, init) {
  await throttle();

  let res;
  try { res = await fetch(url, init); }
  catch { throw new Error('Não foi possível contactar o Moodle. Confirma a ligação à Internet e tenta mais tarde.'); }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} em ${url}\n${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      text.trimStart().startsWith('<')
        ? `Resposta HTML em vez de JSON em ${url}. O MOODLE_URL aponta para a raiz do Moodle?`
        : `Resposta nao-JSON em ${url}:\n${text.slice(0, 500)}`,
    );
  }
}

/**
 * Descarrega um ficheiro do Moodle. Os fileurl de core_course_get_contents
 * apontam para /webservice/pluginfile.php e precisam do token na query.
 * Passa pelo mesmo intervalo minimo que os pedidos a API.
 */
export async function getBytes(fileurl, token) {
  await throttle();

  const url = new URL(fileurl);
  url.searchParams.set('token', token);
  let res;
  try { res = await fetch(url, { redirect: 'error' }); }
  catch { throw new Error('Não foi possível descarregar o ficheiro do Moodle. Tenta novamente mais tarde.'); }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} ao descarregar ${fileurl}`);
  if (Number(res.headers.get('content-length')) > 20 * 1024 * 1024)
    throw new Error('O ficheiro do Moodle excede 20 MB.');

  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > 20 * 1024 * 1024) {
      await res.body.cancel().catch(() => {});
      throw new Error('O ficheiro do Moodle excede 20 MB.');
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(Buffer.concat(chunks, total));
  if (res.headers.get('content-type')?.includes('text/html'))
    throw new Error('O Moodle devolveu uma página HTML em vez do ficheiro.');
  // Um token inválido pode devolver JSON de erro com HTTP 200.
  if (res.headers.get('content-type')?.includes('application/json')) {
    const txt = new TextDecoder().decode(bytes.slice(0, 2000));
    try { assertNoMoodleError(JSON.parse(txt), `descarregar ${fileurl}`); } catch (e) { throw e; }
  }
  return bytes;
}

export function baseUrl() {
  const u = (process.env.MOODLE_URL || '').replace(/\/+$/, '');
  if (!u) throw new Error('Falta MOODLE_URL no .env (raiz do Moodle). Ve o .env.example.');
  return u;
}

export async function callWs(token, wsfunction, args = {}) {
  const body = await post(`${baseUrl()}/webservice/rest/server.php`, {
    wstoken: token, wsfunction, moodlewsrestformat: 'json', ...args,
  });
  return assertNoMoodleError(body, `funcao ${wsfunction}`);
}

/** Troca as credenciais Moodle por uma chave do serviço móvel. Não guarda a password. */
export async function loginWithPassword(username, password) {
  if (typeof username !== 'string' || !username.trim() || username.length > 254 ||
      typeof password !== 'string' || !password || password.length > 1024)
    throw new Error('Introduz o utilizador e a palavra-passe do Moodle.');
  const result = assertNoMoodleError(await post(`${baseUrl()}/login/token.php`, {
    username: username.trim(), password, service: service(),
  }), 'ligar ao Moodle');
  if (typeof result?.token !== 'string' || !/^[A-Za-z0-9]{20,256}$/.test(result.token))
    throw new Error('O Moodle não devolveu uma chave de acesso válida para este serviço.');
  return result.token;
}

// ---------------------------------------------------------------------------
// Login pela página da instituição (SSO), como a app móvel oficial.
//
// O browser abre admin/tool/mobile/launch.php e a pessoa entra como de costume
// (SAML, OIDC, CAS, Microsoft, Google). No fim o Moodle redireciona para
//   moodlemobile://token=<base64 de md5(wwwroot + passport):::token[:::privatetoken]>
// O passport é aleatório e só nosso: prova que a resposta é deste pedido.
// ---------------------------------------------------------------------------

export const SSO_SCHEME = 'moodlemobile';
const LOGIN_VIA_BROWSER = 2;
const LOGIN_VIA_EMBEDDED_BROWSER = 3;

/** Configuração pública do site, a mesma que a app móvel lê antes de pedir o login. */
async function publicConfig() {
  const body = await request(`${baseUrl()}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify([{ index: 0, methodname: 'tool_mobile_get_public_config', args: {} }]),
  });
  const result = Array.isArray(body) ? body[0] : body;
  if (!result || result.error || typeof result.data?.wwwroot !== 'string')
    throw new Error('O Moodle não indicou como entrar pela página da instituição.');
  return result.data;
}

/** Prepara o login no browser: o endereço a abrir e o que é preciso para validar a resposta. */
export async function startSsoLogin() {
  const config = await publicConfig();
  if (!Number(config.enablewebservices) || !Number(config.enablemobilewebservice))
    throw new MoodleError({ kind: 'SERVICO_MOBILE_DESATIVADO', hint: 'O servico da app movel esta desativado.' }, 'entrar pela página da instituição');
  // O launch.php só aceita o login no browser se o site o indicar para a app ou se tiver OAuth 2 (Microsoft, Google).
  const oauth = (config.identityproviders || []).some((provider) => String(provider?.url).includes('/auth/oauth2/'));
  if (![LOGIN_VIA_BROWSER, LOGIN_VIA_EMBEDDED_BROWSER].includes(Number(config.typeoflogin)) && !oauth)
    throw new Error('O Moodle da tua instituição só permite ligar aplicações com utilizador e palavra-passe.');
  const wwwroot = config.wwwroot.replace(/\/+$/, '');
  let launch;
  try {
    launch = new URL(config.launchurl || `${wwwroot}/admin/tool/mobile/launch.php`);
    if (launch.origin !== new URL(wwwroot).origin) launch = null;
  } catch { launch = null; }
  if (!launch) throw new Error('O Moodle devolveu um endereço de login inesperado.');
  const passport = randomBytes(16).toString('hex');
  launch.search = new URLSearchParams({ service: service(), passport, urlscheme: SSO_SCHEME }).toString();
  return { url: launch.href, passport, wwwroot };
}

const md5 = (text) => createHash('md5').update(text).digest('hex');

/** Devolve o token de moodlemobile://token=…, ou null se a resposta não for deste pedido. */
export function tokenFromSsoUrl(address, { passport, wwwroot }) {
  const prefix = `${SSO_SCHEME}://token=`;
  if (typeof address !== 'string' || address.length > 4096 || !address.startsWith(prefix)) return null;
  let encoded;
  try { encoded = decodeURIComponent(address.slice(prefix.length)); } catch { return null; }
  // O Windows ou o browser podem acrescentar uma barra no fim de endereços com protocolo próprio.
  for (const candidate of new Set([encoded, encoded.replace(/\/+$/, '')])) {
    const [signature, token] = Buffer.from(candidate, 'base64').toString('utf8').split(':::');
    if (signature === md5(wwwroot + passport) && /^[A-Za-z0-9]{20,256}$/.test(token || '')) return token;
  }
  return null;
}

/** Scripts pessoais antigos usam apenas um token, sem password persistida. */
export async function resolveToken() {
  const token = process.env.MOODLE_TOKEN || decryptToken(await readFile('data/legacy-token.enc', 'utf8').catch(() => {
    throw new Error('Sem chave Moodle para os scripts antigos. Liga o Moodle na aplicação web.');
  }));
  await callWs(token, 'core_webservice_get_site_info');
  return token;
}

// ---------------------------------------------------------------------------
// Compatibilidade com scripts pessoais antigos: chave cifrada em data/.
// ---------------------------------------------------------------------------

export async function saveToken(token, ficheiro = 'data/legacy-token.enc') {
  await mkdir('data', { recursive: true });
  await writeFile(ficheiro, encryptToken(token), { mode: 0o600 });
}

/** Remove sufixos de metadados entre parênteses retos dos nomes Moodle. */
export function nomeLimpo(fullname) {
  return fullname.replace(/\s*-\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
}
