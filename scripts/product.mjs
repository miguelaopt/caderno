#!/usr/bin/env node
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep, dirname } from 'node:path';
import { openProductDb, PRODUCT_DB_PATH, PRODUCT_FILES_DIR } from '../lib/product-db.mjs';
import { randomBytes } from 'node:crypto';
import { id, hash, passwordHash, passwordMatches, encryptToken, newSession, sessionUser, sessionCookie } from '../lib/product-security.mjs';
import { assertFunctions, storeFile, supportedDocument, syncUser } from '../lib/product-sync.mjs';
import { dailyPlan } from '../lib/product-plan.mjs';
import { analyzeFile, askCourse } from '../lib/product-ai.mjs';
import { aiSettings, aiConfigured, saveAiSettings, deleteAiSettings, testAi } from '../lib/product-ai-provider.mjs';
import { callWs, baseUrl, loginWithPassword, nomeLimpo } from '../lib/moodle.mjs';

try { process.loadEnvFile('.env'); } catch {}
const db = openProductDb();
const port = Number(process.env.PORT ?? 4321);
const now = () => Math.floor(Date.now() / 1000);
const secure = process.env.NODE_ENV === 'production';
const desktop = process.env.NODE_ENV === 'desktop';
const activeSyncs = new Set();
const activeAnalysis = new Set();
const analysisRequested = new Set();
const aiQueues = new Map();
const authAttempts = new Map();

function authLimit(req, failed = false) {
  const key = req.socket.remoteAddress || 'unknown';
  const current = authAttempts.get(key) || { count: 0, since: Date.now() };
  if (Date.now() - current.since > 15 * 60 * 1000) { current.count = 0; current.since = Date.now(); }
  if (failed) current.count++;
  authAttempts.set(key, current);
  if (current.count >= 10) throw Object.assign(new Error('Muitas tentativas. Espera 15 minutos antes de voltar a tentar.'), { status: 429 });
}

function queueAi(userId, work) {
  const previous = aiQueues.get(userId) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  aiQueues.set(userId, next);
  next.finally(() => { if (aiQueues.get(userId) === next) aiQueues.delete(userId); }).catch(() => {});
  return next;
}

function send(res, value, status = 200, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
}

async function body(req, limit = 64 * 1024) {
  let size = 0; const parts = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) throw new Error('O pedido é demasiado grande.');
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Formato de pedido inválido.');
  try { return JSON.parse((await body(req)).toString('utf8')); }
  catch { throw new Error('Não foi possível ler os dados enviados.'); }
}

function requireUser(req) {
  const user = sessionUser(db, req.headers.cookie);
  if (!user) throw Object.assign(new Error('Inicia sessão para continuar.'), { status: 401 });
  return user;
}

function ownCourse(userId, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id=? AND user_id=?').get(courseId, userId);
  if (!course) throw Object.assign(new Error('Cadeira não encontrada.'), { status: 404 });
  return course;
}

function insideUserFiles(userId, stored) {
  const root = resolve(PRODUCT_FILES_DIR, userId);
  const path = resolve(String(stored));
  const inside = relative(root, path);
  if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
    throw Object.assign(new Error('Ficheiro indisponível.'), { status: 403 });
  return path;
}

function noAccountsOnDesktop() {
  if (desktop) throw Object.assign(new Error('A aplicação Windows usa um perfil local, sem conta.'), { status: 404 });
}

// Perfil único da app Windows: reutiliza o perfil com mais materiais (instalações antigas
// podiam ter contas) ou cria um novo. O Electron recebe o token e coloca-o como cookie.
export function localSession() {
  let user = db.prepare(`SELECT u.id FROM users u ORDER BY (SELECT count(*) FROM files f WHERE f.user_id=u.id) DESC, u.created_at LIMIT 1`).get();
  if (!user) {
    user = { id: id() };
    db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)')
      .run(user.id, `perfil-${user.id}@local`, passwordHash(randomBytes(32).toString('hex')), now());
    db.prepare('INSERT INTO preferences(user_id) VALUES(?)').run(user.id);
  }
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  return newSession(db, user.id).token;
}

async function startSync(userId) {
  if (activeSyncs.has(userId)) return { status: 'running' };
  activeSyncs.add(userId);
  try {
    return { status: 'ok', ...await syncUser(db, userId) };
  }
  finally { activeSyncs.delete(userId); }
}

