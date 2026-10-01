import Stripe from 'stripe';
import { hostedBillingEnabled } from './product-entitlements.mjs';
import { effectivePlan } from './product-entitlements.mjs';

let client;
const now = () => Math.floor(Date.now() / 1000);

export function billingConfigured() {
  return hostedBillingEnabled() && !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID &&
    process.env.STRIPE_WEBHOOK_SECRET && process.env.PUBLIC_BASE_URL);
}

function stripe() {
  if (!billingConfigured()) throw new Error('Os pagamentos ainda não estão configurados.');
  return client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
}

function baseUrl() {
  const value = process.env.PUBLIC_BASE_URL;
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.hostname === 'localhost' && url.protocol === 'http:'))
    throw new Error('PUBLIC_BASE_URL tem de usar HTTPS.');
  return url.origin;
}

export async function checkoutSession(db, user) {
  if (!user.email_verified_at) throw new Error('Confirma o teu email antes de aderir ao plano Estudante.');
  const account = db.prepare('SELECT stripe_customer_id,plan,email_verified_at,complimentary_at,complimentary_override_at FROM users WHERE id=?').get(user.id);
  if (effectivePlan(account) === 'student') throw new Error('Já tens acesso ao plano Estudante.');
  const price = await stripe().prices.retrieve(process.env.STRIPE_PRICE_ID);
  if (!price.active || price.currency !== 'eur' || price.unit_amount !== 299 ||
      price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1)
    throw new Error('O preço Stripe não corresponde a €2,99 por mês. Confirma a configuração antes de cobrar.');
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription', client_reference_id: user.id,
    ...(account.stripe_customer_id ? { customer: account.stripe_customer_id } : { customer_email: user.email }),
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: { metadata: { caderno_user_id: user.id } },
    success_url: `${baseUrl()}/app?checkout=success`, cancel_url: `${baseUrl()}/app?checkout=cancel`,
  });
  return { url: session.url };
}

export async function portalSession(db, userId) {
  const account = db.prepare('SELECT stripe_customer_id FROM users WHERE id=?').get(userId);
  if (!account?.stripe_customer_id) throw new Error('Ainda não há uma assinatura para gerir.');
  const session = await stripe().billingPortal.sessions.create({ customer: account.stripe_customer_id,
    return_url: `${baseUrl()}/app` });
  return { url: session.url };
}

export async function cancelBeforeDelete(db, userId) {
  const account = db.prepare('SELECT stripe_subscription_id,stripe_status FROM users WHERE id=?').get(userId);
  if (account?.stripe_subscription_id && account.stripe_status !== 'canceled')
    await stripe().subscriptions.cancel(account.stripe_subscription_id);
}

export function applySubscription(db, subscription, eventAt = now()) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const userId = subscription.metadata?.caderno_user_id ||
    db.prepare('SELECT id FROM users WHERE stripe_customer_id=?').get(customerId)?.id;
  if (!userId) return false;
  const account = db.prepare('SELECT stripe_event_at FROM users WHERE id=?').get(userId);
  if (!account || Number(account.stripe_event_at || 0) > eventAt) return false;
  const correctPrice = subscription.items?.data?.some((item) => item.price?.id === process.env.STRIPE_PRICE_ID);
  const active = correctPrice && ['active', 'trialing'].includes(subscription.status);
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE users SET plan=?,stripe_customer_id=?,stripe_subscription_id=?,stripe_status=?,stripe_event_at=? WHERE id=?`)
      .run(active ? 'student' : 'free', customerId, subscription.id, subscription.status, eventAt, userId);
    if (!active && effectivePlan(db.prepare('SELECT plan,email_verified_at,complimentary_at,complimentary_override_at FROM users WHERE id=?').get(userId)) === 'free') {
      const selected = db.prepare('SELECT id FROM courses WHERE user_id=? AND selected=1 ORDER BY name').all(userId);
      for (const course of selected.slice(1)) db.prepare('UPDATE courses SET selected=0 WHERE id=? AND user_id=?').run(course.id, userId);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return true;
}

export async function handleWebhook(db, payload, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error('Falta o segredo do webhook Stripe.');
  const event = stripe().webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
  if (db.prepare('SELECT 1 FROM billing_events WHERE id=?').get(event.id)) return { duplicate: true };
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    const account = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
    if (account && session.customer) {
      db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?')
        .run(typeof session.customer === 'string' ? session.customer : session.customer.id, userId);
    }
    if (account && session.subscription) {
      const subscription = await stripe().subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
      applySubscription(db, subscription, now());
    }
  } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    applySubscription(db, event.data.object, event.created);
  } else if (['invoice.paid', 'invoice.payment_failed'].includes(event.type)) {
    const invoice = event.data.object;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (subscriptionId) applySubscription(db, await stripe().subscriptions.retrieve(subscriptionId), now());
  }
  db.prepare('INSERT INTO billing_events(id,type,processed_at) VALUES(?,?,?)').run(event.id, event.type, now());
  return { duplicate: false };
}
