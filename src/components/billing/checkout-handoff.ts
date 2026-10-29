export type CheckoutHandoff =
  | Readonly<{action: 'embed'; clientSecret: string; publishableKey: string}>
  | Readonly<{action: 'redirect'; url: string}>
  | Readonly<{action: 'missing_publishable_key'}>
  | Readonly<{action: 'pending'}>;

const CLIENT_SECRET = /^cs_test_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/;
const PUBLISHABLE_KEY = /^pk_test_[A-Za-z0-9]+$/;

/** Choose the browser payment surface. An embedded client secret wins over any hosted URL. */
export function resolveCheckoutHandoff(data: Readonly<Record<string, unknown>>): CheckoutHandoff {
  const clientSecret = data.clientSecret;
  if (typeof clientSecret === 'string' && clientSecret.length > 0) {
    const publishableKey = data.publishableKey;
    if (CLIENT_SECRET.test(clientSecret) && typeof publishableKey === 'string' && PUBLISHABLE_KEY.test(publishableKey)) {
      return {action: 'embed', clientSecret, publishableKey};
    }
    return CLIENT_SECRET.test(clientSecret) ? {action: 'missing_publishable_key'} : {action: 'pending'};
  }
  const checkoutUrl = data.checkoutUrl;
  if (typeof checkoutUrl === 'string' && checkoutUrl.length > 0) return {action: 'redirect', url: checkoutUrl};
  return {action: 'pending'};
}
