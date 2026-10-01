// Uma oferta concede as funcionalidades do plano Estudante, não uma assinatura Stripe.
// Por defeito exige email confirmado; o operador pode ativar uma oferta pessoal
// sem alterar o estado de verificação do endereço.
export const hostedBillingEnabled = () => process.env.ENABLE_HOSTED_BILLING === 'true';
export function hasComplimentaryAccess(user) {
  return Boolean(user?.complimentary_at && (user?.email_verified_at || user?.complimentary_override_at));
}

export function effectivePlan(user) {
  return user?.plan === 'student' || hasComplimentaryAccess(user) ? 'student' : 'free';
}

export function paidThroughStripe(user) {
  return user?.plan === 'student' && Boolean(user?.stripe_subscription_id);
}
