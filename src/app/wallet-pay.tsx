import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WALLET_MOCKS } from '@/components/AndroidMocks';
import { CopyRow } from '@/components/CopyRow';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, confirm, FieldRow, haptic, notify, Row, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { requirePro } from '@/cloud/pro';
import { accountForCard, createInboxKey, getInboxKey, importPayments, logPaymentUrl, removeInboxKey, sendTestPayment, walletNotificationBody } from '@/cloud/inbox';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { goBack } from '@/utils/nav';

/** MacroDroid's Notification trigger text filter: only notifications with an amount like 4.50 or 1.234,56. */
const AMOUNT_FILTER = String.raw`\d[.,]\d\d`;

const STEPS: { title: string; text: string }[] = [
  { title: 'Get MacroDroid', text: 'Install MacroDroid from the Play Store and open it. The free version is enough for this.' },
  { title: 'Add a macro', text: 'Tap Add Macro, then the + in the red Triggers box.' },
  { title: 'Choose Notification', text: 'Open Device Events and tap Notification (or search “Notification”). Allow notification access if MacroDroid asks.' },
  { title: 'Pick your wallets', text: 'Choose Notification Received, then Select Applications. Tick Wallet (Google) and Samsung Wallet, whichever you use, then OK.' },
  { title: 'Only payments', text: 'Choose Contains, paste the text below, tick Enable regex, then OK. This skips wallet notifications without an amount.' },
  { title: 'Add the action', text: 'Tap the + in the blue Actions box, open Web Interactions and tap HTTP Request.' },
  { title: 'Paste the link', text: 'Set Request method to POST and paste the link below into URL.' },
  { title: 'Paste the body', text: 'Open the Content Body tab, set Content type to application/json and paste the text below. Then tap ✓.' },
  { title: 'Save', text: 'Name the macro (e.g. “Plan payments”) and tap ✓. Every tap-to-pay now goes to Plan.' },
];

const TOTAL = STEPS.length + 2; // intro + steps + test

