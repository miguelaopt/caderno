#!/usr/bin/env node
// Acesso de cortesia: não cria cobrança nem assinatura no Stripe.
try { process.loadEnvFile('.env'); } catch {}
const { openProductDb } = await import('../lib/product-db.mjs');

const email = process.argv[2]?.trim().toLowerCase();
const activateUnverified = process.argv[3] === '--activate-unverified';
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (process.argv[3] && !activateUnverified))
  throw new Error('Uso: node scripts/grant-complimentary.mjs <email-da-conta> [--activate-unverified]');

const db = openProductDb();
try {
  const user = db.prepare('SELECT id,email_verified_at,complimentary_at,complimentary_override_at,stripe_subscription_id FROM users WHERE email=?').get(email);
  if (!user) throw new Error('Não existe uma conta com esse email.');
  if (user.stripe_subscription_id) throw new Error('A conta já tem histórico Stripe. Revê a assinatura antes de conceder acesso.');
  if (!user.complimentary_at)
    db.prepare('UPDATE users SET complimentary_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), user.id);
  if (activateUnverified && !user.complimentary_override_at)
    db.prepare('UPDATE users SET complimentary_override_at=? WHERE id=?').run(Math.floor(Date.now() / 1000), user.id);
  console.log(user.email_verified_at || user.complimentary_override_at || activateUnverified ? 'Acesso de cortesia Estudante ativo.' :
    'Acesso de cortesia registado. Ficará ativo quando a conta confirmar o email.');
} finally { db.close(); }
