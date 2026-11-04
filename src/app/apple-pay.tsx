import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CopyRow } from '@/components/CopyRow';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { SHORTCUT_MOCKS } from '@/components/ShortcutMocks';
import { shortcuts27Mocks } from '@/components/Shortcuts27Mocks';
import { Button, Card, confirm, Divider, FieldRow, haptic, notify, Row, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { iosMajor, requirePro } from '@/cloud/pro';
import { accountForCard, createInboxKey, getInboxKey, importPayments, logPaymentUrl, removeInboxKey, sendTestPayment } from '@/cloud/inbox';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { goBack } from '@/utils/nav';

/** iOS 27 Shortcuts: an automation is a new shortcut that starts with a trigger. */
const STEPS_27: { title: string; text: string }[] = [
  { title: 'New shortcut', text: 'Open Shortcuts and tap + at the bottom.' },
  { title: 'Skip the prompt', text: 'Tap ✕ next to “Describe a shortcut”.' },
  { title: 'Add the trigger', text: 'In the sheet, tap Automation, then Wallet.' },
  { title: 'Pick your cards', text: 'Tap Cards and tick yours. Leave Run Immediately on.' },
  { title: 'Add the action', text: 'Search “Get Contents of URL” and tap it.' },
  { title: 'Paste the link', text: 'Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to JSON.' },
  { title: 'Add the fields', text: 'Add a Text field for each row below, in lowercase. For amount, merchant and card, tap the value, pick the trigger’s variable, then the item.' },
  { title: 'Name and save', text: 'Tap the name › Rename to “Apple Pay Auto-log”, then tap back.' },
];

/** iOS 17 to 26: the Automation tab. */
const STEPS_OLD: { title: string; text: string }[] = [
  { title: 'Open Shortcuts', text: 'It’s already on your iPhone.' },
  { title: 'New automation', text: 'Tap Automation, then +.' },
  { title: 'Choose Wallet', text: 'Scroll down and tap Wallet.' },
  { title: 'Pick your cards', text: 'Tick your cards, choose Run Immediately, then Next.' },
  { title: 'Add the action', text: 'Tap Create New Shortcut, search “Get Contents of URL” and tap it.' },
  { title: 'Paste the link', text: 'Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to JSON.' },
  { title: 'Add the fields', text: 'Add a Text field for each row below, in lowercase. For amount, merchant and card, tap the value › Shortcut Input › the item.' },
  { title: 'Save', text: 'Tap ✓. Done!' },
];

const MODERN = (iosMajor() ?? 27) >= 27;
const STEPS = MODERN ? STEPS_27 : STEPS_OLD;
const MOCKS = MODERN ? shortcuts27Mocks('wallet') : SHORTCUT_MOCKS;
const TOTAL = STEPS.length + 2; // intro + steps + test

/** Guided setup for logging Apple Pay payments automatically through an iPhone Shortcuts automation. */
export default function ApplePayScreen() {
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

  const runTest = async () => {
    if (!key) return;
    setTest('sending');
    setTestError(null);
    try {
      await sendTestPayment(key);
      const { tests } = await importPayments();
      setTest(tests > 0 ? 'ok' : 'failed');
      if (!tests) setTestError('It reached the server but didn’t come back. Try again.');
      haptic(tests > 0 ? 'success' : 'warning');
    } catch (e) {
      setTest('failed');
      setTestError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const newKey = async () => {
    if (!(await confirm('Make a new key?', 'Your Shortcut stops working until you paste the new key into it.', 'Make new key'))) return;
    try {
      setKey(await createInboxKey());
      setTest('idle');
    } catch (e) {
      notify('Couldn’t make a new key', e instanceof Error ? e.message : undefined);
    }
  };

  const turnOff = async () => {
    if (!(await confirm('Turn off auto-logging?', 'Your Shortcut stops working and anything waiting is deleted.', 'Turn off', true))) return;
    try {
      await removeInboxKey();
      setKey(null);
      goBack();
    } catch (e) {
      notify('Couldn’t turn it off', e instanceof Error ? e.message : undefined);
    }
  };

  const Mock = step >= 1 && step <= STEPS.length ? MOCKS[step - 1] : null;
  const isTest = step === TOTAL - 1;

  return (
    <Screen
      back="close"
      modal
      title="Apple Pay auto-log"
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
              Every Apple Pay payment goes to Plan. Review it in Spending.
            </Txt>
            <Row style={{ gap: 6, alignSelf: 'center', backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Ionicons name="logo-apple" size={13} color={colors.textSoft} />
              <Txt variant="caption" tone="soft">
                iPhone · iOS 17 or later
              </Txt>
            </Row>
          </View>
          <Card style={{ gap: 4 }}>
            <FieldRow icon="card-outline" label="Log to" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              Used when a card doesn’t match an account name.
            </Txt>
          </Card>
          <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
            <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
              The amount, merchant and card wait on the server unencrypted until Plan picks them up, then they’re deleted.
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
            {step === 6 && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label="Link for the URL box" value={logPaymentUrl()} />
              </View>
            )}
            {step === 7 && (
              <View style={{ gap: 2, marginTop: 4 }}>
                {key ? (
                  <CopyRow label="token" value={key} secret />
                ) : (
                  <Row style={{ gap: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label">token</Txt>
                      <Txt variant="caption" tone="muted">
                        Paste your key
                      </Txt>
                    </View>
                    <Button title="Create key" small variant="soft" loading={busy} onPress={() => void makeKey()} />
                  </Row>
                )}
                <Divider />
                <MapRow field="amount" from="Shortcut Input › Amount" />
                <Divider />
                <MapRow field="merchant" from="Shortcut Input › Merchant" />
                <Divider />
                <MapRow field="card" from="Shortcut Input › Name" />
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
                ? 'Plan got it. Your next Apple Pay payment will show up in Spending.'
                : test === 'failed'
                  ? testError
                  : 'Sends a test to Plan. Nothing is added to your budget.'}
            </Txt>
            <Button title={test === 'ok' ? 'Test again' : 'Send a test'} variant="soft" icon="paper-plane-outline" onPress={() => void runTest()} />
          </Card>
          <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
            If something’s off
          </Txt>
          <Card style={{ gap: 12 }}>
            {[
              ['Nothing shows up', 'Check Run Immediately is on, your cards are ticked, and Method is POST with JSON.'],
              ['Wrong account', 'Name the account like the card (e.g. “DBS Visa”), or change Log to.'],
              ['No merchant', 'Some payments don’t have one. They’re logged as “Apple Pay”.'],
              ['Bus and train taps', 'Skipped, since there’s no fare yet. Set up SimplyGo fare auto-log for those.'],
              ['Hide “Running your automation”', 'In the automation, turn off Notify When Run.'],
              ['See what happened', 'Add Show Notification after Get Contents of URL. “ok” means Plan got it.'],
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

function MapRow({ field, from }: { field: string; from: string }) {
  return (
    <Row style={{ gap: 10, paddingVertical: 8 }}>
      <Txt variant="label" style={{ width: 70 }}>
        {field}
      </Txt>
      <Txt variant="caption" tone="accent" style={{ flex: 1, textAlign: 'right' }}>
        {from}
      </Txt>
    </Row>
  );
}
