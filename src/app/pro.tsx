import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PixelPet } from '@/components/PixelPet';
import { Screen } from '@/components/Screen';
import { Button, Card, Chip, GradientCard, haptic, notify, Row, SectionTitle, Tap, TextField, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { CANCEL_REASONS, cancelSubscription, canEmbedCheckout, CheckoutRedirect, openStripePage, resumeSubscription, type SubscriptionState, subscriptionState, FREE_FEATURES, isAppleDevice, openBillingPortal, PRO_FEATURES, PRO_PRICES, type ProFeature, refreshPlan, startCheckout, startTrial, usePlan } from '@/cloud/pro';
import { EmbeddedCheckout } from '@/components/EmbeddedCheckout';
import { Sheet } from '@/components/Sheet';
import { RADIUS, useTheme } from '@/theme';
import { shortDate } from '@/utils/date';
import { useActiveBudget } from '@/store/store';

/** The Plan Pro paywall: what Pro adds, prices, and checkout. `?feature=` highlights what the user just tried. */
export default function ProScreen() {
  const { colors } = useTheme();
  const data = useActiveBudget();
  const params = useLocalSearchParams<{ feature?: ProFeature; checkout?: string }>();
  const { plan, expiresAt, trialAvailable, managed } = usePlan();
  const status = useCloud((s) => s.status);
  const [price, setPrice] = useState<(typeof PRO_PRICES)[number]['key']>('yearly');
  const [busy, setBusy] = useState<'trial' | 'checkout' | 'portal' | 'cancel' | null>(null);
  const [embedding, setEmbedding] = useState(false);
  // The Stripe subscription (for "Ends on…" and Resume), and the cancel sheet.
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  // Back from Stripe Checkout: the webhook usually lands within seconds, so check a few times.
  const [activating, setActivating] = useState(params.checkout === 'success');
  const signedIn = status === 'ready';
  const until = expiresAt ? shortDate(expiresAt.slice(0, 10), data.settings.dateFormat) : null;
  // iPhone users see Apple Pay first; everyone else sees what works on their device first.
  const apple = isAppleDevice();
  const features = apple ? [...PRO_FEATURES].sort((a, b) => (a.devices === 'iphone' ? -1 : b.devices === 'iphone' ? 1 : 0)) : PRO_FEATURES;

  useEffect(() => {
    if (!activating) return;
    let tries = 0;
    const t = setInterval(() => {
      void refreshPlan().then(() => {
        if (usePlan.getState().plan === 'pro' || ++tries >= 15) {
          clearInterval(t);
          setActivating(false);
          if (usePlan.getState().plan === 'pro') haptic('success');
        }
      });
    }, 2000);
    return () => clearInterval(t);
  }, [activating]);

  useEffect(() => {
    if (plan !== 'pro' || !managed) return;
    let live = true;
    subscriptionState()
      .then((s) => live && setSub(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [plan, managed]);

  const confirmCancel = () =>
    run('cancel', async () => {
      setSub(await cancelSubscription(reason ?? undefined, comment.trim() || undefined));
      setCancelling(false);
      haptic('success');
    });
  const resume = () =>
    run('cancel', async () => {
      setSub(await resumeSubscription());
      haptic('success');
    });
  const endsOn = sub?.periodEnd ? shortDate(sub.periodEnd.slice(0, 10), data.settings.dateFormat) : until;

  const run = async (kind: 'trial' | 'checkout' | 'portal' | 'cancel', fn: () => Promise<void>) => {
    haptic();
    if (!signedIn) return router.push('/account');
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      notify(
        kind === 'trial' ? 'Couldn’t start the trial' : kind === 'cancel' ? 'Couldn’t update your subscription' : kind === 'portal' ? 'Couldn’t open billing' : 'Payments aren’t available',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setBusy(null);
    }
  };
  const chosen = PRO_PRICES.find((p) => p.key === price)!;
  // On the web the payment form opens right here; phones use Stripe's page in the in-app browser.
  const subscribe = () => {
    if (canEmbedCheckout() && signedIn) {
      haptic();
      setEmbedding(true);
      return;
    }
    return run('checkout', () => startCheckout(price));
  };

  return (
    <Screen
      back="close"
      modal
      title="Plan Pro"
      maxWidth={560}
      footer={
        plan === 'pro' ? (
          managed ? (
            <View style={{ gap: 6 }}>
              <Button title="Manage billing" variant="soft" icon="card-outline" loading={busy === 'portal'} onPress={() => void run('portal', openBillingPortal)} />
              {sub?.cancelAtPeriodEnd ? (
                <Button title="Resume subscription" variant="ghost" small loading={busy === 'cancel'} onPress={() => void resume()} />
              ) : (
                <Button title="Cancel subscription" variant="ghost" small onPress={() => setCancelling(true)} />
              )}
            </View>
          ) : undefined
        ) : !signedIn ? (
          <Button title="Sign in to get Pro" icon="sparkles" onPress={() => router.push('/account')} />
        ) : (
          <View style={{ gap: 8 }}>
            {trialAvailable ? (
              <>
                <Button title="Start 14-day free trial" icon="sparkles" loading={busy === 'trial'} onPress={() => void run('trial', startTrial)} />
                <Button title={`Subscribe · ${chosen.price}${chosen.per}`} variant="soft" small loading={busy === 'checkout'} onPress={() => void subscribe()} />
              </>
            ) : (
              <Button title={`${plan === 'trial' ? 'Keep Pro' : 'Subscribe'} · ${chosen.price}${chosen.per}`} icon="sparkles" loading={busy === 'checkout'} onPress={() => void subscribe()} />
            )}
          </View>
        )
      }
    >
      <View style={{ gap: 18 }}>
        <GradientCard style={{ padding: 22 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt variant="label" style={{ color: colors.onGradient, opacity: 0.85 }}>
                {plan === 'pro' ? 'YOU HAVE PRO' : plan === 'trial' ? 'FREE TRIAL' : 'PLAN PRO'}
              </Txt>
              <Txt variant="h2" style={{ color: colors.onGradient }}>
                {plan === 'pro' ? 'Thanks for going Pro' : 'Put your budget on autopilot'}
              </Txt>
              <Txt style={{ color: colors.onGradient, opacity: 0.9 }}>
                {plan === 'pro'
                  ? sub?.subscribed
                    ? sub.cancelAtPeriodEnd
                      ? `Pro features until ${endsOn}.`
                      : `Renews on ${endsOn}.`
                    : until
                      ? `Pro is on until ${until}.`
                      : 'Pro is on, with no end date.'
                  : plan === 'trial'
                    ? `Everything is unlocked until ${until}. Keep it going with Pro.`
                    : apple
                      ? 'Apple Pay and screenshots log themselves, budgets are shared, and every companion is yours.'
                      : 'AI logs receipts for you, budgets are shared, and every companion is yours.'}
              </Txt>
            </View>
            <Row style={{ marginLeft: 8 }}>
              <PixelPet kind="fox" mood="thriving" size={48} />
              <PixelPet kind="penguin" mood="happy" size={48} />
            </Row>
          </Row>
        </GradientCard>

        {!apple && plan !== 'pro' && (
          <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
            <Txt variant="caption" tone="soft" style={{ flex: 1 }}>
              Not on an iPhone? Apple Pay auto-log needs one, but everything else in Pro works on Android and computers, including AI receipt scanning.
            </Txt>
          </Row>
        )}
        {plan === 'pro' && sub?.subscribed && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: sub.cancelAtPeriodEnd ? colors.sunken : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={sub.cancelAtPeriodEnd ? 'calendar-outline' : 'refresh'} size={19} color={sub.cancelAtPeriodEnd ? colors.textSoft : colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="strong">{sub.cancelAtPeriodEnd ? `Pro features until ${endsOn}` : `Renews on ${endsOn}`}</Txt>
              <Txt variant="caption" tone="muted">
                {sub.cancelAtPeriodEnd
                  ? 'Cancelled. You won’t be charged again, and you can resume anytime before then.'
                  : `${sub.priceLabel ? `${sub.priceLabel} · ` : ''}Cancel anytime, and Pro stays on until the end of the period.`}
              </Txt>
            </View>
          </Card>
        )}
        {activating && signedIn && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
            <Txt style={{ flex: 1 }}>Payment received. Turning on Pro…</Txt>
          </Card>
        )}
        <Card style={{ gap: 14 }}>
          {features.map((f) => {
            const on = params.feature === f.key;
            return (
              <Row key={f.key} style={{ gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: on ? colors.accent : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={f.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={on ? colors.onGradient : colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Row style={{ gap: 6 }}>
                    <Txt variant="strong">{f.title}</Txt>
                    {on && (
                      <View style={{ backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 1 }}>
                        <Txt variant="caption" tone="accent">
                          You tried this
                        </Txt>
                      </View>
                    )}
                  </Row>
                  <Txt variant="caption" tone="soft">
                    {f.text}
                  </Txt>
                  <Row style={{ gap: 4, marginTop: 3 }}>
                    <Ionicons name={f.devices === 'iphone' ? 'logo-apple' : 'phone-portrait-outline'} size={11} color={f.devices === 'iphone' && !apple ? colors.danger : colors.muted} />
                    <Txt variant="caption" tone="muted" style={{ fontSize: 11, color: f.devices === 'iphone' && !apple ? colors.danger : undefined }}>
                      {f.needs}
                    </Txt>
                  </Row>
                </View>
              </Row>
            );
          })}
        </Card>

        {plan !== 'pro' && (
          <View style={{ gap: 10 }}>
            {PRO_PRICES.map((p) => {
              const on = price === p.key;
              return (
                <Tap
                  key={p.key}
                  onPress={() => {
                    haptic();
                    setPrice(p.key);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }}
                >
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.accent : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Row style={{ gap: 6 }}>
                      <Txt variant="strong">{p.label}</Txt>
                      {'best' in p && p.best && (
                        <View style={{ backgroundColor: colors.accent, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 1 }}>
                          <Txt variant="caption" style={{ color: colors.onGradient }}>
                            Best value
                          </Txt>
                        </View>
                      )}
                    </Row>
                    <Txt variant="caption" tone="muted">
                      {p.note}
                    </Txt>
                  </View>
                  <Txt variant="strong">
                    {p.price}
                    <Txt variant="caption" tone="muted">
                      {' '}
                      {p.per}
                    </Txt>
                  </Txt>
                </Tap>
              );
            })}
            <Txt variant="caption" tone="muted" center style={{ marginHorizontal: 8 }}>
              {trialAvailable ? 'The trial needs no card and ends by itself. ' : ''}Subscriptions are billed securely by Stripe. Cancel anytime from Manage subscription.
            </Txt>
          </View>
        )}

        <SectionTitle title="Always free" />
        <Card style={{ gap: 10 }}>
          {FREE_FEATURES.map((f) => (
            <Row key={f} style={{ gap: 10 }}>
              <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
              <Txt style={{ flex: 1 }}>{f}</Txt>
            </Row>
          ))}
        </Card>
      </View>
      <Sheet visible={cancelling} onClose={() => setCancelling(false)} title="Cancel Plan Pro?">
        <View style={{ gap: 14 }}>
          <Txt tone="soft">
            Pro stays on until {endsOn ?? 'the end of what you’ve paid for'}, and you won’t be charged again. After that, Apple Pay auto-log, receipt scanning and inviting people stop, and Pro
            companions switch to a free one. Your budgets and data stay just as they are.
          </Txt>
          <Txt variant="label" tone="muted">
            Mind telling us why? (optional)
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CANCEL_REASONS.map((r) => (
              <Chip key={r.key} label={r.label} active={reason === r.key} onPress={() => setReason(reason === r.key ? null : r.key)} />
            ))}
          </View>
          <TextField placeholder="Anything we could do better" value={comment} onChangeText={setComment} maxLength={500} multiline />
          <Button title="Cancel subscription" variant="danger" loading={busy === 'cancel'} onPress={() => void confirmCancel()} />
          <Button title="Keep Pro" variant="soft" onPress={() => setCancelling(false)} />
        </View>
      </Sheet>
      <Sheet visible={embedding} onClose={() => setEmbedding(false)} title={`Plan Pro · ${chosen.label}`} tall>
        {embedding && (
          <EmbeddedCheckout
            period={price}
            onComplete={() => {
              setEmbedding(false);
              setActivating(true);
            }}
            onError={(e) => {
              setEmbedding(false);
              // The server can only offer Stripe's own page: go there instead.
              if (e instanceof CheckoutRedirect) return void openStripePage(e.url);
              notify('Payments aren’t available', e instanceof Error ? e.message : undefined);
            }}
          />
        )}
      </Sheet>
    </Screen>
  );
}
