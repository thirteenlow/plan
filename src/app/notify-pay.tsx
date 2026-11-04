import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CopyRow } from '@/components/CopyRow';
import { notifyDroidMocks } from '@/components/AndroidMocks';
import { notifyMocks } from '@/components/NotifyMocks';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, notify, Row, TextField, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { accountForCard, appNotificationBody, createInboxKey, getInboxKey, importPayments, logPaymentUrl, sendTestPayment } from '@/cloud/inbox';
import { isAndroidDevice, requirePro } from '@/cloud/pro';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { goBack } from '@/utils/nav';

const DEFAULT_APP = 'SimplyGo';

/** MacroDroid's text filter: only notifications with an amount like 0.20. */
const AMOUNT_FILTER = String.raw`\d[.,]\d\d`;

const androidSteps = (app: string): { title: string; text: string }[] => [
  { title: 'Get MacroDroid', text: 'Install it free from the Play Store and open it.' },
  { title: 'New macro', text: 'Tap Add Macro, then + in the red Triggers box.' },
  { title: 'Choose Notification', text: 'Tap Device Events › Notification. Allow access if asked.' },
  { title: `Pick ${app}`, text: `Choose Notification Received › Select Applications. Tick ${app}, then OK.` },
  { title: 'Only fares', text: 'Choose Contains, paste the text below, tick Enable regex, then OK.' },
  { title: 'Add the action', text: 'Tap + in the blue Actions box › Web Interactions › HTTP Request.' },
  { title: 'Paste the link', text: 'Set Request method to POST. Paste the link below into URL.' },
  { title: 'Paste the body', text: 'Open Content Body, set Content type to application/json and paste the text below. Tap ✓.' },
  { title: 'Save', text: `Name it “${app} fares” and tap ✓. Done!` },
];

const iosSteps = (app: string): { title: string; text: string }[] => [
  { title: 'Open Shortcuts', text: 'It’s already on your iPhone.' },
  { title: 'New automation', text: 'Tap Automation, then +.' },
  { title: 'Choose Notification', text: 'Scroll down and tap Notification.' },
  { title: `Pick ${app}`, text: `Choose ${app}, then Run Immediately and Next. Optional: set Message Contains to $.` },
  { title: 'Add the action', text: 'Tap Create New Shortcut, search “Get Contents of URL” and tap it.' },
  { title: 'Paste the link', text: 'Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to JSON.' },
  {
    title: 'Add the fields',
    text: 'Add a Text field for each row below, in lowercase. For amount, tap the value › Shortcut Input › Message (or Body).',
  },
  { title: 'Save', text: 'Tap ✓. Done!' },
];

/**
 * Guided setup for logging payments from another app's notifications (SimplyGo fares, Grab, bank apps): an iOS 27
 * Shortcuts "Notification" automation on iPhone, a MacroDroid macro on Android. Both post the notification as it
 * came, and the app reads it with readWalletPayment (src/utils/walletNotification.ts).
 */
