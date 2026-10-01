import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PRODUCT_FILES_DIR } from './product-db.mjs';
import { decryptToken, id } from './product-security.mjs';
import { callWs, getBytes, baseUrl } from './moodle.mjs';
import { extrairTexto } from './extract.mjs';
import { ehListaDePessoas, ehPauta } from './categorize.mjs';

const now = () => Math.floor(Date.now() / 1000);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safePart = (value) => {
  let part = String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').trim().slice(0, 80);
  if (!part || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part)) part = `material-${part || 'sem-nome'}`;
  return part;
};
export const REQUIRED_FUNCTIONS = ['core_webservice_get_site_info', 'core_enrol_get_users_courses', 'core_course_get_contents'];

export function assertFunctions(site, names = REQUIRED_FUNCTIONS) {
  const available = new Set((site.functions || []).map((f) => f.name));
  const missing = names.filter((name) => !available.has(name));
  if (missing.length) throw new Error(`O Moodle não autorizou as funções necessárias (${missing.join(', ')}). Podes continuar com PDFs enviados manualmente.`);
  return available;
}

export function assertMoodleFileUrl(fileurl) {
  const url = new URL(fileurl);
  const root = new URL(baseUrl());
  const localTest = process.env.NODE_ENV !== 'production' && root.protocol === 'http:' &&
    ['127.0.0.1', 'localhost'].includes(root.hostname);
  if (!(url.protocol === 'https:' || (localTest && url.protocol === 'http:')) || url.origin !== root.origin ||
      !url.pathname.startsWith(`${root.pathname.replace(/\/$/, '')}/webservice/pluginfile.php`))
    throw new Error('O Moodle devolveu um endereço de ficheiro inesperado.');
  return url;
}

export async function storeFile(db, { userId, courseId, moduleId = null, filename, fileurl = null, modified = null, source, bytes }) {
  if (bytes.length > 20 * 1024 * 1024) throw new Error('O ficheiro excede 20 MB.');
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-')
    throw new Error('Este ficheiro não é um PDF válido.');
  const existing = source === 'moodle'
    ? db.prepare('SELECT * FROM files WHERE course_id=? AND moodle_module_id=? AND filename=?').get(courseId, moduleId, filename)
    : null;
  const fileId = existing?.id || id();
  const contentHash = digest(bytes);
  if (existing?.hash === contentHash && existing.path && existing.text_status !== 'falhou') {
    db.prepare('UPDATE files SET moodle_modified=?,fileurl=? WHERE id=?').run(modified, fileurl, fileId);
    return { id: fileId, changed: false };
  }
  const course = db.prepare('SELECT name FROM courses WHERE id=? AND user_id=?').get(courseId, userId);
  if (!course) throw new Error('Cadeira não encontrada.');
  const directory = join(PRODUCT_FILES_DIR, userId, `${safePart(course.name)}-${courseId.slice(0, 8)}`);
  const path = existing?.path || join(directory, `${fileId}-${safePart(filename.replace(/\.pdf$/i, ''))}.pdf`);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${id()}.part`;
  await writeFile(temp, bytes, { mode: 0o600 });
  await rename(temp, path);
  const extracted = await extrairTexto(bytes, 'application/pdf', filename);
  const safeText = ehPauta(filename) || ehListaDePessoas(extracted.texto) ? null : extracted.texto;
  const textStatus = safeText === null ? 'privado' : extracted.status;
  const pagesJson = safeText === null ? null : JSON.stringify(extracted.paginas || []);
  if (existing) {
    db.prepare(`UPDATE files SET fileurl=?,moodle_modified=?,size=?,hash=?,path=?,text=?,text_status=?,pages_json=?,changed_at=? WHERE id=?`)
      .run(fileurl, modified, bytes.length, contentHash, path, safeText, textStatus, pagesJson, now(), fileId);
    db.prepare('DELETE FROM analyses WHERE file_id=?').run(fileId);
  } else {
    db.prepare(`INSERT INTO files(id,user_id,course_id,moodle_module_id,filename,fileurl,mime,size,moodle_modified,hash,path,text,text_status,source,pages_json,first_seen_at,changed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(fileId, userId, courseId, moduleId, filename, fileurl, 'application/pdf', bytes.length,
        modified, contentHash, path, safeText, textStatus, source, pagesJson, now(), now());
  }
  return { id: fileId, changed: true };
}

