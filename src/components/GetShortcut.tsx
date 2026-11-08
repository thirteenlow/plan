import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Button, Card, Chip, haptic, notify, Row, Tap, Txt } from '@/components/ui';
import { AddShortcutScreen, LoggedScreen, QuestionsScreen, TurnOnScreen } from '@/components/GetShortcutMocks';
import { ActivationScreen, AllSetScreen } from '@/components/ScanMocks';
import { useCloud } from '@/cloud/cloudStore';
import { createInboxKey, getInboxKey } from '@/cloud/inbox';
import { useTheme } from '@/theme';
import { openApp } from '@/utils/openLink';

type Icon = React.ComponentProps<typeof Ionicons>['name'];

/**
 * iPhone setup in a few taps: copies the Plan key, then opens the ready-made shortcut. Adding it asks for the key
 * (paste) and brings its trigger; iOS adds the automation switched off, so the user turns it on. `status`: what's been logged from this source so far.
 */
export function GetShortcut({
  name,
  shortcutName,
  trigger,
  link,
  what,
  logged,
  status,
  onManual,
  run,
  appName,
  email,
  flow = ['You pay', 'iPhone tells Plan', 'It’s in Spending'],
}: {
  name: string;
  /** What the shortcut is called once added ("Plan Wallet alerts"), and its trigger, for the animations. */
  shortcutName: string;
  trigger?: { icon: Icon; text: string; value: string };
  link: string;
  what: string;
  logged: boolean;
  status: string;
  onManual?: () => void;
  /** A shortcut with no trigger (Scan Payment): run with Back Tap or the Action Button, instead of "Turn it on". */
  run?: boolean;
  /** The general App alerts shortcut: it also asks for the app's name, and comes set to another app unless it's this one. */
  appName?: { name: string; presetApp: string };
  /** The general Bank emails shortcut: it also asks for the source's name, and the sender is changed after adding. */
  email?: { name: string; sender?: string; presetSender: string };
  flow?: [string, string, string];
}) {
  const { colors } = useTheme();
  const cloud = useCloud((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  // The step whose animation shows: plays through on its own until a step is tapped.
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<'backTap' | 'actionButton'>('backTap');
  useEffect(() => {
    if (pinned) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % 4), 7500);
    return () => clearTimeout(t);
  }, [active, pinned]);

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

  // The general shortcuts all arrive with the same name, so each gets its own.
  const rename = (source: string) => ` Then tap its name at the top › Rename, and call it “Plan ${source}”, so you can tell it apart.`;
  // Plan can only see the end result, so the steps tick together once a payment has come through.
  const steps: { icon: Icon; title: string; text: string; done: boolean; action?: React.ReactNode }[] = [
    { icon: 'download-outline', title: 'Get the shortcut', text: 'Plan copies your key, then opens it. Tap Add Shortcut.', done: logged },
    {
      icon: 'clipboard-outline',
      title: appName ? 'Paste your key, then the app' : email ? 'Paste your key, then the name' : 'Paste your key',
      text: appName
        ? `When it asks for your key, tap the box and Paste. When it asks which app, type ${appName.name}.`
        : email
          ? `When it asks for your key, tap the box and Paste. When it asks what it’s called, type ${email.name}.`
          : 'When it asks, tap the box and Paste.',
      done: logged,
    },
    run
      ? {
          icon: 'hand-left-outline',
          title: 'Choose how to run it',
          text:
            mode === 'backTap'
              ? `Settings › Accessibility › Touch › Back Tap › Triple Tap, then pick ${shortcutName}.`
              : `Settings › Action Button, swipe to Shortcut, then pick ${shortcutName}.`,
          done: logged,
        }
      : {
      icon: 'toggle-outline',
      title: 'Turn it on',
      text: email
        ? `iPhone adds it switched off. Open it in Shortcuts, tap ${email.presetSender} at the top and change it to ${email.sender ?? 'your bank’s alert address (the “From” of an alert email)'}. Then turn Automation on and Confirm Before Run off.${rename(email.name)}`
        : appName && appName.name.toLowerCase() !== appName.presetApp.toLowerCase()
          ? `iPhone adds it switched off and set to ${appName.presetApp}. Open it in Shortcuts, tap ${appName.presetApp} at the top and pick ${appName.name} instead, then turn Automation on. Leave Notify off.${rename(appName.name)}`
          : appName
            ? `iPhone adds it switched off. Open it in Shortcuts and, at the top, turn Automation on. Leave Notify off.${rename(appName.name)}`
            : 'iPhone adds it switched off. Open it in Shortcuts (its name starts with “Plan”) and, at the top, turn Automation on. Leave Notify (or Confirm Before Run) off.',
      done: logged,
      action: <Button title="Open Shortcuts" variant="soft" small icon="open-outline" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => void openApp('shortcuts://').catch(() => undefined)} />,
    },
    run
      ? { icon: 'checkmark-done-outline', title: 'Try it', text: logged ? status : `On a payment screen, ${mode === 'backTap' ? 'triple-tap the back of your iPhone' : 'press the Action Button'}. The ${what} shows up in Spending to review.`, done: logged }
      : { icon: 'checkmark-done-outline', title: 'Pay as usual', text: logged ? status : `Your next ${what} shows up in Spending to review.`, done: logged },
  ];

  const changeTo = appName && appName.name.toLowerCase() !== appName.presetApp.toLowerCase() ? appName.name : email ? (email.sender ?? 'your bank’s address') : undefined;
  const ask = appName ? { question: 'Which app is this for?', answer: appName.name } : email ? { question: 'What is this source called in Plan?', answer: email.name } : undefined;
  const mocks = [
    <AddShortcutScreen key="add" name={shortcutName} />,
    <QuestionsScreen key="ask" name={shortcutName} ask={ask} />,
    run ? (
      <ActivationScreen key={mode} mode={mode} />
    ) : (
      <TurnOnScreen key="on" name={shortcutName} trigger={trigger ?? { icon: 'notifications', text: 'When I receive a notification from', value: name }} change={changeTo} rename={appName || email ? `Plan ${name}` : undefined} />
    ),
    run ? <AllSetScreen key={`set-${mode}`} mode={mode} /> : <LoggedScreen key="paid" what={what === 'tap' ? 'Paid with Apple Pay' : 'Payment successful'} />,
  ];
  const pick = (i: number) => {
    setActive(i);
    setPinned(true);
  };

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

      {logged && (
        <Row style={{ gap: 8, backgroundColor: colors.positiveSoft, borderRadius: 12, padding: 10 }}>
          <Ionicons name="checkmark-circle" size={18} color={colors.positive} />
          <Txt variant="strong" style={{ flex: 1, color: colors.positive }}>
            It’s working
          </Txt>
        </Row>
      )}
      {run && (
        <Row style={{ gap: 8, justifyContent: 'center' }}>
          <Chip label="Triple Tap" icon="hand-left-outline" active={mode === 'backTap'} onPress={() => setMode('backTap')} />
          <Chip label="Action Button" icon="radio-button-on-outline" active={mode === 'actionButton'} onPress={() => setMode('actionButton')} />
        </Row>
      )}
      <View key={active} style={{ alignItems: 'center' }}>
        {mocks[active]}
      </View>
      <View style={{ gap: 6 }}>
        {steps.map((s, i) => (
          <Tap
            key={s.title}
            onPress={() => pick(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: active === i }}
            accessibilityLabel={`Step ${i + 1}: ${s.title}. Show how`}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 8, borderRadius: 12, backgroundColor: active === i ? colors.accentSoft : 'transparent' }}
          >
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: s.done ? colors.positive : active === i ? colors.accent : colors.sunken, alignItems: 'center', justifyContent: 'center' }}>
              {s.done ? (
                <Ionicons name="checkmark" size={15} color="#fff" />
              ) : (
                <Txt variant="label" style={{ color: active === i ? '#fff' : colors.textSoft }}>
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
          </Tap>
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
