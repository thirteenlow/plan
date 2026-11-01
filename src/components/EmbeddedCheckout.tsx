import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { embeddedClientSecret, STRIPE_PUBLISHABLE_KEY } from '@/cloud/pro';
import { RADIUS, useTheme } from '@/theme';

const MOUNT_ID = 'plan-stripe-checkout';

/** Web: Stripe's payment form shown inside the app (Embedded Checkout), so nobody leaves Plan to subscribe. */
export function EmbeddedCheckout({ period, onComplete, onError }: { period: 'monthly' | 'yearly'; onComplete: () => void; onError: (e: unknown) => void }) {
  const { colors } = useTheme();
  // Latest callbacks, so the effect only re-runs when the plan changes.
  const handlers = useRef({ onComplete, onError });
  useEffect(() => {
    handlers.current = { onComplete, onError };
  });

  useEffect(() => {
    let checkout: StripeEmbeddedCheckout | null = null;
    let cancelled = false;
    void (async () => {
      try {
        // Ask our server first, so its errors (or a fallback to Stripe's page) reach onError as they are.
        const [stripe, clientSecret] = await Promise.all([loadStripe(STRIPE_PUBLISHABLE_KEY), embeddedClientSecret(period)]);
        if (!stripe) throw new Error('Couldn’t load the payment form. Check your connection and try again.');
        if (cancelled) return;
        checkout = await stripe.createEmbeddedCheckoutPage({ clientSecret, onComplete: () => handlers.current.onComplete() });
        if (cancelled) return checkout.destroy();
        checkout.mount(`#${MOUNT_ID}`);
      } catch (e) {
        if (!cancelled) handlers.current.onError(e);
      }
    })();
    return () => {
      cancelled = true;
      checkout?.destroy();
    };
  }, [period]);

  return (
    <View style={{ minHeight: 560, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
      <ActivityIndicator color={colors.accent} style={{ position: 'absolute', top: 40, alignSelf: 'center' }} />
      <View nativeID={MOUNT_ID} style={{ minHeight: 560 }} />
    </View>
  );
}