export async function syncUser(db, userId) {
  const connection = db.prepare('SELECT * FROM moodle_connections WHERE user_id=?').get(userId);
  if (!connection) throw new Error('Liga o Moodle para sincronizar. Também podes enviar PDFs manualmente.');
  const token = decryptToken(connection.token_enc);
  const runId = id();
  db.prepare("INSERT INTO sync_runs(id,user_id,started_at,status) VALUES(?,?,?,'running')").run(runId, userId, now());
  let count = 0;
  const warnings = [];
  try {
    const site = await callWs(token, 'core_webservice_get_site_info');
    assertFunctions(site);
    if (site.userid !== connection.moodle_user_id) throw new Error('O token passou a pertencer a outra conta Moodle. Volta a ligar a conta.');
    const courses = db.prepare('SELECT * FROM courses WHERE user_id=? AND selected=1 AND source=?').all(userId, 'moodle');
    for (const course of courses) {
      const sections = await callWs(token, 'core_course_get_contents', { courseid: String(course.moodle_id) });
      for (const section of sections) for (const module of section.modules || []) {
        for (const due of module.dates || []) {
          if (due.dataid !== 'duedate' || !due.timestamp) continue;
          db.prepare(`INSERT INTO deadlines(id,user_id,course_id,moodle_module_id,kind,title,due_at,source)
            VALUES(?,?,?,?,'entrega',?,?,'moodle') ON CONFLICT(course_id,moodle_module_id,kind,due_at) DO UPDATE SET title=excluded.title`)
            .run(id(), userId, course.id, module.id, module.name, due.timestamp);
        }
        for (const file of module.contents || []) {
          if (file.type !== 'file' || !/\.pdf$/i.test(file.filename || '')) continue;
          const known = db.prepare('SELECT moodle_modified,path,text_status FROM files WHERE course_id=? AND moodle_module_id=? AND filename=?')
            .get(course.id, module.id, file.filename);
          if (known?.path && known.moodle_modified === file.timemodified && known.text_status !== 'falhou') continue;
          try {
            assertMoodleFileUrl(file.fileurl);
            const bytes = await getBytes(file.fileurl, token);
            const saved = await storeFile(db, { userId, courseId: course.id, moduleId: module.id,
              filename: file.filename, fileurl: file.fileurl, modified: file.timemodified, source: 'moodle', bytes });
            if (saved.changed) count++;
          } catch (error) {
            if (error.kind === 'TOKEN_INVALIDO') throw error;
            warnings.push(`${file.filename}: ${error.message}`);
          }
        }
      }
      db.prepare('UPDATE courses SET last_synced_at=? WHERE id=?').run(now(), course.id);
    }
    const warning = warnings.length ? `${warnings.length} ficheiro(s) não foram descarregados. Podes tentar sincronizar de novo.` : null;
    db.prepare('UPDATE sync_runs SET finished_at=?,status=?,new_count=?,error=? WHERE id=?')
      .run(now(), warning ? 'partial' : 'ok', count, warning, runId);
    db.prepare('UPDATE moodle_connections SET last_error=? WHERE user_id=?').run(warning, userId);
    return { newCount: count, warning };
  } catch (error) {
    const message = error.kind === 'TOKEN_INVALIDO' ? 'A ligação ao Moodle expirou. Volta a ligar a conta.' :
      error.kind === 'SITE_EM_MANUTENCAO' ? 'O Moodle está em manutenção. Tenta novamente mais tarde.' :
      error.message;
    db.prepare("UPDATE sync_runs SET finished_at=?,status='error',error=? WHERE id=?").run(now(), message, runId);
    db.prepare('UPDATE moodle_connections SET last_error=? WHERE user_id=?').run(message, userId);
    throw new Error(message);
  }
}
