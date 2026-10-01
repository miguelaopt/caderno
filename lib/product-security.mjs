import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const id = () => randomUUID();
export const hash = (s) => createHash('sha256').update(s).digest('hex');

export function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256)
    throw new Error('Escolhe uma palavra-passe com 12 a 256 caracteres.');
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function passwordMatches(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [salt, expected] = stored.split(':');
  if (!salt || !expected || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(expected)) return false;
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes em hexadecimal.');
    return Buffer.from(raw, 'hex');
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('Falta TOKEN_ENCRYPTION_KEY no servidor.');
  const path = 'data/product.key';
  if (!existsSync(path)) {
    mkdirSync('data', { recursive: true });
    writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' });
  }
  return readFileSync(path);
}

export function encryptToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function decryptToken(value) {
  const [iv, tag, body] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

export function newSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 30 * 86400;
  db.prepare('INSERT INTO sessions(id_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token), userId, expires);
  return { token, expires };
}

export function sessionUser(db, cookie) {
  const token = /(?:^|;\s*)caderno_session=([^;]+)/.exec(cookie || '')?.[1];
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  return db.prepare(`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id_hash=? AND s.expires_at>?`).get(hash(token), Math.floor(Date.now() / 1000)) || null;
}

export function sessionCookie(token, secure = false) {
  return `caderno_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? '; Secure' : ''}`;
}
