import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CopyRow } from '@/components/CopyRow';
import { Screen } from '@/components/Screen';
import { Button, Card, Divider, haptic, notify, Row, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { createInboxKey, getInboxKey, importPayments, logPaymentUrl, sendTestPayment } from '@/cloud/inbox';
import { useActiveBudget } from '@/store/store';
import { RADIUS, useTheme } from '@/theme';

/** iPhone guide for a bank's alert emails: a Shortcuts "Email" automation sends each one to Plan. */
export default function EmailPayScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const data = useActiveBudget();
  const status = useCloud((s) => s.status);
  const { colors } = useTheme();
  const source = data.settings.autoLogSources?.find((s) => s.id === id);
  const name = source?.name ?? 'Bank emails';
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<'idle' | 'sending' | 'ok' | 'failed'>('idle');
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'ready') void getInboxKey().then(setKey);
  }, [status]);

  const makeKey = async () => {
    if (status !== 'ready') return notify('Sign in first', 'Auto-logging works through your Plan account.');
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
      if (!tests) setTestError('The test reached the server but didn’t come back. Pull down to refresh, then try again.');
      haptic(tests > 0 ? 'success' : 'warning');
    } catch (e) {
      setTest('failed');
      setTestError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const steps: { title: string; text: string; extra?: React.ReactNode }[] = [
    { title: 'New automation', text: 'Open Shortcuts › Automation › +, then tap Email.' },
    {
      title: 'Pick the emails',
      text: source?.sender
        ? `Tap Sender and add ${source.sender}. Optional: Subject contains “Transaction Alerts”. Turn Automation on.`
        : 'Tap Sender and add your bank’s alert address. Optional: a word the subject always has. Turn Automation on.',
      extra: source?.sender ? <CopyRow label="Sender" value={source.sender} /> : undefined,
    },
    { title: 'Add the action', text: 'Search “Get Contents of URL” and tap it. Tap URL and paste the link below. Tap the arrow, set Method to POST and Request Body to JSON.', extra: <CopyRow label="Link for the URL box" value={logPaymentUrl()} /> },
    {
      title: 'Add the fields',
      text: 'Add a Text field for each row, keys in lowercase. For amount, tap the value and pick Content from the bar above the keyboard.',
      extra: (
        <View style={{ gap: 2 }}>
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
          <Row style={{ gap: 10, paddingVertical: 8 }}>
            <Txt variant="label" style={{ width: 70 }}>
              amount
            </Txt>
            <Txt variant="caption" tone="accent" style={{ flex: 1, textAlign: 'right' }}>
              Content
            </Txt>
          </Row>
          <Divider />
          <CopyRow label="merchant" value={name} />
          <Divider />
          <Row style={{ gap: 10, paddingVertical: 8 }}>
            <Txt variant="label" style={{ width: 70 }}>
              card
            </Txt>
            <Txt variant="caption" tone="muted" style={{ flex: 1, textAlign: 'right' }}>
              Optional: an account’s name
            </Txt>
          </Row>
        </View>
      ),
    },
    { title: 'Name and save', text: `Name it “${name}” and save. Each alert email now goes to Plan.` },
  ];

  return (
    <Screen back="close" modal title={`${name} auto-log`} subtitle="iPhone · email automation" maxWidth={560}>
      <View style={{ gap: 16 }}>
        <Txt tone="soft">Plan reads the email’s amount and who you paid (lines like “Amount:” and “To:”). Money sent to your own account is logged as money in.</Txt>
        {steps.map((s, i) => (
          <Card key={s.title} style={{ gap: 8 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Txt variant="label" tone="accent">
                Step {i + 1}
              </Txt>
            </View>
            <Txt variant="h3">{s.title}</Txt>
            <Txt tone="soft">{s.text}</Txt>
            {s.extra}
          </Card>
        ))}

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
            {test === 'ok' ? 'Plan got it. Your next alert email will show up in Spending.' : test === 'failed' ? testError : 'Sends a test to Plan. Nothing is added to your budget.'}
          </Txt>
          <Button title={test === 'ok' ? 'Test again' : 'Send a test'} variant="soft" icon="paper-plane-outline" disabled={!key} onPress={() => void runTest()} />
        </Card>

        <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
          If something’s off
        </Txt>
        <Card style={{ gap: 12 }}>
          {[
            ['Logged as 0', 'Check amount is set to Content, not Subject.'],
            ['Nothing shows up', 'Check Automation is on and the sender address is exactly right.'],
            ['Wrong account', 'Set Log to for this source in Auto-log.'],
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
    </Screen>
  );
}