export default function NotifyPayScreen() {
  const data = useActiveBudget();
  const status = useCloud((s) => s.status);
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ step?: string }>();
  const [app, setApp] = useState(DEFAULT_APP);
  const appName = app.trim() || DEFAULT_APP;
  const [android] = useState(isAndroidDevice);
  const STEPS = android ? androidSteps(appName) : iosSteps(appName);
  const TOTAL = STEPS.length + 2; // intro + steps + test
  const mocks = useMemo(() => (android ? notifyDroidMocks(appName) : notifyMocks(appName)), [android, appName]);
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

  const ensureKey = async () => {
    if (status !== 'ready') {
      notify('Sign in first', 'Auto-logging works through your Plan account.');
      return false;
    }
    if (!requirePro('notifyPay')) return false;
    if (key) return true;
    setBusy(true);
    try {
      setKey(await createInboxKey());
      return true;
    } catch (e) {
      notify('Couldn’t set it up', e instanceof Error ? e.message : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!(await ensureKey())) return;
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
      if (!tests) setTestError('It reached the server but didn’t come back. Try again.');
      haptic(tests > 0 ? 'success' : 'warning');
    } catch (e) {
      setTest('failed');
      setTestError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const Mock = step >= 1 && step <= STEPS.length ? mocks[step - 1] : null;
  const isTest = step === TOTAL - 1;

  return (
    <Screen
      back="close"
      modal
      title={`${appName} fare auto-log`}
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
              <Ionicons name="bus-outline" size={30} color={colors.accent} />
            </View>
            <Txt variant="h2" center>
              Bus and train fares, logged
            </Txt>
            <Txt tone="soft" center>
              Tap through the gantry as usual. When {appName} sends your fare alert, Plan logs the exact fare.
            </Txt>
            <Row style={{ gap: 6, alignSelf: 'center', backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Ionicons name={android ? 'logo-android' : 'logo-apple'} size={13} color={colors.textSoft} />
              <Txt variant="caption" tone="soft">
                {android ? 'Android · MacroDroid (free)' : 'iPhone · iOS 27 or later'}
              </Txt>
            </Row>
          </View>
          <Card style={{ gap: 6 }}>
            <TextField icon="apps-outline" label="App that notifies" value={app} onChangeText={setApp} maxLength={40} placeholder={DEFAULT_APP} autoCapitalize="words" />
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              Using another app? Type its name as it appears on your phone.
            </Txt>
          </Card>
          <Card style={{ gap: 4 }}>
            <FieldRow icon="card-outline" label="Log to" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
            <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
              Pick the card linked to {appName}. Fare alerts don’t say which card paid.
            </Txt>
          </Card>
          <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
            <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
              Only {appName} alerts are sent. They wait on the server unencrypted until Plan picks them up, then they’re deleted.
            </Txt>
          </Row>
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
            {android && step === 5 && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label="Text to match" value={AMOUNT_FILTER} />
              </View>
            )}
            {((android && step === 7) || (!android && step === 6)) && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label={android ? 'Link for URL' : 'Link for the URL box'} value={logPaymentUrl()} />
              </View>
            )}
            {android && step === 8 && (
              <View style={{ marginTop: 4 }}>
                {key ? (
                  <CopyRow label="Body (includes your key)" value={appNotificationBody(key, appName)} secret />
                ) : (
                  <Row style={{ gap: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="label">Body</Txt>
                      <Txt variant="caption" tone="muted">
                        Needs your key
                      </Txt>
                    </View>
                    <Button title="Create key" small variant="soft" loading={busy} onPress={() => void ensureKey()} />
                  </Row>
                )}
                <Txt variant="caption" tone="muted">
                  Paste as is. MacroDroid fills in the {'{braces}'}.
                </Txt>
              </View>
            )}
            {!android && step === 7 && (
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
                    <Button title="Create key" small variant="soft" loading={busy} onPress={() => void ensureKey()} />
                  </Row>
                )}
                <Divider />
                <MapRow field="amount" from="Shortcut Input › Message" />
                <Divider />
                <CopyRow label="merchant" value={appName} />
                <Divider />
                <CopyRow label="card (then add Message)" value={`${appName}: `} />
                <Txt variant="caption" tone="muted">
                  card is the app name, a colon, a space, then Message. Keep the space.
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
              {test === 'ok' ? `Plan got it. Your next ${appName} fare will show up in Spending.` : test === 'failed' ? testError : 'Sends a test to Plan. Nothing is added to your budget.'}
            </Txt>
            <Button title={test === 'ok' ? 'Test again' : 'Send a test'} variant="soft" icon="paper-plane-outline" onPress={() => void runTest()} />
          </Card>
          <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
            If something’s off
          </Txt>
          <Card style={{ gap: 12 }}>
            {(android
              ? [
                  ['Nothing shows up', `Check MacroDroid has notification access and ${appName}’s notifications are on.`],
                  ['It stops after a while', 'Set MacroDroid’s battery use to Unrestricted in Settings › Apps.'],
                  ['Logged as 0', 'Check the body was pasted exactly as shown.'],
                  ['See what happened', 'MacroDroid’s System Log shows each run.'],
                ]
              : [
                  ['It never runs', `Check ${appName}’s notifications are on and Run Immediately is set. Try removing Message Contains.`],
                  ['Logged as 0', `Check card is “${appName}: ” then Message.`],
                  ['Hide “Running your automation”', 'In the automation, turn off Notify When Run.'],
                ]
            ).map(([t, d]) => (
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
