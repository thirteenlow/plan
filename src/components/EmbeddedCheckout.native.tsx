/** Phones use Stripe's hosted page in the in-app browser instead (see startCheckout). */
export function EmbeddedCheckout(_props: { period: 'monthly' | 'yearly'; onComplete: () => void; onError: (e: unknown) => void }) {
  return null;
}