/** Guided setup for logging Google Wallet / Samsung Wallet payments automatically, by forwarding their notifications with MacroDroid. */
export default function WalletPayScreen() {
  const data = useActiveBudget();
  const status = useCloud((s) => s.status);
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  // `?step=` opens a given step (deep links from help, and previewing the guide).
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState(() => Math.max(0, Math.min(TOTAL - 1, Number(params.step) || 0)));
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [test, setTest] = useState<'idle' | 'sending' | 'ok' | 'failed'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'ready') return;
    void getInboxKey().then(setKey);
  }, [status]);

  const accounts = data.accounts.filter((a) => a.onBudget && !a.closed);
  const fallback = accountForCard(data, null);
  const fallbackName = accounts.find((a) => a.id === fallback)?.name;

  const makeKey = async () => {
    if (status !== 'ready') return notify('Sign in first', 'Auto-logging works through your Plan account.');
    if (!requirePro('applePay')) return;
    setBusy(true);
    try {
      setKey(await createInboxKey());
    } catch (e) {
      notify('Couldn’t create a key', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (status !== 'ready') return notify('Sign in first', 'Auto-logging works through your Plan account.');
    if (!requirePro('applePay')) return;
    if (!key) {
      setBusy(true);
      try {
        setKey(await createInboxKey());
      } catch (e) {
        return notify('Couldn’t set it up', e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    }
    haptic();
    setStep(1);
  };

  const runTest = async () => {
    if (!key) return;
    setTest('sending');
    setTestError(null);
    try {
      await sendTestPayment(key);
      const { tests } = await importPayments();
      setTest(tests > 0 ? 'ok' : 'failed');
      if (!tests) setTestError('The test reached the server but didn’t come back. Pull down to refresh, then try again.');
      haptic(tests > 0 ? 'success' : 'warning');
    } catch (e) {
      setTest('failed');
      setTestError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const newKey = async () => {
    if (!(await confirm('Make a new key?', 'Your macro will stop working until you paste the new body into its HTTP Request.', 'Make new key'))) return;
    try {
      setKey(await createInboxKey());
      setTest('idle');
    } catch (e) {
      notify('Couldn’t make a new key', e instanceof Error ? e.message : undefined);
    }
  };

  const turnOff = async () => {
    if (!(await confirm('Turn off auto-logging?', 'Your macro will stop working and anything still waiting is deleted. You can delete the macro in MacroDroid too.', 'Turn off', true))) return;
    try {
      await removeInboxKey();
      setKey(null);
      goBack();
    } catch (e) {
      notify('Couldn’t turn it off', e instanceof Error ? e.message : undefined);
    }
  };

  const Mock = step >= 1 && step <= STEPS.length ? WALLET_MOCKS[step - 1] : null;
  const isTest = step === TOTAL - 1;

  return (
    <Screen
      back="close"
      modal
      title="Tap-to-pay auto-log"
      maxWidth={560}
      footer={
        step > 0 ? (
          <Row style={{ gap: 10 }}>
            <Button title="Back" variant="soft" icon="chevron-back" style={{ flex: 1 }} onPress={() => setStep(step - 1)} />
            <Button title={isTest ? 'Done' : 'Next'} style={{ flex: 1.4 }} onPress={() => (isTest ? goBack() : setStep(step + 1))} />
          </Row>
        ) : (
          <Button title={key ? 'Show me the steps' : 'Set it up'} loading={busy} onPress={() => void start()} />
        )
      }
    >
      <Row style={{ gap: 5, marginBottom: 18 }}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.accent : colors.sunken }} />
        ))}
      </Row>

      {step === 0 && (
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="phone-portrait-outline" size={30} color={colors.accent} />
            </View>
            <Txt variant="h2" center>
              Tap to pay, and it’s logged
            </Txt>
            <Txt tone="soft" center>
              Google Wallet and Samsung Wallet show a notification for every tap. The free MacroDroid app passes it to Plan, and the payment shows up in Spending to review the next time you open the app.
            </Txt>
            <Row style={{ gap: 6, alignSelf: 'center', backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Ionicons name="logo-android" size={13} color={colors.textSoft} />
              <Txt variant="caption" tone="soft">
                Android · Google or Samsung Wallet
              </Txt>
            </Row>
          </View>
          <Card style={{ gap: 4 }}>
            <FieldRow icon="card-outline" label="Log to" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              Used when a card doesn’t match one of your accounts. Put the card’s last 4 digits in an account’s name (e.g. “DBS Visa 1234”) to match it.
            </Txt>
          </Card>
          <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
            <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
              MacroDroid can’t encrypt, so the wallet’s notification text (merchant, amount and the card’s last digits) waits on the server unencrypted until Plan picks it up, then it’s deleted. The rest of your budget stays encrypted.
            </Txt>
          </Row>
          {!!key && (
            <Row style={{ gap: 10 }}>
              <Button title="New key" small variant="soft" icon="key-outline" style={{ flex: 1 }} onPress={() => void newKey()} />
              <Button title="Turn off" small variant="danger" icon="power" style={{ flex: 1 }} onPress={() => void turnOff()} />
            </Row>
          )}
        </View>
      )}

      {Mock && (
        <View style={{ gap: 16 }}>
          <Mock key={step} />
          <Card style={{ gap: 8 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Txt variant="label" tone="accent">
                Step {step}
              </Txt>
            </View>
            <Txt variant="h3">{STEPS[step - 1].title}</Txt>
            <Txt tone="soft">{STEPS[step - 1].text}</Txt>
            {step === 5 && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label="Text to match" value={AMOUNT_FILTER} />
              </View>
            )}
            {step === 7 && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label="Link for URL" value={logPaymentUrl()} />
              </View>
            )}
            {step === 8 && (
              <View style={{ marginTop: 4 }}>
                {key ? (
                  <CopyRow label="Body (includes your key)" value={walletNotificationBody(key)} secret />
                ) : (
                  <Row style={{ gap: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label">Body</Txt>
                      <Txt variant="caption" tone="muted">
                        Needs your key
                      </Txt>
                    </View>
                    <Button title="Create key" small variant="soft" loading={busy} onPress={() => void makeKey()} />
                  </Row>
                )}
                <Txt variant="caption" tone="muted">
                  Paste it as it is: MacroDroid fills in the parts in {'{braces}'} from each notification.
                </Txt>
              </View>
            )}
          </Card>
        </View>
      )}

      {isTest && (
        <View style={{ gap: 16 }}>
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
            {test === 'sending' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name={test === 'ok' ? 'checkmark-circle' : test === 'failed' ? 'alert-circle' : 'paper-plane-outline'} size={36} color={test === 'ok' ? colors.positive : test === 'failed' ? colors.danger : colors.accent} />
            )}
            <Txt variant="h3" center>
              {test === 'ok' ? 'It works' : test === 'failed' ? 'That didn’t work' : 'Check the connection'}
            </Txt>
            <Txt tone="soft" center>
              {test === 'ok'
                ? 'Plan received a test payment. Tap to pay with your wallet and it’ll appear in Spending.'
                : test === 'failed'
                  ? testError
                  : 'Checks that your key works with the server. Nothing is added to your budget.'}
            </Txt>
            <Button title={test === 'ok' ? 'Test again' : 'Send a test'} variant="soft" icon="paper-plane-outline" onPress={() => void runTest()} />
          </Card>
          <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
            If something’s off
          </Txt>
          <Card style={{ gap: 12 }}>
            {[
              ['Nothing shows up', 'Check MacroDroid has notification access, the macro is on, and your wallet’s payment notifications are turned on (Samsung Wallet: Settings › Notifications › Payments).'],
              ['It stops after a while', 'In Android Settings › Apps › MacroDroid › Battery, choose Unrestricted so Android doesn’t pause it.'],
              ['Still nothing from Google Wallet', 'On some phones the notification comes from Google Play services. Edit the trigger and tick it as well; the text filter keeps out everything without an amount.'],
              ['Wrong account', 'Put the card’s last 4 digits in the account name (e.g. “DBS Visa 1234”), or change “Log to” on the first screen.'],
              ['Amounts without decimals', 'For currencies like ¥ or ₩, change the text to match to \\d, or set it to Any.'],
              ['See what happened', 'MacroDroid’s System Log (in the menu) shows each time the macro ran and any HTTP error.'],
              ['When it shows up', 'Payments wait on the server and appear in Spending the next time Plan is open and syncs (within a minute).'],
            ].map(([t, d]) => (
              <View key={t}>
                <Txt variant="strong">{t}</Txt>
                <Txt variant="caption" tone="soft">
                  {d}
                </Txt>
              </View>
            ))}
          </Card>
        </View>
      )}

      <PickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Log payments to"
        searchable={false}
        selectedKey={fallback}
        items={accounts.map((a) => ({ key: a.id, title: a.name }))}
        onSelect={(k) => {
          updateSettings({ payAccountId: k });
          setPicking(false);
        }}
      />
    </Screen>
  );
}
