import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openProductDb } from './lib/product-db.mjs';
import { encryptToken, decryptToken } from './lib/product-security.mjs';
import { analyzeFile, parseAnalysis, citedSources } from './lib/product-ai.mjs';
import { generateAi, saveAiSettings, aiSettings, userAiClient, deleteAiSettings } from './lib/product-ai-provider.mjs';

const temp = await mkdtemp(join(tmpdir(), 'caderno-test-'));
const db = openProductDb(join(temp, 'schema.db'));
assert.deepEqual(db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table', 'users')?.name, 'users');
db.close();
process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
const secret = encryptToken('a'.repeat(32));
assert.equal(decryptToken(secret), 'a'.repeat(32));
assert.ok(!secret.includes('a'.repeat(10)));
assert.equal(parseAnalysis('```json\n{"summary":"Resumo suficientemente longo.","topics":["tema"],"minutes":360,"type":"slides","questions":[]}\n```').minutes, 240);
// Raciocínio em texto e quebras de linha cruas dentro de strings eram «erros JSON» na análise.
const loose = parseAnalysis('<think>{rascunho}</think>{"summary":"Primeira linha\nsegunda linha.","topics":[],"minutes":20,"type":"aula","questions":[]}');
assert.equal(loose.summary, 'Primeira linha\nsegunda linha.');
assert.equal(loose.type, 'outro');
assert.deepEqual(loose.keyPoints, []);
const excerpts = [{ fileId: 'a', filename: 'a.pdf', page: 4 }, { fileId: 'b', filename: 'b.pdf', page: 2 }];
assert.deepEqual(citedSources('Ideia [2]. Outra [1, 9].', excerpts).map((source) => `${source.ref}:${source.page}`), ['1:4', '2:2']);

const moodleToken = 'testMoodleToken12345678901234567890';
const moodleRequests = [];
function makePdf() {
  const content = 'BT /F1 14 Tf 72 720 Td (Analise de Sistemas contem requisitos, casos de uso e modelos de dados.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
const moodlePdf = makePdf();
const moodle = createServer(async (req, res) => {
  if (req.url?.startsWith('/webservice/pluginfile.php/')) {
    res.setHeader('content-type', 'application/pdf');
    res.end(new URL(req.url, moodleUrl).searchParams.get('token') === moodleToken ? moodlePdf : Buffer.from('denied'));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const params = new URLSearchParams(Buffer.concat(chunks).toString());
  moodleRequests.push({ path: req.url, params: Object.fromEntries(params) });
  res.setHeader('content-type', 'application/json');
  if (req.url === '/login/token.php') {
    res.end(JSON.stringify(params.get('username') === 'aluna' && params.get('password') === 'segredo-moodle'
      && params.get('service') === 'personal_service'
      ? { token: moodleToken } : { error: 'Invalid login', errorcode: 'invalidlogin' }));
  } else if (params.get('wstoken') !== moodleToken) {
    res.end(JSON.stringify({ exception: 'moodle_exception', errorcode: 'invalidtoken' }));
  } else if (params.get('wsfunction') === 'core_webservice_get_site_info') {
    res.end(JSON.stringify({ userid: 42, sitename: 'Moodle de teste', functions: [
      'core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents',
    ].map((name) => ({ name })) }));
  } else if (params.get('wsfunction') === 'core_enrol_get_users_courses') {
    res.end(JSON.stringify([{ id: 7, fullname: 'Análise de Sistemas', shortname: 'AS' }]));
  } else if (params.get('wsfunction') === 'core_course_get_contents') {
    res.end(JSON.stringify([{ id: 1, modules: [{ id: 80, modname: 'resource', contents: [{ type: 'file',
      filename: 'aula-moodle.pdf', fileurl: `${moodleUrl}/webservice/pluginfile.php/80/aula-moodle.pdf`, timemodified: 123 }] }] }]));
  } else {
    res.end(JSON.stringify({ exception: 'moodle_exception', errorcode: 'unknown' }));
  }
});
await new Promise((resolve) => moodle.listen(0, '127.0.0.1', resolve));
const moodleUrl = `http://127.0.0.1:${moodle.address().port}`;

const child = spawn(process.execPath, ['scripts/product.mjs'], {
  cwd: process.cwd(), env: { ...process.env, PORT: '0', PRODUCT_DB_PATH: join(temp, 'app.db'),
    PRODUCT_FILES_DIR: join(temp, 'files'), MOODLE_URL: moodleUrl, MOODLE_SERVICE: 'personal_service' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverError = '';
child.stderr.on('data', (chunk) => { serverError += chunk.toString(); });

try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = /localhost:(\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    });
    child.on('exit', (code) => reject(new Error(`Servidor saiu com código ${code}: ${serverError}`)));
    setTimeout(() => reject(new Error('Servidor não iniciou')), 5000).unref();
  });
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, { cookie, method = 'GET', json, bytes, headers = {} } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...headers, ...(cookie ? { cookie } : {}),
      ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : bytes });
    return response;
  };
  const register = async (email) => {
    const response = await request('/api/register', { method: 'POST', json: { email, password: 'uma-password-longa-123' } });
    assert.equal(response.status, 201);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const alice = await register('alice@example.test');
  const bob = await register('bob@example.test');
  const aiSave = await request('/api/ai-settings', { cookie: alice, method: 'POST', json: {
    provider: 'deepseek', apiKey: 'test-user-key-123', summaryModel: 'deepseek-chat', explainModel: 'deepseek-chat' } });
  assert.equal(aiSave.status, 200);
  assert.equal((await aiSave.json()).settings.hasKey, true);
  const aiState = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(aiState.ai.settings.provider, 'deepseek');
  assert.equal(aiState.onboarded, false, 'uma conta nova vê o guia de início');
  assert.equal((await request('/api/onboarding', { cookie: alice, method: 'POST', json: { done: true } })).status, 200);
  assert.equal((await (await request('/api/state', { cookie: alice })).json()).onboarded, true);
  assert.equal((await request('/api/theme', { cookie: alice, method: 'POST', json: { theme: 'light' } })).status, 200);
  assert.equal((await (await request('/api/state', { cookie: alice })).json()).preference.theme, 'light');
  assert.equal((await request('/api/theme', { cookie: alice, method: 'POST', json: { theme: 'roxo' } })).status, 400);
  assert.ok(!JSON.stringify(aiState).includes('test-user-key-123'));
  assert.equal((await (await request('/api/state', { cookie: bob })).json()).ai.settings, null);
  const savedAiDb = openProductDb(join(temp, 'app.db'));
  const encryptedAi = savedAiDb.prepare('SELECT key_enc FROM ai_credentials').get().key_enc;
  assert.ok(!encryptedAi.includes('test-user-key-123'));
  assert.equal(decryptToken(encryptedAi), 'test-user-key-123');
  savedAiDb.close();
  assert.equal((await request('/api/ai-settings', { cookie: alice, method: 'POST', json: {
    provider: 'compatible', baseUrl: 'https://127.0.0.1/v1', summaryModel: 'x', explainModel: 'x' } })).status, 400);
  assert.equal((await request('/api/ai-settings', { cookie: alice, method: 'POST', json: {
    provider: 'openai', summaryModel: 'x', explainModel: 'x' } })).status, 400);
  assert.equal((await request('/api/ai-settings', { cookie: alice, method: 'DELETE' })).status, 200);
  const invalidConnect = await request('/api/connect', { cookie: alice, method: 'POST',
    json: { username: 'aluna', password: 'errada' } });
  assert.equal(invalidConnect.status, 400);
  assert.match((await invalidConnect.json()).erro, /CREDENCIAIS_INVALIDAS/);
  const connected = await request('/api/connect', { cookie: alice, method: 'POST',
    json: { username: 'aluna', password: 'segredo-moodle' } });
  assert.equal(connected.status, 200);
  assert.equal((await connected.json()).count, 1);
  assert.equal(moodleRequests[1].params.service, 'personal_service');
  assert.equal(moodleRequests[1].params.password, 'segredo-moodle');
  const connectionDb = openProductDb(join(temp, 'app.db'));
  const storedConnection = connectionDb.prepare('SELECT token_enc FROM moodle_connections').get();
  assert.equal(decryptToken(storedConnection.token_enc), moodleToken);
  assert.ok(!storedConnection.token_enc.includes('segredo-moodle'));
  assert.equal(connectionDb.prepare('SELECT count(*) AS n FROM courses WHERE source=?').get('moodle').n, 1);
  connectionDb.close();
  const make = await request('/api/manual-course', { cookie: alice, method: 'POST', json: { name: 'Matemática' } });
  assert.equal(make.status, 201);
  const courseId = (await make.json()).id;
  const upload = await request(`/api/upload?course=${courseId}`, { cookie: alice, method: 'POST',
    headers: { 'content-type': 'application/pdf', 'x-filename': 'aula.pdf' }, bytes: Buffer.from('%PDF-1.4\n%%EOF') });
  assert.equal(upload.status, 201);
  const fileId = (await upload.json()).id;
  const officeBytes = Buffer.from('PK\x03\x04documento de teste');
  const officeUpload = await request(`/api/upload?course=${courseId}`, { cookie: alice, method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-filename': 'slides.docx' }, bytes: officeBytes });
  assert.equal(officeUpload.status, 201);
  const officeId = (await officeUpload.json()).id;
  const officeDetail = await (await request(`/api/file?id=${officeId}`, { cookie: alice })).json();
  assert.equal(officeDetail.text_status, 'sem-extracao');
  const officeDownload = await request(`/material?id=${officeId}`, { cookie: alice });
  assert.equal(officeDownload.status, 200);
  assert.match(officeDownload.headers.get('content-disposition'), /^attachment;/);
  assert.deepEqual(Buffer.from(await officeDownload.arrayBuffer()), officeBytes);
  assert.equal((await request(`/material?id=${officeId}`, { cookie: bob })).status, 404);
  assert.equal((await request(`/api/upload?course=${courseId}`, { cookie: alice, method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-filename': 'programa.exe' }, bytes: officeBytes })).status, 400);
  assert.equal((await request('/api/favorite', { cookie: bob, method: 'POST', json: { fileId, favorite: true } })).status, 404);
  assert.equal((await request('/api/favorite', { cookie: alice, method: 'POST', json: { fileId, favorite: true } })).status, 200);
  assert.equal((await request(`/material?id=${fileId}`, { cookie: alice })).status, 200);
  assert.equal((await request(`/material?id=${fileId}`, { cookie: bob })).status, 404);
  assert.equal((await request(`/api/upload?course=${courseId}`, { cookie: bob, method: 'POST',
    headers: { 'content-type': 'application/pdf', 'x-filename': 'x.pdf' }, bytes: Buffer.from('%PDF-1.4\n%%EOF') })).status, 404);
  const bobState = await (await request('/api/state', { cookie: bob })).json();
  assert.equal(bobState.files.length, 0);
  assert.equal((await request('/api/connect', { cookie: bob, method: 'POST',
    json: { username: 'aluna', password: 'segredo-moodle' } })).status, 200);
  const bobCourse = (await (await request('/api/state', { cookie: bob })).json()).courses.find((course) => course.source === 'moodle');
  assert.equal((await request('/api/courses', { cookie: bob, method: 'POST',
    json: { selected: [bobCourse.id] } })).status, 200);
  let imported;
  for (let attempt = 0; attempt < 30; attempt++) {
    imported = await (await request('/api/state', { cookie: bob })).json();
    if (imported.files.length && imported.sync?.status === 'ok') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(imported.files.length, 1, 'selecionar uma cadeira importa os PDFs automaticamente');
  assert.equal(imported.files[0].text_status, 'ok');
  assert.equal(imported.files[0].page_count, 1);
  assert.ok(imported.files[0].text_chars > 20);
  const importedDetail = await (await request(`/api/file?id=${imported.files[0].id}`, { cookie: bob })).json();
  assert.match(importedDetail.text_preview, /Analise de Sistemas/);
  assert.equal((await request('/api/practice', { cookie: bob })).status, 200);
  const aliceState = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(aliceState.files.length, 2);
  assert.equal(aliceState.files.find((file) => file.id === fileId).favorite, 1);
  assert.ok(aliceState.plan.blocks.some((block) => block.id === fileId), 'um PDF sem resumo ainda entra no plano');
  assert.equal(aliceState.plan.forecast[0].minutes,
    aliceState.plan.blocks.reduce((sum, block) => sum + block.minutes, 0), 'a prévia de hoje coincide com o plano');
  assert.equal((await request(`/api/file?id=${fileId}`, { cookie: bob })).status, 404);
  assert.equal((await request('/api/open-file', { cookie: alice, method: 'POST', json: { fileId } })).status, 404, 'abrir no Windows só existe no desktop');
  assert.equal((await request('/api/ask', { cookie: alice, method: 'POST', json: { courseId, question: 'Explica o tópico' } })).status, 400);
  const weekdays = [0, 30, 45, 45, 45, 30, 0];
  assert.equal((await request('/api/preferences', { cookie: alice, method: 'POST', json: { minutes: 45, weekdays } })).status, 200);
  assert.equal((await request('/api/exam', { cookie: alice, method: 'POST', json: { courseId, date: '2027-06-15' } })).status, 200);
  const afterExam = await (await request('/api/state', { cookie: alice })).json();
  assert.ok(afterExam.deadlines.some((deadline) => deadline.kind === 'exame'));
  assert.equal((await request('/api/study', { cookie: bob, method: 'POST', json: { fileId, minutes: 30, result: 'bem' } })).status, 404);
  assert.equal((await request('/api/study', { cookie: alice, method: 'POST', json: { fileId, minutes: 30, result: 'bem' } })).status, 200);
  const afterStudy = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(afterStudy.plan.studiedToday, 30);
  assert.equal((await request('/api/seen', { cookie: alice, method: 'POST', json: {} })).status, 200);
  assert.ok((await (await request('/api/state', { cookie: alice })).json()).changesSince);
  const appDb = openProductDb(join(temp, 'app.db'));
  const stored = appDb.prepare('SELECT hash FROM files WHERE id=?').get(fileId);
  appDb.prepare('INSERT INTO analyses(file_id,hash,model,summary,topics_json,questions_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(fileId, stored.hash, 'test', 'Resumo de teste', JSON.stringify({ topicos: ['equações'], minutos_estudo: 30, tipo: 'apontamentos' }),
      JSON.stringify([{ pergunta: 'Quanto é 1+1?', resposta: '2', explicacao: 'Somam-se as unidades.' }]), 0);
  appDb.close();
  const deck = await (await request('/api/cards', { cookie: alice })).json();
  assert.equal(deck.cards.length, 1);
  const practice = await (await request('/api/practice', { cookie: alice })).json();
  assert.equal(practice.total, 1);
  assert.equal(practice.questions[0].pergunta, 'Quanto é 1+1?');
  assert.equal((await (await request(`/api/practice?course=${courseId}`, { cookie: alice })).json()).total, 1);
  assert.equal((await request(`/api/practice?course=${courseId}`, { cookie: bob })).status, 404);
  assert.equal((await request('/api/quiz', { cookie: bob, method: 'POST', json: { fileId, index: 0, correct: true } })).status, 400);
  assert.equal((await request('/api/quiz', { cookie: alice, method: 'POST', json: { fileId, index: 0, correct: true } })).status, 200);
  assert.equal((await request('/api/card', { cookie: alice, method: 'POST', json: { fileId, index: 0, result: 'bem' } })).status, 200);
  const progress = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(progress.progress.quizCorrect, 1);
  assert.ok(progress.progress.topics.includes('equações'));
  const cacheDb = openProductDb(join(temp, 'app.db'));
  const userId = cacheDb.prepare('SELECT user_id FROM files WHERE id=?').get(fileId).user_id;
  const bobId = cacheDb.prepare('SELECT id FROM users WHERE email=?').get('bob@example.test').id;
  cacheDb.prepare('UPDATE preferences SET ai_consent_at=? WHERE user_id=?').run(Math.floor(Date.now() / 1000), userId);
  cacheDb.prepare('UPDATE preferences SET ai_consent_at=? WHERE user_id=?').run(Math.floor(Date.now() / 1000), bobId);
  cacheDb.prepare('DELETE FROM analyses WHERE file_id=?').run(fileId);
  cacheDb.prepare('UPDATE files SET text_status=?,text=?,pages_json=? WHERE id=?')
    .run('ok', '[Página 1] Equações e incógnitas.', JSON.stringify(['Equações e incógnitas.']), fileId);
  await assert.rejects(analyzeFile(cacheDb, userId, fileId), /chave de IA/i, 'sem chave pessoal não há IA');
  await assert.rejects(analyzeFile(cacheDb, bobId, fileId), /não encontrado/i);
  const saved = saveAiSettings(cacheDb, userId, { provider: 'openai', apiKey: 'personal-test-key-123',
    summaryModel: 'test-summary', explainModel: 'test-explain' });
  assert.equal(saved.provider, 'openai');
  assert.ok(!JSON.stringify(aiSettings(cacheDb, userId)).includes('personal-test-key-123'));
  assert.equal(userAiClient(cacheDb, userId, 'summary').apiKey, 'personal-test-key-123');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.authorization, 'Bearer personal-test-key-123');
      assert.equal(JSON.parse(options.body).store, false);
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
        usage: { input_tokens: 4, output_tokens: 3 } }), { status: 200 });
    };
    assert.deepEqual(await generateAi(userAiClient(cacheDb, userId, 'summary'), 'Sistema', 'Texto', 100),
      { text: '{"ok":true}', usage: { input_tokens: 4, output_tokens: 3 }, truncated: false });
    // Limite por minuto (plano gratuito da Groq): espera o retry-after e repete o pedido.
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1
      ? new Response(JSON.stringify({ error: { message: 'Rate limit' } }), { status: 429, headers: { 'retry-after': '0' } })
      : new Response(JSON.stringify({ output_text: 'depois da espera', usage: {} }), { status: 200 });
    assert.equal((await generateAi(userAiClient(cacheDb, userId, 'summary'), 'Sistema', 'Texto', 100)).text, 'depois da espera');
    assert.equal(calls, 2);
    process.env.AI_ALLOWED_BASE_URLS = 'https://models.example.test/v1';
    saveAiSettings(cacheDb, userId, { provider: 'compatible', baseUrl: 'https://models.example.test/v1',
      apiKey: 'other-test-key-123', summaryModel: 'model-a', explainModel: 'model-b' });
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://models.example.test/v1/chat/completions');
      assert.equal(options.headers.authorization, 'Bearer other-test-key-123');
      assert.equal(JSON.parse(options.body).messages[0].content, 'Sistema');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 5 } }), { status: 200 });
    };
    assert.deepEqual(await generateAi(userAiClient(cacheDb, userId, 'question'), 'Sistema', 'Texto', 100),
      { text: '{"ok":true}', usage: { input_tokens: 7, output_tokens: 5 }, truncated: false });
  } finally { globalThis.fetch = originalFetch; }
  delete process.env.AI_ALLOWED_BASE_URLS;
  deleteAiSettings(cacheDb, userId);
  assert.equal(aiSettings(cacheDb, userId), null);
  cacheDb.close();
  for (const name of ['Segunda', 'Terceira']) assert.equal((await request('/api/manual-course', { cookie: alice, method: 'POST', json: { name } })).status, 201, 'sem limite de cadeiras');
  const secondCourseResponse = await request('/api/manual-course', { cookie: alice, method: 'POST', json: { name: 'Segunda' } });
  assert.equal(secondCourseResponse.status, 201);
  const secondCourseId = (await secondCourseResponse.json()).id;
  const secondUpload = await request(`/api/upload?course=${secondCourseId}`, { cookie: alice, method: 'POST',
    bytes: moodlePdf, headers: { 'content-type': 'application/pdf', 'x-filename': 'segunda.pdf' } });
  assert.equal(secondUpload.status, 201);
  const secondFileId = (await secondUpload.json()).id;
  const secondDb = openProductDb(join(temp, 'app.db'));
  const secondHash = secondDb.prepare('SELECT hash FROM files WHERE id=?').get(secondFileId).hash;
  secondDb.prepare('INSERT INTO analyses(file_id,hash,model,summary,topics_json,questions_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(secondFileId, secondHash, 'test', 'Resumo da segunda cadeira', '{}',
      JSON.stringify([{ pergunta: 'Pergunta da segunda?', resposta: 'Resposta da segunda.' }]), 0);
  secondDb.close();
  const firstCards = await (await request(`/api/cards?course=${courseId}`, { cookie: alice })).json();
  const secondCards = await (await request(`/api/cards?course=${secondCourseId}`, { cookie: alice })).json();
  assert.ok(firstCards.cards.every((card) => card.courseId === courseId));
  assert.equal(secondCards.cards.length, 1);
  assert.equal(secondCards.cards[0].courseId, secondCourseId);
  const mixedCards = await (await request(`/api/cards?course=${courseId}&course=${secondCourseId}`, { cookie: alice })).json();
  assert.equal(mixedCards.cards.length, firstCards.cards.length + secondCards.cards.length);
  assert.equal((await request(`/api/cards?course=${secondCourseId}`, { cookie: bob })).status, 404);
  assert.equal((await request('/api/delete-account', { cookie: alice, method: 'POST', json: { confirm: 'apagar' } })).status, 400);
  assert.equal((await request('/api/delete-account', { cookie: alice, method: 'POST', json: { confirm: 'APAGAR' } })).status, 200);
  assert.equal((await request('/api/state', { cookie: alice })).status, 401);
  const ossChild = spawn(process.execPath, ['--input-type=module', '-e',
    "const app = await import('./scripts/product.mjs'); await app.ready; console.log('SESSAO ' + app.localSession() + ' ' + app.localSession());"], { cwd: process.cwd(),
    env: { ...process.env, PORT: '0',
      NODE_ENV: 'desktop', DESKTOP_CONFIG_PATH: join(temp, 'desktop-config.json'), MOODLE_URL: '',
      PRODUCT_DB_PATH: join(temp, 'oss.db'), PRODUCT_FILES_DIR: join(temp, 'oss-files') },
    stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let ossOutput = '';
    const [ossPort, oldToken, ossToken] = await new Promise((resolve, reject) => {
      ossChild.stdout.on('data', (chunk) => {
        ossOutput += chunk.toString();
        const port = /localhost:(\d+)/.exec(ossOutput);
        const tokens = /SESSAO (\S+) (\S+)/.exec(ossOutput);
        if (port && tokens) resolve([Number(port[1]), tokens[1], tokens[2]]);
      });
      ossChild.on('exit', (code) => reject(new Error(`Servidor open source saiu com código ${code}`)));
      setTimeout(() => reject(new Error('Servidor open source não iniciou')), 5000).unref();
    });
    const ossBase = `http://127.0.0.1:${ossPort}`;
    const ossRegister = await fetch(ossBase + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'oss@example.test', password: 'uma-password-longa-123' }) });
    assert.equal(ossRegister.status, 404, 'o desktop não cria contas');
    assert.equal((await fetch(ossBase + '/api/state', { headers: { cookie: `caderno_session=${oldToken}` } })).status, 401, 'cada arranque invalida a sessão anterior');
    const ossCookie = `caderno_session=${ossToken}`;
    const saveMoodle = async (url) => fetch(ossBase + '/api/desktop/moodle-url', { method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({ url }) });
    assert.equal((await saveMoodle('http://moodle.example.test')).status, 400);
    assert.equal((await saveMoodle('https://moodle.example.test/')).status, 200);
    assert.equal((await (await fetch(ossBase + '/api/state', { headers: { cookie: ossCookie } })).json()).moodleUrl,
      'https://moodle.example.test');
    const compatible = await fetch(ossBase + '/api/ai-settings', { method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({
        provider: 'compatible', baseUrl: 'https://ai.example.test/v1', apiKey: 'desktop-only-key-123',
        summaryModel: 'study-small', explainModel: 'study-large' }) });
    assert.equal(compatible.status, 200);
    for (const name of ['Primeira', 'Segunda']) {
      const response = await fetch(ossBase + '/api/manual-course', { method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({ name }) });
      assert.equal(response.status, 201);
    }
    const ossState = await (await fetch(ossBase + '/api/state', { headers: { cookie: ossCookie } })).json();
    assert.equal(ossState.courses.length, 2);
    assert.equal(ossState.desktop, true);
    assert.equal(ossState.user.email, null);
    assert.ok(ossState.materialsDir.endsWith('oss-files'));
    const wiped = await fetch(ossBase + '/api/delete-account', { method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({ confirm: 'APAGAR' }) });
    assert.equal(wiped.status, 200);
    const freshCookie = wiped.headers.get('set-cookie').split(';')[0];
    const fresh = await (await fetch(ossBase + '/api/state', { headers: { cookie: freshCookie } })).json();
    assert.equal(fresh.courses.length, 0, 'apagar recomeça com um perfil vazio');
    assert.equal(fresh.onboarded, false);
  } finally {
    if (ossChild.exitCode === null) { ossChild.kill(); await once(ossChild, 'exit').catch(() => {}); }
  }
  console.log('ok — produto: cifra, isolamento de contas, perfil local, guia e eliminação');
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit').catch(() => {});
  }
  await new Promise((resolve) => moodle.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