// Com a chave pessoal, cada pedido pode ter custos: a fila só corre quando a pessoa a inicia.
async function analyzePending(userId) {
  if (!aiConfigured(db, userId)) return;
  if (!db.prepare('SELECT ai_consent_at FROM preferences WHERE user_id=?').get(userId)?.ai_consent_at) return;
  if (activeAnalysis.has(userId)) { analysisRequested.add(userId); return; }
  activeAnalysis.add(userId);
  try {
    const pending = db.prepare(`SELECT f.id FROM files f JOIN courses c ON c.id=f.course_id
      LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash
      WHERE f.user_id=? AND c.selected=1 AND f.text_status='ok' AND a.file_id IS NULL ORDER BY f.first_seen_at`).all(userId);
    for (const file of pending) {
      try { await queueAi(userId, () => analyzeFile(db, userId, file.id)); }
      catch (error) { console.error('Análise:', error.message); }
    }
  } finally {
    activeAnalysis.delete(userId);
    if (analysisRequested.delete(userId))
      setImmediate(() => analyzePending(userId).catch((error) => console.error('Análise:', error.message)));
  }
}

function state(user) {
  const courses = db.prepare('SELECT id,name,shortname,selected,source,exam_at,last_synced_at FROM courses WHERE user_id=? ORDER BY selected DESC,name').all(user.id);
  const files = db.prepare(`SELECT f.id,f.course_id,f.filename,f.mime,f.size,f.text_status,length(f.text) AS text_chars,
    json_array_length(f.pages_json) AS page_count,f.source,f.first_seen_at,f.changed_at,f.favorite,a.summary,a.topics_json
    FROM files f LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE f.user_id=? ORDER BY f.changed_at DESC`).all(user.id);
  const deadlines = db.prepare('SELECT id,course_id,title,kind,due_at,source FROM deadlines WHERE user_id=? AND due_at>? ORDER BY due_at LIMIT 30').all(user.id, now());
  for (const course of courses) if (course.exam_at && Number(course.exam_at) > now())
    deadlines.push({ id: `exam-${course.id}`, course_id: course.id, title: `Exame de ${course.name}`, kind: 'exame', due_at: course.exam_at, source: 'manual' });
  deadlines.sort((a, b) => Number(a.due_at) - Number(b.due_at));
  const connection = db.prepare('SELECT site_name,connected_at,last_error FROM moodle_connections WHERE user_id=?').get(user.id);
  const preference = db.prepare('SELECT * FROM preferences WHERE user_id=?').get(user.id);
  const sync = db.prepare('SELECT started_at,finished_at,status,new_count,error FROM sync_runs WHERE user_id=? ORDER BY started_at DESC LIMIT 1').get(user.id);
  const pendingAnalysis = db.prepare(`SELECT count(*) AS n FROM files f JOIN courses c ON c.id=f.course_id
    LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash
    WHERE f.user_id=? AND c.selected=1 AND f.text_status='ok' AND a.file_id IS NULL`).get(user.id).n;
  const quiz = db.prepare('SELECT count(*) AS total,COALESCE(SUM(correct),0) AS correct FROM quiz_log WHERE user_id=?').get(user.id);
  const days = db.prepare('SELECT DISTINCT date(studied_at,\'unixepoch\') AS day FROM study_log WHERE user_id=? AND studied_at>? ORDER BY day DESC')
    .all(user.id, now() - 7 * 86400).map((row) => row.day);
  const studied = db.prepare(`SELECT DISTINCT f.id,a.topics_json FROM study_log l JOIN files f ON f.id=l.file_id
    LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE l.user_id=?`).all(user.id);
  const topics = new Set();
  for (const row of studied) {
    try { for (const topic of JSON.parse(String(row.topics_json || '{}')).topicos || []) topics.add(topic); } catch {}
  }
  return { user: { id: user.id, email: desktop ? null : user.email }, courses, files, deadlines, connection: connection || null, preference, sync: sync || null,
    progress: { daysThisWeek: days.length, quizTotal: Number(quiz.total), quizCorrect: Number(quiz.correct), topics: [...topics].slice(0, 30) },
    desktop, version: process.env.CADERNO_VERSION || null, moodleUrl: desktop ? process.env.MOODLE_URL || '' : undefined,
    materialsDir: desktop ? resolve(PRODUCT_FILES_DIR) : undefined, dataDir: desktop ? dirname(resolve(PRODUCT_DB_PATH)) : undefined, onboarded: !!preference?.onboarded_at,
    analysis: { pending: Number(pendingAnalysis), running: activeAnalysis.has(user.id) },
    ai: { configured: aiConfigured(db, user.id), settings: aiSettings(db, user.id), consented: !!preference?.ai_consent_at },
    plan: dailyPlan(db, user.id), changesSince: preference?.last_seen_at || null };
}

