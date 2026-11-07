import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, Card, haptic, notify, Row, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { createInboxKey, getInboxKey } from '@/cloud/inbox';
import { useTheme } from '@/theme';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

/**
 * iPhone setup in a few taps: copies the Plan key, then opens the ready-made shortcut. Adding it asks for the key
 * (paste) and brings its trigger; iOS adds the automation switched off, so the user turns it on. `status`: what's been logged from this source so far.
 */
export function GetShortcut({
  name,
  link,
  what,
  logged,
  status,
  onManual,
  run,
  flow = ['You pay', 'iPhone tells Plan', 'It’s in Spending'],
}: {
  name: string;
  link: string;
  what: string;
  logged: boolean;
  status: string;
  onManual?: () => void;
  /** A shortcut with no trigger (Scan Payment): how to run it, instead of "Turn it on". */
  run?: { title: string; text: string };
  flow?: [string, string, string];
}) {
  const { colors } = useTheme();
  const cloud = useCloud((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  const get = async () => {
    if (cloud !== 'ready') return notify('Sign in first', 'Auto-log works through your Plan account.');
    setBusy(true);
    try {
      const key = (await getInboxKey()) ?? (await createInboxKey());
      await Clipboard.setStringAsync(key);
      haptic('success');
      setOpened(true);
      await Linking.openURL(link);
    } catch (e) {
      notify('Couldn’t open the shortcut', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const steps: { icon: Icon; title: string; text: string; done: boolean; action?: React.ReactNode }[] = [
    { icon: 'download-outline', title: 'Get the shortcut', text: 'Plan copies your key, then opens it. Tap Add Shortcut.', done: opened },
    { icon: 'clipboard-outline', title: 'Paste your key', text: 'When it asks, tap the box and Paste.', done: opened && logged },
    run
      ? { icon: 'hand-left-outline', title: run.title, text: run.text, done: logged }
      : {
      icon: 'toggle-outline',
      title: 'Turn it on',
      text: 'iPhone adds it switched off. Open it in Shortcuts (its name starts with “Plan”) and, at the top, turn Automation on. Leave Notify (or Confirm Before Run) off.',
      done: logged,
      action: <Button title="Open Shortcuts" variant="soft" small icon="open-outline" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => void Linking.openURL('shortcuts://').catch(() => undefined)} />,
    },
    run
      ? { icon: 'checkmark-done-outline', title: 'Try it', text: logged ? status : `On a payment screen, run it. The ${what} shows up in Spending to review.`, done: logged }
      : { icon: 'checkmark-done-outline', title: 'Pay as usual', text: logged ? status : `Your next ${what} shows up in Spending to review.`, done: logged },
  ];

  return (
    <Card style={{ gap: 14 }}>
      <Row style={{ justifyContent: 'center', gap: 8 }}>
        {(
          [
            ['card-outline', flow[0]],
            ['phone-portrait-outline', flow[1]],
            ['receipt-outline', flow[2]],
          ] as [Icon, string][]
        ).map(([icon, label], i) => (
          <Row key={label} style={{ gap: 8 }}>
            {i > 0 && <Ionicons name="arrow-forward" size={14} color={colors.muted} />}
            <View style={{ alignItems: 'center', gap: 4, width: 74 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={19} color={colors.accent} />
              </View>
              <Txt variant="caption" tone="soft" center>
                {label}
              </Txt>
            </View>
          </Row>
        ))}
      </Row>
      <Txt variant="caption" tone="muted" center>
        {run ? 'You set it up once, then it’s one tap.' : 'Your iPhone does this in the background. You set it up once.'}
      </Txt>

      <View style={{ gap: 12 }}>
        {steps.map((s, i) => (
          <Row key={s.title} style={{ gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: s.done ? colors.positive : colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
              {s.done ? (
                <Ionicons name="checkmark" size={15} color="#fff" />
              ) : (
                <Txt variant="label" tone="soft">
                  {i + 1}
                </Txt>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="strong">{s.title}</Txt>
              <Txt variant="caption" tone="soft">
                {s.text}
              </Txt>
              {s.action}
            </View>
          </Row>
        ))}
      </View>

      <Button title={opened ? 'Open it again' : `Get the ${name} shortcut`} icon="download-outline" loading={busy} onPress={() => void get()} />
      <Txt variant="caption" tone="muted">
        Already set one up by hand? Turn the old one off so payments aren’t logged twice.
      </Txt>
      {onManual && <Button title="Set it up by hand instead" variant="soft" small onPress={onManual} />}
    </Card>
  );
}
