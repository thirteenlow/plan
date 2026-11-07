import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CopyRow } from '@/components/CopyRow';
import { notifyDroidMocks } from '@/components/AndroidMocks';
import { shortcuts27Mocks } from '@/components/Shortcuts27Mocks';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, notify, Row, TextField, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { accountForCard, appNotificationBody, createInboxKey, getInboxKey, importPayments, logPaymentUrl, sendTestPayment } from '@/cloud/inbox';
import { isAndroidDevice } from '@/utils/device';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { goBack } from '@/utils/nav';

const DEFAULT_APP = 'SimplyGo';

/** MacroDroid's text filter: only notifications with an amount like 0.20. */
const AMOUNT_FILTER = String.raw`\d[.,]\d\d`;

const androidSteps = (app: string, words: string): { title: string; text: string }[] => [
  { title: 'Get MacroDroid', text: 'Install it free from the Play Store and open it.' },
  { title: 'New macro', text: 'Tap Add Macro, then + in the red Triggers box.' },
  { title: 'Choose Notification', text: 'Tap Device Events › Notification. Allow access if asked.' },
  { title: `Pick ${app}`, text: `Choose Notification Received › Select Applications. Tick ${app}, then OK.` },
  { title: 'Only payments', text: words ? `Choose Contains, paste the words below (Enable regex off), then OK. Only ${app} alerts with them run it.` : 'Choose Contains, paste the text below, tick Enable regex, then OK. It matches any amount like 14.60.' },
  { title: 'Add the action', text: 'Tap + in the blue Actions box › Web Interactions › HTTP Request.' },
  { title: 'Paste the link', text: 'Set Request method to POST. Paste the link below into URL.' },
  { title: 'Paste the body', text: 'Open Content Body, set Content type to application/json and paste the text below. Tap ✓.' },
  { title: 'Save', text: `Name it “${app} Auto-log” and tap ✓. Done!` },
];

const iosSteps = (app: string, words: string): { title: string; text: string }[] => [
  { title: 'New shortcut', text: 'Open Shortcuts and tap + at the bottom.' },
  { title: 'Tap Edit', text: 'Skip “Describe a shortcut”: tap Edit at the top right.' },
  { title: 'Add the trigger', text: 'In the sheet, tap Automation, then Notification.' },
  {
    title: `Pick ${app}`,
    text: words
      ? `Tap App and pick ${app}. Tap Add Filter, change Title to Message, and type “${words}” in the box. Only ${app} alerts with these words run it.`
      : `Tap App and pick ${app}. Tap Add Filter, change Title to Message, and type a full stop (.) in the box. It catches amounts in any currency, like SGD 14.60.`,
  },
  { title: 'Add the action', text: 'Search “Get Contents of URL” and tap it.' },
  { title: 'Paste the link', text: 'Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to JSON.' },
  { title: 'Add the fields', text: 'Add a Text field for each row below, keys in lowercase. For amount, tap the value, scroll the bar above the keyboard, tap Notification, then tap it again and pick Body. No card field needed.' },
  { title: 'Name and save', text: `Tap the name › Rename to “${app} Auto-log”. Tap the button at the top right to save.` },
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
  // `?app=` comes from an Auto-log source (e.g. Grab); SimplyGo otherwise.
  const params = useLocalSearchParams<{ step?: string; app?: string; filter?: string }>();
  const [app, setApp] = useState(params.app || DEFAULT_APP);
  const appName = app.trim() || DEFAULT_APP;
  // SimplyGo talks about fares; any other app about payments.
  const fares = appName.toLowerCase() === DEFAULT_APP.toLowerCase();
  const [android] = useState(isAndroidDevice);
  // The source's filter words (Grab: "has been charged"); SimplyGo's are "Fare". None: any amount.
  const words = (params.filter ?? (fares ? 'Fare' : '')).trim();
  const STEPS = android ? androidSteps(appName, words) : iosSteps(appName, words);
  const TOTAL = STEPS.length + 2; // intro + steps + test
  const mocks = useMemo(() => (android ? notifyDroidMocks(appName) : shortcuts27Mocks('notify', appName, words || '.')), [android, appName, words]);
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
      title={appName === DEFAULT_APP ? `${appName} fare auto-log` : `${appName} auto-log`}
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
              {fares ? 'Bus and train fares, logged' : `${appName} payments, logged`}
            </Txt>
            <Txt tone="soft" center>
              {fares ? `Tap through the gantry as usual. When ${appName} sends your fare alert, Plan logs the exact fare.` : `When ${appName} sends a payment alert, Plan logs it. Review it in Spending.`}
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
              {fares ? 'Fares go here.' : 'Payments go here.'} Pick the card linked to {appName}.
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
                <CopyRow label="Text to match" value={words || AMOUNT_FILTER} />
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
                <MapRow field="amount" from="Notification › Body" />
                <Divider />
                <CopyRow label="merchant" value={appName} />
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
              {test === 'ok' ? `Plan got it. Your next ${appName} ${fares ? 'fare' : 'payment'} will show up in Spending.` : test === 'failed' ? testError : 'Sends a test to Plan. Nothing is added to your budget.'}
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
                  ['It never runs', `Check ${appName}’s notifications are on and the filter is Message contains ${words || '.'}, and your alert has those words.`],
                  ['Logged as 0', 'Check amount is Notification › Body.'],
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
