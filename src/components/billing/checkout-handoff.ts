export type CheckoutHandoff =
  | Readonly<{action: 'embed'; clientSecret: string; publishableKey: string}>
  | Readonly<{action: 'redirect'; url: string}>
  | Readonly<{action: 'missing_publishable_key'}>
  | Readonly<{action: 'pending'}>;

/** Same shape as the server check: session id, then a percent-encoded base64 Stripe.js suffix. */
const CLIENT_SECRET = /^cs_test_[A-Za-z0-9]+_secret_(?:[A-Za-z0-9]|%(?:2[BbFf]|3[Dd])){1,4096}$/;
const PUBLISHABLE_KEY = /^pk_test_[A-Za-z0-9]+$/;

function isEmbeddedClientSecret(value: string): boolean {
  if (!CLIENT_SECRET.test(value)) return false;
  const suffix = value.slice(value.indexOf('_secret_') + '_secret_'.length);
  try {
    return atob(decodeURIComponent(suffix)).length > 0;
  } catch {
    return false;
  }
}

/** Choose the browser payment surface. An embedded client secret wins over any hosted URL. */
export function resolveCheckoutHandoff(data: Readonly<Record<string, unknown>>): CheckoutHandoff {
  const clientSecret = data.clientSecret;
  if (typeof clientSecret === 'string' && clientSecret.length > 0) {
    const publishableKey = data.publishableKey;
    if (isEmbeddedClientSecret(clientSecret) && typeof publishableKey === 'string' && PUBLISHABLE_KEY.test(publishableKey)) {
      return {action: 'embed', clientSecret, publishableKey};
    }
    return isEmbeddedClientSecret(clientSecret) ? {action: 'missing_publishable_key'} : {action: 'pending'};
  }
  const checkoutUrl = data.checkoutUrl;
  if (typeof checkoutUrl === 'string' && checkoutUrl.length > 0) return {action: 'redirect', url: checkoutUrl};
  return {action: 'pending'};
}
