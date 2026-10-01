import nodemailer from 'nodemailer';
import { dailyPlan } from './product-plan.mjs';

const zone = 'Europe/Lisbon';
const localParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transport() {
  return nodemailer.createTransport({ host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
}

export async function sendEmailCode(address, code) {
  if (!mailConfigured()) throw new Error('A verificação por email ainda não está configurada.');
  await transport().sendMail({ from: process.env.SMTP_FROM, to: address,
    subject: 'Confirma o teu email · Caderno',
    text: `O teu código de confirmação é ${code}. Expira em 10 minutos. Se não criaste esta conta, ignora esta mensagem.` });
}

export async function runDigest(db, at = new Date()) {
  if (!mailConfigured()) return { sent: 0 };
  const parts = localParts(at);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const subscribers = db.prepare(`SELECT p.user_id,u.email,p.digest_hour,p.digest_sent_on
    FROM preferences p JOIN users u ON u.id=p.user_id WHERE p.digest_channel='email' AND p.digest_hour<=? AND u.email_verified_at IS NOT NULL`).all(hour);
  const transporter = transport();
  let sent = 0;
  for (const subscriber of subscribers) {
    if (subscriber.digest_sent_on === today) continue;
    const plan = dailyPlan(db, subscriber.user_id, Math.floor(at.getTime() / 1000));
    const deadlines = db.prepare(`SELECT d.title,d.due_at,c.name FROM deadlines d JOIN courses c ON c.id=d.course_id
      WHERE d.user_id=? AND c.selected=1 AND d.due_at>? ORDER BY d.due_at LIMIT 3`).all(subscriber.user_id, Math.floor(at.getTime() / 1000));
    const text = [
      'Bom dia. Eis um ponto de partida para hoje:',
      '',
      ...plan.blocks.map((block) => `• ${block.title} (${block.course}) — ${block.minutes} min`),
      ...(plan.blocks.length ? [] : ['Hoje não tens blocos pendentes.']),
      '',
      'Próximos prazos:',
      ...deadlines.map((deadline) => `• ${deadline.title} (${deadline.name}) — ${new Date(Number(deadline.due_at) * 1000).toLocaleDateString('pt-PT', { timeZone: zone })}`),
      ...(deadlines.length ? [] : ['Sem prazos registados.']),
      '',
      'Podes ajustar o horário ou desligar este email nas Definições do Caderno.',
      'O Caderno é independente e não é afiliado ao Moodle.',
    ].join('\n');
    try {
      await transporter.sendMail({ from: process.env.SMTP_FROM, to: subscriber.email,
        subject: 'O teu plano de estudo para hoje · Caderno', text });
      db.prepare('UPDATE preferences SET digest_sent_on=? WHERE user_id=?').run(today, subscriber.user_id);
      sent++;
    } catch (error) { console.error('Digest: falhou envio para utilizador', subscriber.user_id, error.message); }
  }
  return { sent };
}