// Contas com SSO (entrada pela página da instituição, Microsoft ou Google) não têm palavra-passe
// do Moodle e o token.php recusa-as como «invalidlogin». A alternativa é criar as cadeiras à mão.
const MANUAL_HINT = 'Podes criar as cadeiras à mão em «Cadeira sem Moodle» e enviar os ficheiros.';
function moodleLoginError(error) {
  if (error.errorcode === 'invalidlogin')
    return new Error(`Utilizador ou palavra-passe incorretos. Se entras no Moodle pela página da tua instituição ou com a conta Microsoft ou Google, a conta usa SSO e o Caderno não consegue ligar. ${MANUAL_HINT}`);
  if (error.kind === 'SERVICO_MOBILE_DESATIVADO' || error.kind === 'WEBSERVICES_DESATIVADOS')
    return new Error(`O Moodle da tua instituição não permite ligações de aplicações. ${MANUAL_HINT}`);
  return error.hint ? new Error(`${error.hint} ${MANUAL_HINT}`) : error;
}

const routes = {
  'POST /api/register': async (req, res) => {
    noAccountsOnDesktop();
    authLimit(req, true);
    const data = await jsonBody(req);
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Introduz um endereço de email válido.');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new Error('Já existe uma conta com este email.');
    const uid = id();
    db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)').run(uid, email, passwordHash(data.password), now());
    db.prepare('INSERT INTO preferences(user_id) VALUES(?)').run(uid);
    const session = newSession(db, uid);
    send(res, { ok: true }, 201, { 'set-cookie': sessionCookie(session.token, secure) });
  },
  'POST /api/login': async (req, res) => {
    noAccountsOnDesktop();
    authLimit(req);
    const data = await jsonBody(req);
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(data.email || '').trim().toLowerCase());
    if (!user || !passwordMatches(data.password, user.password_hash)) {
      authLimit(req, true);
      throw Object.assign(new Error('Email ou palavra-passe incorretos.'), { status: 401 });
    }
    const session = newSession(db, user.id);
    send(res, { ok: true }, 200, { 'set-cookie': sessionCookie(session.token, secure) });
  },
  'POST /api/logout': async (req, res) => {
    const token = /(?:^|;\s*)caderno_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    if (token) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(hash(token));
    send(res, { ok: true }, 200, { 'set-cookie': 'caderno_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  },
  'GET /api/state': async (req, res) => send(res, state(requireUser(req))),
  'POST /api/desktop/moodle-url': async (req, res) => {
    requireUser(req);
    if (process.env.NODE_ENV !== 'desktop' || !process.env.DESKTOP_CONFIG_PATH)
      throw Object.assign(new Error('Esta opção só existe na aplicação Windows.'), { status: 404 });
    if (db.prepare('SELECT 1 FROM moodle_connections LIMIT 1').get())
      throw new Error('Desliga primeiro as contas Moodle ligadas antes de alterar o endereço.');
    const { url } = await jsonBody(req);
    if (typeof url !== 'string' || url.length > 2048) throw new Error('Introduz o endereço do Moodle.');
    let parsed;
    try { parsed = new URL(url.trim()); } catch { throw new Error('Introduz um endereço HTTPS válido.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !parsed.hostname)
      throw new Error('Introduz o endereço HTTPS da raiz do Moodle, sem credenciais ou parâmetros.');
    const moodleUrl = parsed.href.replace(/\/+$/, '');
    await writeFile(process.env.DESKTOP_CONFIG_PATH, JSON.stringify({ moodleUrl }, null, 2), { mode: 0o600 });
    process.env.MOODLE_URL = moodleUrl;
    send(res, { ok: true, moodleUrl });
  },
  'POST /api/connect': async (req, res) => {
    const user = requireUser(req);
    const { username, password } = await jsonBody(req);
    let token;
    try { token = await loginWithPassword(username, password); }
    catch (error) { throw moodleLoginError(error); }
    const site = await callWs(token, 'core_webservice_get_site_info');
    assertFunctions(site);
    const courses = await callWs(token, 'core_enrol_get_users_courses', { userid: String(site.userid) });
    db.exec('BEGIN');
    try {
      db.prepare(`INSERT INTO moodle_connections(user_id,token_enc,moodle_user_id,site_name,functions_json,connected_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET token_enc=excluded.token_enc,moodle_user_id=excluded.moodle_user_id,
        site_name=excluded.site_name,functions_json=excluded.functions_json,connected_at=excluded.connected_at,last_error=NULL`)
        .run(user.id, encryptToken(token), site.userid, site.sitename || 'Moodle', JSON.stringify(site.functions), now());
      const upsert = db.prepare(`INSERT INTO courses(id,user_id,moodle_id,name,shortname,source)
        VALUES(?,?,?,?,?,'moodle') ON CONFLICT(user_id,moodle_id) DO UPDATE SET name=excluded.name,shortname=excluded.shortname`);
      for (const course of courses) upsert.run(id(), user.id, course.id, nomeLimpo(course.fullname), course.shortname);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    send(res, { ok: true, count: courses.length });
    if (db.prepare("SELECT 1 FROM courses WHERE user_id=? AND selected=1 AND source='moodle' LIMIT 1").get(user.id))
      startSync(user.id).catch((error) => console.error('Sincronização:', error.message));
  },
  'POST /api/disconnect': async (req, res) => {
    const user = requireUser(req);
    db.prepare('DELETE FROM moodle_connections WHERE user_id=?').run(user.id);
    send(res, { ok: true, revokeUrl: `${baseUrl()}/user/managetoken.php` });
  },
  'POST /api/courses': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const selected = [...new Set(Array.isArray(data.selected) ? data.selected : [])];
    const owned = db.prepare('SELECT id FROM courses WHERE user_id=?').all(user.id).map((row) => row.id);
    if (selected.some((courseId) => !owned.includes(courseId))) throw new Error('Escolheste uma cadeira que não pertence à tua conta.');
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE courses SET selected=0 WHERE user_id=?').run(user.id);
      for (const courseId of selected) db.prepare('UPDATE courses SET selected=1 WHERE id=? AND user_id=?').run(courseId, user.id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    send(res, { ok: true });
    if (db.prepare("SELECT 1 FROM courses WHERE user_id=? AND selected=1 AND source='moodle' LIMIT 1").get(user.id))
      startSync(user.id).catch((error) => console.error('Sincronização:', error.message));
  },
  'POST /api/preferences': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const minutes = Number(data.minutes);
    const perDay = data.weekdays;
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480 ||
      !Array.isArray(perDay) || perDay.length !== 7 || perDay.some((value) => !Number.isInteger(value) || value < 0 || value > 480))
      throw new Error('Escolhe entre 0 e 480 minutos por dia.');
    db.prepare('UPDATE preferences SET minutes_per_day=?,minutes_by_weekday_json=? WHERE user_id=?')
      .run(minutes, JSON.stringify(perDay), user.id);
    send(res, { ok: true });
  },
  'POST /api/ai-consent': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    if (typeof data.enabled !== 'boolean') throw new Error('Escolhe se permites a análise por IA.');
    db.prepare('UPDATE preferences SET ai_consent_at=? WHERE user_id=?').run(data.enabled ? now() : null, user.id);
    send(res, { ok: true });
  },
  'POST /api/theme': async (req, res) => {
    const user = requireUser(req);
    const { theme } = await jsonBody(req);
    if (!['dark', 'light'].includes(theme)) throw new Error('Tema inválido.');
    db.prepare('UPDATE preferences SET theme=? WHERE user_id=?').run(theme, user.id);
    send(res, { ok: true });
  },
  'POST /api/onboarding': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    if (typeof data.done !== 'boolean') throw new Error('Indica se o guia foi concluído.');
    db.prepare('UPDATE preferences SET onboarded_at=? WHERE user_id=?').run(data.done ? now() : null, user.id);
    send(res, { ok: true });
  },
  'POST /api/ai-settings': async (req, res) => {
    const user = requireUser(req);
    const settings = saveAiSettings(db, user.id, await jsonBody(req));
    send(res, { ok: true, settings });
  },
  'POST /api/ai-test': async (req, res) => {
    const user = requireUser(req);
    await testAi(db, user.id);
    send(res, { ok: true });
  },
  'DELETE /api/ai-settings': async (req, res) => {
    const user = requireUser(req);
    deleteAiSettings(db, user.id);
    send(res, { ok: true });
  },
  'POST /api/analyze': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    send(res, await queueAi(user.id, () => analyzeFile(db, user.id, data.fileId, { force: data.force === true })));
  },
  'POST /api/analyze-pending': async (req, res) => {
    const user = requireUser(req);
    if (!aiConfigured(db, user.id) || !db.prepare('SELECT ai_consent_at FROM preferences WHERE user_id=?').get(user.id)?.ai_consent_at)
      throw new Error('Ativa primeiro a análise por IA nas Definições.');
    analyzePending(user.id).catch((error) => console.error('Análise:', error.message));
    send(res, { ok: true, status: 'started' });
  },
  'POST /api/ask': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    send(res, await queueAi(user.id, () => askCourse(db, user.id, data.courseId, data.question, data.fileId || null)));
  },
  'POST /api/exam': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    ownCourse(user.id, data.courseId);
    const parsed = data.date ? Date.parse(`${data.date}T12:00:00Z`) : null;
    if (data.date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(parsed))) throw new Error('Data de exame inválida.');
    db.prepare('UPDATE courses SET exam_at=? WHERE id=? AND user_id=?').run(parsed ? Math.floor(parsed / 1000) : null, data.courseId, user.id);
    send(res, { ok: true });
  },
  'POST /api/seen': async (req, res) => {
    const user = requireUser(req);
    db.prepare('UPDATE preferences SET last_seen_at=? WHERE user_id=?').run(now(), user.id);
    send(res, { ok: true });
  },
  'POST /api/study': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const file = db.prepare('SELECT f.id FROM files f JOIN courses c ON c.id=f.course_id WHERE f.id=? AND f.user_id=? AND c.selected=1').get(data.fileId, user.id);
    const minutes = Number(data.minutes);
    if (!file) throw Object.assign(new Error('Material não encontrado.'), { status: 404 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240 || !['bem', 'assim', 'mal'].includes(data.result))
      throw new Error('Registo de estudo inválido.');
    db.prepare('INSERT INTO study_log(id,user_id,file_id,studied_at,minutes,result) VALUES(?,?,?,?,?,?)')
      .run(id(), user.id, data.fileId, now(), minutes, data.result);
    send(res, { ok: true });
  },
  'GET /api/file': async (req, res, url) => {
    const user = requireUser(req);
    const file = db.prepare(`SELECT f.id,f.course_id,f.filename,f.mime,f.text_status,f.size,f.source,f.favorite,
      substr(f.text,1,8000) AS text_preview,json_array_length(f.pages_json) AS page_count,
      a.summary,a.topics_json,a.questions_json
      FROM files f LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE f.id=? AND f.user_id=?`)
      .get(url.searchParams.get('id'), user.id);
    if (!file) throw Object.assign(new Error('Material não encontrado.'), { status: 404 });
    send(res, { ...file, topics: JSON.parse(String(file.topics_json || '{}')).topicos || [],
      questions: JSON.parse(String(file.questions_json || '[]')) });
  },
  'POST /api/favorite': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    if (typeof data.favorite !== 'boolean') throw new Error('Escolhe se queres guardar o material nos favoritos.');
    const result = db.prepare('UPDATE files SET favorite=? WHERE id=? AND user_id=?')
      .run(data.favorite ? 1 : 0, data.fileId, user.id);
    if (!result.changes) throw Object.assign(new Error('Material não encontrado.'), { status: 404 });
    send(res, { ok: true, favorite: data.favorite });
  },
  'GET /api/cards': async (req, res, url) => {
    const user = requireUser(req);
    const chosen = [...new Set(url.searchParams.getAll('course'))];
    if (chosen.length > 50) throw new Error('Escolhe até 50 cadeiras.');
    if (chosen.length) {
      const owned = db.prepare('SELECT id FROM courses WHERE user_id=? AND selected=1').all(user.id);
      const allowed = new Set(owned.map((course) => course.id));
      if (chosen.some((id) => !allowed.has(id)))
        throw Object.assign(new Error('Cadeira não encontrada.'), { status: 404 });
    }
    const selected = new Set(chosen);
    const rows = db.prepare(`SELECT f.id AS file_id,f.filename,c.id AS course_id,c.name AS course,a.questions_json
      FROM analyses a JOIN files f ON f.id=a.file_id JOIN courses c ON c.id=f.course_id
      WHERE f.user_id=? AND c.selected=1 AND a.hash=f.hash ORDER BY f.first_seen_at`).all(user.id);
    const history = db.prepare('SELECT studied_at,result FROM card_log WHERE user_id=? AND file_id=? AND question_index=? ORDER BY studied_at');
    const cards = [];
    for (const row of rows) {
      if (selected.size && !selected.has(row.course_id)) continue;
      const questions = JSON.parse(String(row.questions_json || '[]'));
      questions.forEach((question, index) => {
        const visits = history.all(user.id, row.file_id, index);
        const last = visits.at(-1);
        const interval = last?.result === 'bem' ? Math.min(35, [1, 3, 7, 16, 35][Math.min(visits.length - 1, 4)]) : 1;
        if (!last || Number(last.studied_at) + interval * 86400 <= now())
          cards.push({ fileId: row.file_id, courseId: row.course_id, index, filename: row.filename, course: row.course, ...question });
      });
    }
    send(res, { cards: cards.slice(0, 20), totalDue: cards.length });
  },
  'GET /api/practice': async (req, res, url) => {
    const user = requireUser(req);
    const courseId = url.searchParams.get('course');
    if (courseId && !db.prepare('SELECT 1 FROM courses WHERE id=? AND user_id=? AND selected=1').get(courseId, user.id))
      throw Object.assign(new Error('Cadeira não encontrada.'), { status: 404 });
    const rows = db.prepare(`SELECT f.id AS file_id,f.filename,c.id AS course_id,c.name AS course,a.questions_json
      FROM analyses a JOIN files f ON f.id=a.file_id AND a.hash=f.hash JOIN courses c ON c.id=f.course_id
      WHERE f.user_id=? AND c.selected=1 AND (? IS NULL OR c.id=?) ORDER BY f.first_seen_at`).all(user.id, courseId, courseId);
    const history = db.prepare(`SELECT file_id,question_index,count(*) AS attempts,COALESCE(sum(correct),0) AS correct
      FROM quiz_log WHERE user_id=? GROUP BY file_id,question_index`).all(user.id);
    const scores = new Map(history.map((row) => [`${row.file_id}:${row.question_index}`, row]));
    const questions = rows.flatMap((row) => JSON.parse(String(row.questions_json || '[]')).map((question, index) => {
      const score = scores.get(`${row.file_id}:${index}`);
      return { fileId: row.file_id, courseId: row.course_id, filename: row.filename, course: row.course,
        index, ...question, attempts: Number(score?.attempts || 0), correct: Number(score?.correct || 0) };
    })).sort((a, b) => (a.attempts ? a.correct / a.attempts : 0.5) -
      (b.attempts ? b.correct / b.attempts : 0.5) || a.attempts - b.attempts);
    send(res, { questions: questions.slice(0, 80), total: questions.length });
  },
  'POST /api/card': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const file = db.prepare('SELECT a.questions_json FROM files f JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE f.id=? AND f.user_id=?')
      .get(data.fileId, user.id);
    if (!file || !Number.isInteger(data.index) || data.index < 0 || data.index >= JSON.parse(String(file.questions_json)).length ||
      !['bem', 'assim', 'mal'].includes(data.result)) throw new Error('Carta inválida.');
    db.prepare('INSERT INTO card_log(id,user_id,file_id,question_index,studied_at,result) VALUES(?,?,?,?,?,?)')
      .run(id(), user.id, data.fileId, data.index, now(), data.result);
    send(res, { ok: true });
  },
  'POST /api/quiz': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const file = db.prepare('SELECT a.questions_json FROM files f JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE f.id=? AND f.user_id=?')
      .get(data.fileId, user.id);
    if (!file || !Number.isInteger(data.index) || data.index < 0 || data.index >= JSON.parse(String(file.questions_json)).length ||
      typeof data.correct !== 'boolean') throw new Error('Resposta de exercício inválida.');
    db.prepare('INSERT INTO quiz_log(id,user_id,file_id,question_index,answered_at,correct) VALUES(?,?,?,?,?,?)')
      .run(id(), user.id, data.fileId, data.index, now(), data.correct ? 1 : 0);
    send(res, { ok: true });
  },
  'POST /api/manual-course': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    const name = String(data.name || '').trim();
    if (!name || name.length > 100) throw new Error('Escreve o nome da cadeira (até 100 caracteres).');
    const courseId = id();
    db.prepare("INSERT INTO courses(id,user_id,name,shortname,selected,source) VALUES(?,?,?,?,1,'manual')")
      .run(courseId, user.id, name, name.slice(0, 20));
    send(res, { ok: true, id: courseId }, 201);
  },
  'POST /api/upload': async (req, res, url) => {
    const user = requireUser(req);
    const course = ownCourse(user.id, url.searchParams.get('course'));
    if (!course.selected) throw new Error('Seleciona primeiro esta cadeira.');
    if (!['application/pdf', 'application/octet-stream'].includes(req.headers['content-type']))
      throw new Error('Formato do pedido inválido.');
    const rawName = decodeURIComponent(req.headers['x-filename'] || 'Material.pdf');
    const filename = rawName.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 160);
    if (!supportedDocument(filename)) throw new Error('Formato não suportado. Usa PDF, Office, OpenDocument, texto, EPUB ou ZIP.');
    const bytes = await body(req, 20 * 1024 * 1024);
    const result = await storeFile(db, { userId: user.id, courseId: course.id, filename, source: 'upload', bytes });
    send(res, { ok: true, ...result }, 201);
  },
  'POST /api/open-file': async (req, res) => {
    const user = requireUser(req);
    if (!desktop) throw Object.assign(new Error('Esta opção só existe na aplicação Windows.'), { status: 404 });
    const data = await jsonBody(req);
    const file = db.prepare('SELECT path FROM files WHERE id=? AND user_id=?').get(data.fileId, user.id);
    if (!file?.path) throw Object.assign(new Error('Ficheiro não encontrado.'), { status: 404 });
    const path = insideUserFiles(user.id, file.path);
    const { shell } = await import('electron');
    if (data.reveal) shell.showItemInFolder(path);
    else {
      const problem = await shell.openPath(path);
      if (problem) throw new Error(`O Windows não conseguiu abrir o ficheiro: ${problem}`);
    }
    send(res, { ok: true });
  },
  'POST /api/sync': async (req, res) => send(res, await startSync(requireUser(req).id)),
  'GET /api/export': async (req, res) => {
    const user = requireUser(req);
    const data = state(user);
    data.studyLog = db.prepare('SELECT file_id,studied_at,minutes,result FROM study_log WHERE user_id=?').all(user.id);
    data.cardLog = db.prepare('SELECT file_id,question_index,studied_at,result FROM card_log WHERE user_id=?').all(user.id);
    data.quizLog = db.prepare('SELECT file_id,question_index,answered_at,correct FROM quiz_log WHERE user_id=?').all(user.id);
    data.aiUsage = db.prepare('SELECT kind,model,input_tokens,output_tokens,cost_usd,created_at FROM ai_usage WHERE user_id=?').all(user.id);
    const exportFiles = db.prepare(`SELECT f.id,f.course_id,f.filename,f.mime,f.size,f.source,f.first_seen_at,f.changed_at,f.favorite,f.text,f.text_status,f.pages_json,f.path,
      a.summary,a.topics_json,a.questions_json FROM files f LEFT JOIN analyses a ON a.file_id=f.id AND a.hash=f.hash WHERE f.user_id=?`).all(user.id);
    data.files = await Promise.all(exportFiles.map(async (file) => {
      const { path, ...metadata } = file;
      return { ...metadata, pdf_base64: path ? (await readFile(String(path))).toString('base64') : null };
    }));
    send(res, data, 200, { 'content-disposition': 'attachment; filename="caderno-dados.json"' });
  },
  'POST /api/delete-account': async (req, res) => {
    const user = requireUser(req);
    const data = await jsonBody(req);
    if (data.confirm !== 'APAGAR') throw new Error('Escreve APAGAR para confirmar.');
    db.prepare('DELETE FROM users WHERE id=?').run(user.id);
    db.prepare('DELETE FROM analysis_cache WHERE NOT EXISTS (SELECT 1 FROM files WHERE files.hash=analysis_cache.hash)').run();
    await rm(join(PRODUCT_FILES_DIR, user.id), { recursive: true, force: true });
    // No Windows, a app continua com um perfil novo e vazio.
    const cookie = desktop ? sessionCookie(localSession(), false) : 'caderno_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    send(res, { ok: true }, 200, { 'set-cookie': cookie });
  },
};

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if ((origin && new URL(origin).host !== host) || req.headers['sec-fetch-site'] === 'cross-site')
        return send(res, { erro: 'Pedido de outra origem bloqueado.' }, 403);
    }
    if (req.method === 'GET' && url.pathname === '/material') {
      const user = requireUser(req);
      const file = db.prepare('SELECT path,filename,mime FROM files WHERE id=? AND user_id=?').get(url.searchParams.get('id'), user.id);
      if (!file?.path) return send(res, { erro: 'Ficheiro não encontrado.' }, 404);
      const path = insideUserFiles(user.id, file.path);
      const pdf = file.mime === 'application/pdf';
      const encodedName = encodeURIComponent(String(file.filename)).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      res.writeHead(200, { 'content-type': pdf ? 'application/pdf' : 'application/octet-stream',
        'content-disposition': `${pdf ? 'inline' : 'attachment'}; filename*=UTF-8''${encodedName}`,
        'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
      return createReadStream(path).pipe(res);
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) return await handler(req, res, url);
    const assets = { '/': 'product.html', '/app': 'product.html', '/product.css': 'product.css',
      '/product.js': 'product.js', '/manifest.webmanifest': 'manifest.webmanifest', '/sw.js': 'sw.js',
      '/icon-192.png': 'icon-192.png', '/icon-512.png': 'icon-512.png', '/fonts/newsreader.woff2': 'fonts/newsreader.woff2' };
    const asset = assets[url.pathname];
    if (!asset || req.method !== 'GET') return send(res, { erro: 'Página não encontrada.' }, 404);
    const type = asset.endsWith('.html') ? 'text/html; charset=utf-8' : asset.endsWith('.css') ? 'text/css; charset=utf-8' :
      asset.endsWith('.js') ? 'text/javascript; charset=utf-8' : asset.endsWith('.png') ? 'image/png' :
      asset.endsWith('.woff2') ? 'font/woff2' : 'application/manifest+json';
    const body = await readFile(new URL(`../web/${asset}`, import.meta.url));
    res.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (error) {
    const status = error.status || (error.kind === 'TOKEN_INVALIDO' ? 401 : 400);
    const message = error.kind === 'TOKEN_INVALIDO' ? 'A chave Moodle expirou. Volta a ligar a conta.' : error.message;
    if (!res.headersSent) send(res, { erro: message }, status);
    else res.destroy(error);
  }
});

export const ready = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    const address = server.address();
    console.log(`Caderno em http://localhost:${typeof address === 'string' ? port : address.port}`);
    resolve(address);
  });
});
setImmediate(() => {
  const pending = db.prepare(`SELECT DISTINCT c.user_id FROM courses c JOIN moodle_connections m ON m.user_id=c.user_id
    WHERE c.selected=1 AND c.source='moodle' AND c.last_synced_at IS NULL`).all();
  for (const row of pending)
    startSync(row.user_id).catch((error) => console.error('Sincronização inicial:', error.message));
});
setInterval(async () => {
  const users = db.prepare('SELECT user_id FROM moodle_connections').all();
  for (const row of users) if (!activeSyncs.has(row.user_id)) {
    try { await startSync(row.user_id); } catch (error) { console.error('Sincronização agendada:', error.message); }
  }
}, 6 * 3600 * 1000).unref();
