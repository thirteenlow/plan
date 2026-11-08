import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CopyRow } from '@/components/CopyRow';
import { ActivationScreen, AddActionsScreen, AllSetScreen, NameScreen, NewShortcutScreen, ScanFieldsScreen, ScanLinkScreen } from '@/components/ScanMocks';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, FieldRow, haptic, notify, Row, SectionTitle, Tap, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { isAndroidDevice } from '@/utils/device';
import { accountForCard, createInboxKey, getInboxKey, importPayments, scanPaymentUrl, scanScreenshot } from '@/cloud/inbox';
import { useActiveBudget, useStore } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';
import { goBack } from '@/utils/nav';
import { GetShortcut } from '@/components/GetShortcut';
import { SCAN_SHORTCUT_LINK } from '@/utils/autoLogSources';

type Mode = 'backTap' | 'actionButton';

const STEPS: { title: string; text: string; Mock: React.ComponentType }[] = [
  { title: 'New shortcut', text: 'Open Shortcuts, tap the Shortcuts tab, then +.', Mock: NewShortcutScreen },
  { title: 'Add two actions', text: 'Search and add “Take Screenshot”, then “Get Contents of URL”.', Mock: AddActionsScreen },
  { title: 'Paste the link', text: 'Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to Form.', Mock: ScanLinkScreen },
  { title: 'Add the fields', text: 'Add two fields. token: Text, paste your key. image: File, then pick Screenshot.', Mock: ScanFieldsScreen },
  { title: 'Name it', text: 'Tap the name at the top › Rename. Call it Scan Payment.', Mock: NameScreen },
];

const ACTIVATION: Record<Mode, { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; sub: string; text: string }> = {
  backTap: { label: 'Triple Tap', icon: 'hand-left-outline', sub: 'Tap the back of your iPhone', text: 'Settings › Accessibility › Touch › Back Tap › Triple Tap, then pick Scan Payment.' },
  actionButton: { label: 'Action Button', icon: 'radio-button-on-outline', sub: 'Press the side button', text: 'Settings › Action Button › Shortcut, then pick Scan Payment.' },
};

const TOTAL = STEPS.length + 3; // intro + steps + activation + all set

