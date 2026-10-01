#!/usr/bin/env node
// Dados fictícios para capturar o ecrã real da aplicação, nunca a base pessoal.
import { openProductDb } from '../lib/product-db.mjs';
import { id, passwordHash, newSession } from '../lib/product-security.mjs';
import { storeFile } from '../lib/product-sync.mjs';

if (!process.env.PRODUCT_DB_PATH?.startsWith('/tmp/caderno-shot.') ||
    !process.env.PRODUCT_FILES_DIR?.startsWith('/tmp/caderno-shot.'))
  throw new Error('Este script só pode usar uma pasta temporária caderno-shot.');
const db = openProductDb();
const now = Math.floor(Date.now() / 1000);
const userId = id();
const courseId = id();
db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)')
  .run(userId, 'aluna.demo@example.test', passwordHash('password-ficticia-123'), now);
db.prepare('INSERT INTO preferences(user_id,minutes_per_day,minutes_by_weekday_json) VALUES(?,?,?)')
  .run(userId, 60, JSON.stringify([45, 60, 60, 45, 60, 45, 30]));
db.prepare("INSERT INTO courses(id,user_id,name,shortname,selected,source,exam_at) VALUES(?,?,?,?,1,'manual',?)")
  .run(courseId, userId, 'Análise de Sistemas', 'AS', now + 24 * 86400);
db.prepare("INSERT INTO deadlines(id,user_id,course_id,kind,title,due_at,source) VALUES(?,?,?,'entrega',?,?,'manual')")
  .run(id(), userId, courseId, 'Entrega do projeto', now + 5 * 86400);
const examples = [
  { name: 'Introdução ao modelo relacional.pdf', summary: 'Aprende a organizar dados em tabelas, definir chaves e reconhecer relações entre entidades.',
    topics: ['Modelo relacional', 'Chaves primárias', 'Relações'], type: 'slides', minutes: 40 },
  { name: 'Ficha 04 — normalização.pdf', summary: 'Pratica dependências funcionais e a passagem de tabelas à terceira forma normal.',
    topics: ['Dependências funcionais', '3.ª forma normal'], type: 'ficha-exercicios', minutes: 45 },
  { name: 'Casos de uso.pdf', summary: 'Identifica atores, objetivos e cenários para descrever requisitos de um sistema.',
    topics: ['Atores', 'Casos de uso'], type: 'apontamentos', minutes: 30 },
];
for (const [index, example] of examples.entries()) {
  const file = await storeFile(db, { userId, courseId, filename: example.name, source: 'upload',
    bytes: Buffer.from('%PDF-1.4\n% Dados de demonstração\n' + ' '.repeat(5000) + '\n%%EOF') });
  const hash = db.prepare('SELECT hash FROM files WHERE id=?').get(file.id).hash;
  db.prepare('UPDATE files SET text_status=?,changed_at=?,first_seen_at=? WHERE id=?')
    .run('ok', now - index * 7200, now - index * 7200, file.id);
  db.prepare('INSERT INTO analyses(file_id,hash,model,summary,topics_json,questions_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(file.id, hash, 'demo', example.summary, JSON.stringify({ topicos: example.topics,
      minutos_estudo: example.minutes, tipo: example.type }), JSON.stringify([{ pergunta: 'Como aplicarias este conceito?', resposta: 'Começa por identificar os elementos do problema.' }]), now);
  if (index === 0) db.prepare('INSERT INTO study_log(id,user_id,file_id,studied_at,minutes,result) VALUES(?,?,?,?,?,?)')
    .run(id(), userId, file.id, now - 86400, 15, 'assim');
}
const session = newSession(db, userId);
console.log(session.token);
db.close();
