import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openProductDb } from './lib/product-db.mjs';
import { encryptToken, decryptToken, emailCode, emailCodeMatches } from './lib/product-security.mjs';
import { analyzeFile, parseAnalysis, remaining, priceRates } from './lib/product-ai.mjs';
import { generateAi, saveAiSettings, aiSettings, userAiClient, deleteAiSettings } from './lib/product-ai-provider.mjs';
import { handleWebhook, checkoutSession } from './lib/product-billing.mjs';
import Stripe from 'stripe';

process.env.ENABLE_HOSTED_BILLING = 'true';
const temp = await mkdtemp(join(tmpdir(), 'caderno-test-'));
const db = openProductDb(join(temp, 'schema.db'));
assert.deepEqual(db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table', 'users')?.name, 'users');
db.close();
process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
const secret = encryptToken('a'.repeat(32));
assert.equal(decryptToken(secret), 'a'.repeat(32));
assert.ok(!secret.includes('a'.repeat(10)));
const verification = emailCode();
assert.ok(emailCodeMatches(verification.code, verification.digest));
assert.ok(!emailCodeMatches('000000', verification.digest) || verification.code === '000000');
assert.equal(parseAnalysis('```json\n{"summary":"Resumo suficientemente longo.","topics":["tema"],"minutes":360,"type":"slides","questions":[]}\n```').minutes, 240);

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
  cwd: process.cwd(), env: { ...process.env, ANTHROPIC_API_KEY: '', PORT: '0', PRODUCT_DB_PATH: join(temp, 'app.db'),
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
  assert.equal(aiState.ai.remaining.summaries, null);
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
  assert.equal(aliceState.files.length, 1);
  assert.equal(aliceState.files[0].favorite, 1);
  assert.equal(aliceState.plan.blocks.length, 1, 'um PDF sem resumo ainda entra no plano');
  assert.equal(aliceState.plan.forecast[0].minutes,
    aliceState.plan.blocks.reduce((sum, block) => sum + block.minutes, 0), 'a prévia de hoje coincide com o plano');
  assert.equal((await request(`/api/file?id=${fileId}`, { cookie: bob })).status, 404);
  assert.equal((await request('/api/admin', { cookie: alice })).status, 403);
  assert.equal((await request('/api/digest', { cookie: alice, method: 'POST', json: { channel: 'email', hour: 8 } })).status, 400);
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
  cacheDb.prepare('INSERT INTO analysis_cache(hash,prompt_version,model,summary,topics_json,questions_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(stored.hash, 1, 'anthropic/claude-haiku-4-5', 'Resumo reutilizado', JSON.stringify({ topicos: ['equações'], minutos_estudo: 30 }),
      JSON.stringify([{ pergunta: '1+1?', resposta: '2' }]), 0);
  process.env.ANTHROPIC_API_KEY = 'test-server-key';
  assert.deepEqual(await analyzeFile(cacheDb, userId, fileId), { cached: true });
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(analyzeFile(cacheDb, bobId, fileId), /não encontrado/i);
  assert.equal(cacheDb.prepare('SELECT summary FROM analyses WHERE file_id=?').get(fileId).summary, 'Resumo reutilizado');
  assert.deepEqual(priceRates('question'), { input: 2, output: 10 });
  for (let index = 0; index < 5; index++) cacheDb.prepare('INSERT INTO ai_usage(id,user_id,kind,model,input_tokens,output_tokens,cost_usd,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(`test-${index}`, userId, 'summary', 'test', 1, 1, 0.01, Math.floor(Date.now() / 1000));
  assert.equal(remaining(cacheDb, userId, 'free').summaries, 0);
  const saved = saveAiSettings(cacheDb, userId, { provider: 'openai', apiKey: 'personal-test-key-123',
    summaryModel: 'test-summary', explainModel: 'test-explain' });
  assert.equal(saved.provider, 'openai');
  assert.ok(!JSON.stringify(aiSettings(cacheDb, userId)).includes('personal-test-key-123'));
  assert.equal(userAiClient(cacheDb, userId, 'summary').apiKey, 'personal-test-key-123');
  assert.equal(remaining(cacheDb, userId, 'free').summaries, null);
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
      { text: '{"ok":true}', usage: { input_tokens: 4, output_tokens: 3 } });
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
      { text: '{"ok":true}', usage: { input_tokens: 7, output_tokens: 5 } });
  } finally { globalThis.fetch = originalFetch; }
  delete process.env.AI_ALLOWED_BASE_URLS;
  deleteAiSettings(cacheDb, userId);
  assert.equal(aiSettings(cacheDb, userId), null);
  cacheDb.close();
  process.env.STRIPE_SECRET_KEY = 'sk_test_local_only';
  process.env.STRIPE_PRICE_ID = 'price_student_test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_only';
  process.env.PUBLIC_BASE_URL = 'http://localhost:4321';
  const billingDb = openProductDb(join(temp, 'app.db'));
  billingDb.prepare("INSERT INTO courses(id,user_id,name,shortname,selected,source) VALUES(?,?,?,?,1,'manual')")
    .run('second-course', userId, 'Segunda cadeira', 'SEG');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const signedEvent = async (eventId, status, priceId = process.env.STRIPE_PRICE_ID) => {
    const payload = JSON.stringify({ id: eventId, object: 'event', type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000), data: { object: { id: 'sub_test', customer: 'cus_test', status,
        metadata: { caderno_user_id: userId }, items: { data: [{ price: { id: priceId } }] } } } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    return handleWebhook(billingDb, Buffer.from(payload), signature);
  };
  assert.deepEqual(await signedEvent('evt_active', 'active'), { duplicate: false });
  assert.equal(billingDb.prepare('SELECT plan FROM users WHERE id=?').get(userId).plan, 'student');
  assert.deepEqual(await signedEvent('evt_active', 'active'), { duplicate: true });
  await signedEvent('evt_canceled', 'canceled');
  assert.equal(billingDb.prepare('SELECT plan FROM users WHERE id=?').get(userId).plan, 'free');
  assert.equal(billingDb.prepare('SELECT count(*) AS n FROM courses WHERE user_id=? AND selected=1').get(userId).n, 1);
  billingDb.close();
  assert.equal((await request('/api/manual-course', { cookie: alice, method: 'POST', json: { name: 'Segunda' } })).status, 400);
  const giftDb = openProductDb(join(temp, 'app.db'));
  giftDb.prepare('UPDATE users SET complimentary_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), userId);
  giftDb.close();
  const pendingGift = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(pendingGift.user.plan, 'free', 'oferta não ativa um email por confirmar');
  assert.equal(pendingGift.user.complimentaryPending, true);
  const overrideDb = openProductDb(join(temp, 'app.db'));
  overrideDb.prepare('UPDATE users SET complimentary_override_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), userId);
  overrideDb.close();
  const operatorGift = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(operatorGift.user.plan, 'student', 'oferta pessoal ativa sem confirmar o email');
  assert.equal(operatorGift.user.complimentary, true);
  assert.equal(operatorGift.user.complimentaryPending, false);
  assert.equal(operatorGift.user.email_verified_at, null);
  const resetOverrideDb = openProductDb(join(temp, 'app.db'));
  resetOverrideDb.prepare('UPDATE users SET complimentary_override_at=NULL WHERE id=?').run(userId);
  resetOverrideDb.close();
  const verifiedDb = openProductDb(join(temp, 'app.db'));
  verifiedDb.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), userId);
  verifiedDb.close();
  const activeGift = await (await request('/api/state', { cookie: alice })).json();
  assert.equal(activeGift.user.plan, 'student');
  assert.equal(activeGift.user.complimentary, true);
  assert.equal(activeGift.user.stripeSubscription, false);
  assert.ok(activeGift.ai.remaining.summaries > pendingGift.ai.remaining.summaries);
  const giftCheckoutDb = openProductDb(join(temp, 'app.db'));
  await assert.rejects(checkoutSession(giftCheckoutDb, { id: userId, email: 'alice@example.test', email_verified_at: 1 }), /Já tens acesso/);
  giftCheckoutDb.close();
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
  assert.equal((await request('/api/delete-account', { cookie: alice, method: 'POST', json: { password: 'uma-password-longa-123' } })).status, 200);
  assert.equal((await request('/api/state', { cookie: alice })).status, 401);
  const ossChild = spawn(process.execPath, ['scripts/product.mjs'], { cwd: process.cwd(),
    env: { ...process.env, ENABLE_HOSTED_BILLING: 'false', ANTHROPIC_API_KEY: '', PORT: '0',
      NODE_ENV: 'desktop', DESKTOP_CONFIG_PATH: join(temp, 'desktop-config.json'), MOODLE_URL: '',
      PRODUCT_DB_PATH: join(temp, 'oss.db'), PRODUCT_FILES_DIR: join(temp, 'oss-files') },
    stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const ossPort = await new Promise((resolve, reject) => {
      ossChild.stdout.on('data', (chunk) => {
        const match = /localhost:(\d+)/.exec(chunk.toString());
        if (match) resolve(Number(match[1]));
      });
      ossChild.on('exit', (code) => reject(new Error(`Servidor open source saiu com código ${code}`)));
      setTimeout(() => reject(new Error('Servidor open source não iniciou')), 5000).unref();
    });
    const ossBase = `http://127.0.0.1:${ossPort}`;
    const ossRegister = await fetch(ossBase + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'oss@example.test', password: 'uma-password-longa-123' }) });
    assert.equal(ossRegister.status, 201);
    const ossCookie = ossRegister.headers.get('set-cookie').split(';')[0];
    const saveMoodle = async (url) => fetch(ossBase + '/api/desktop/moodle-url', { method: 'POST',
      headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({ url }) });
    assert.equal((await saveMoodle('http://moodle.example.test')).status, 400);
    assert.equal((await saveMoodle('https://moodle.example.test/')).status, 200);
    assert.equal((await (await fetch(ossBase + '/api/state', { headers: { cookie: ossCookie } })).json()).moodleUrl,
      'https://moodle.example.test');
    for (const name of ['Primeira', 'Segunda']) {
      const response = await fetch(ossBase + '/api/manual-course', { method: 'POST',
        headers: { 'content-type': 'application/json', cookie: ossCookie }, body: JSON.stringify({ name }) });
      assert.equal(response.status, 201);
    }
    const ossState = await (await fetch(ossBase + '/api/state', { headers: { cookie: ossCookie } })).json();
    assert.equal(ossState.courses.length, 2);
    assert.equal(ossState.hostedBilling, false);
    assert.equal(ossState.desktop, true);
  } finally {
    if (ossChild.exitCode === null) { ossChild.kill(); await once(ossChild, 'exit').catch(() => {}); }
  }
  console.log('ok — produto: cifra, isolamento de contas, limites e eliminação');
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, 'exit').catch(() => {});
  }
  await new Promise((resolve) => moodle.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