/** Guided setup for logging a payment by screenshotting its confirmation screen (read by Claude on the server). */
export default function ScreenshotCaptureScreen() {
  const data = useActiveBudget();
  const status = useCloud((s) => s.status);
  const updateSettings = useStore((s) => s.updateSettings);
  // One-tap (Triple Tap / Action Button) is an iPhone Shortcut; Android scans from Add transaction or here.
  const [android] = useState(isAndroidDevice);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ step?: string }>();
  const [step, setStep] = useState(() => Math.max(0, Math.min(TOTAL - 1, Number(params.step) || 0)));
  const [mode, setMode] = useState<Mode>('backTap');
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [test, setTest] = useState<'idle' | 'sending' | 'ok' | 'failed'>('idle');
  const [testText, setTestText] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'ready') return;
    void getInboxKey().then(setKey);
  }, [status]);

  const accounts = data.accounts.filter((a) => a.onBudget && !a.closed);
  const scanned = data.transactions.some((t) => t.memo?.startsWith('From screenshot'));
  const fallback = accountForCard(data, null);
  const fallbackName = accounts.find((a) => a.id === fallback)?.name;

  const makeKey = async () => {
    if (status !== 'ready') {
      notify('Sign in first', 'Scanning works through your Plan account.');
      return false;
    }
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
    if (!key && !(await makeKey())) return;
    haptic();
    setStep(1);
  };

  /** Pick a screenshot or receipt photo and scan it, exactly like the Shortcut does. Works on any device. */
  const runTest = async () => {
    let token = key;
    if (!token) {
      if (!(await makeKey())) return;
      token = await getInboxKey();
      if (!token) return;
    }
    // JPEG at 0.6 keeps receipt photos well under the size limit.
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    setTest('sending');
    setTestText(null);
    try {
      const read = await scanScreenshot(token, { uri: asset.uri, name: asset.fileName ?? 'screenshot.jpg', type: asset.mimeType ?? 'image/jpeg', file: asset.file });
      await importPayments();
      setTest('ok');
      setTestText(`Read ${read.currency ? `${read.currency} ` : ''}${read.amount}${read.merchant ? ` at ${read.merchant}` : ''}. It’s in Spending to review.${read.usage ? ` Used ${read.usage.input_tokens.toLocaleString()} input + ${read.usage.output_tokens.toLocaleString()} output tokens (${read.usage.model}).` : ''}`);
      haptic('success');
    } catch (e) {
      setTest('failed');
      setTestText(e instanceof Error ? e.message : 'Something went wrong.');
      haptic('warning');
    }
  };

  const Mock = step >= 1 && step <= STEPS.length ? STEPS[step - 1].Mock : null;
  const isActivation = step === STEPS.length + 1;
  const isDone = step === TOTAL - 1;

  const badge = (n: number) => (
    <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Txt variant="label" tone="accent">
        Step {n}
      </Txt>
    </View>
  );

  return (
    <Screen
      back="close"
      modal
      title="AI receipt scan"
      maxWidth={560}
      footer={
        step > 0 ? (
          <Row style={{ gap: 10 }}>
            <Button title="Back" variant="soft" icon="chevron-back" style={{ flex: 1 }} onPress={() => setStep(step - 1)} />
            <Button title={isDone ? 'Done' : 'Next'} style={{ flex: 1.4 }} onPress={() => (isDone ? goBack() : setStep(step + 1))} />
          </Row>
        ) : android || SCAN_SHORTCUT_LINK ? undefined : (
          <Button title={key ? 'Show me the iPhone steps' : 'Set up one-tap on iPhone'} loading={busy} onPress={() => void start()} />
        )
      }
    >
      {!android && (
        <Row style={{ gap: 5, marginBottom: 18 }}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.accent : colors.sunken }} />
          ))}
        </Row>
      )}

      {step === 0 && (
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="scan-outline" size={30} color={colors.accent} />
            </View>
            <Txt variant="h2" center>
              Screenshot it, and it’s logged
            </Txt>
          </View>
          <Card style={{ gap: 10 }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name={test === 'ok' ? 'checkmark-circle' : test === 'failed' ? 'alert-circle' : 'image-outline'} size={22} color={test === 'ok' ? colors.positive : test === 'failed' ? colors.danger : colors.accent} />
              <View style={{ flex: 1 }}>
                <Txt variant="strong">Scan one now</Txt>
                <Txt variant="caption" tone="soft">
                  {testText ?? 'Upload a screenshot or receipt photo. Works on any device.'}
                </Txt>
              </View>
            </Row>
            <Button title={test === 'sending' ? 'Reading…' : 'Choose image'} small variant="soft" icon="image-outline" loading={test === 'sending'} onPress={() => void runTest()} />
          </Card>
          {android ? (
            <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
              <Ionicons name="flash-outline" size={16} color={colors.accent} style={{ marginTop: 2 }} />
              <Txt variant="caption" tone="soft" style={{ flex: 1 }}>
                Quickest: tap + to add a transaction, then Scan receipt.
              </Txt>
            </Row>
          ) : (
            <>
          <SectionTitle title="One tap on iPhone" />
          {SCAN_SHORTCUT_LINK ? (
            <GetShortcut
              name="Scan Payment"
              link={SCAN_SHORTCUT_LINK}
              what="payment"
              logged={scanned}
              status="Your scans show up in Spending."
              flow={['Payment screen', 'Triple-tap or Action Button', 'It’s in Spending']}
              shortcutName="Plan Scan Payment"
              tile={{ color: '#F07BD0', icon: 'logo-usd' }}
              run
              onManual={() => void start()}
            />
          ) : (
            <>
          <Card style={{ gap: 14 }}>
            {(
              [
                ['hand-left-outline', 'Triple-tap the back of your iPhone on any payment screen'],
                ['sparkles-outline', 'AI reads the amount and merchant'],
                ['flash-outline', 'Logged to Plan instantly'],
              ] as const
            ).map(([icon, text]) => (
              <Row key={text} style={{ gap: 12 }}>
                <Ionicons name={icon} size={18} color={colors.accent} />
                <Txt style={{ flex: 1 }}>{text}</Txt>
              </Row>
            ))}
          </Card>
            </>
          )}
          <Row style={{ gap: 6, alignSelf: 'center', backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Ionicons name="logo-apple" size={13} color={colors.textSoft} />
            <Txt variant="caption" tone="soft">
              One tap needs iPhone 8 or later
            </Txt>
          </Row>
            </>
          )}
          <Card style={{ gap: 4 }}>
            <FieldRow icon="card-outline" label="Log to" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
          </Card>
          <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
            <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
              Claude (Anthropic) reads the image, and it’s never stored. Only the details it reads wait on the server until Plan picks them up.
            </Txt>
          </Row>
        </View>
      )}

      {Mock && (
        <View style={{ gap: 16 }}>
          <Mock key={step} />
          <Card style={{ gap: 8 }}>
            {badge(step)}
            <Txt variant="h3">{STEPS[step - 1].title}</Txt>
            <Txt tone="soft">{STEPS[step - 1].text}</Txt>
            {step === 3 && (
              <View style={{ marginTop: 4 }}>
                <CopyRow label="Link for the URL box" value={scanPaymentUrl()} />
              </View>
            )}
            {step === 4 && (
              <View style={{ marginTop: 4 }}>
                {key ? (
                  <CopyRow label="token" value={key} secret />
                ) : (
                  <Row style={{ gap: 10, paddingVertical: 8 }}>
                    <Txt variant="label" style={{ flex: 1 }}>
                      token
                    </Txt>
                    <Button title="Create key" small variant="soft" loading={busy} onPress={() => void makeKey()} />
                  </Row>
                )}
                <Row style={{ gap: 10, paddingVertical: 8 }}>
                  <Txt variant="label" style={{ width: 70 }}>
                    image
                  </Txt>
                  <Txt variant="caption" tone="accent" style={{ flex: 1, textAlign: 'right' }}>
                    File › Screenshot
                  </Txt>
                </Row>
              </View>
            )}
          </Card>
        </View>
      )}

      {isActivation && (
        <View style={{ gap: 16 }}>
          <Row style={{ gap: 10 }}>
            {(Object.keys(ACTIVATION) as Mode[]).map((m) => {
              const on = mode === m;
              return (
                <Tap
                  key={m}
                  onPress={() => {
                    haptic();
                    setMode(m);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{ flex: 1, gap: 6, padding: 14, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }}
                >
                  <Ionicons name={ACTIVATION[m].icon} size={22} color={on ? colors.accent : colors.textSoft} />
                  <Txt variant="strong">{ACTIVATION[m].label}</Txt>
                  <Txt variant="caption" tone="muted">
                    {ACTIVATION[m].sub}
                  </Txt>
                </Tap>
              );
            })}
          </Row>
          <ActivationScreen key={mode} mode={mode} />
          <Card style={{ gap: 8 }}>
            {badge(step)}
            <Txt variant="h3">{mode === 'backTap' ? 'Set up Triple Tap' : 'Set up the Action Button'}</Txt>
            <Txt tone="soft">{ACTIVATION[mode].text}</Txt>
            {mode === 'actionButton' && (
              <Txt variant="caption" tone="muted">
                The Action Button is on iPhone 15 Pro and later. Otherwise, use Triple Tap.
              </Txt>
            )}
          </Card>
        </View>
      )}

      {isDone && (
        <View style={{ gap: 16 }}>
          <AllSetScreen key={mode} mode={mode} />
          <Card style={{ gap: 8 }}>
            <Txt variant="h3">You’re all set</Txt>
            <Txt tone="soft">
              After paying, {mode === 'backTap' ? 'triple-tap the back of your iPhone' : 'press the Action Button'} on the confirmation screen. The payment shows up in Spending to review.
            </Txt>
          </Card>
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
            {test === 'sending' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name={test === 'ok' ? 'checkmark-circle' : test === 'failed' ? 'alert-circle' : 'image-outline'} size={36} color={test === 'ok' ? colors.positive : test === 'failed' ? colors.danger : colors.accent} />
            )}
            <Txt variant="h3" center>
              {test === 'ok' ? 'It works' : test === 'failed' ? 'That didn’t work' : test === 'sending' ? 'Reading…' : 'Try a screenshot'}
            </Txt>
            <Txt tone="soft" center>
              {testText ?? 'Pick a payment screenshot to read and log.'}
            </Txt>
            <Button title={test === 'idle' ? 'Choose screenshot' : 'Try another'} variant="soft" icon="image-outline" disabled={!key || test === 'sending'} onPress={() => void runTest()} />
          </Card>
          <Card style={{ gap: 12 }}>
            {[
              ['See what was read', 'Add Show Notification after Get Contents of URL.'],
              ['Screenshot too large', 'Add Convert Image (JPEG) after Take Screenshot, and use it for image.'],
              ['Nothing found', 'Use it on a screen that shows the amount.'],
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
