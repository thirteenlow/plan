import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, notify, Row, SectionTitle, Toggle, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { disablePush, enablePush, pushConfigured, pushStatus, type PushStatus } from '@/notifications/push';
import { DEFAULT_REMINDERS, syncReminders, time12, TIME_OPTIONS } from '@/notifications/reminders';
import { useActiveBudget, useStore } from '@/store/store';
import type { ReminderPrefs } from '@/store/types';
import { useTheme } from '@/theme';

type TimeField = 'dailyTime' | 'quietStart' | 'quietEnd';
const TIME_TITLES: Record<TimeField, string> = { dailyTime: 'Daily nudge time', quietStart: 'Quiet from', quietEnd: 'Quiet until' };

/** Notifications: turn push on for this device and choose which reminders to get. */
export default function NotificationsScreen() {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const signedIn = useCloud((s) => s.status === 'ready');
  const { colors } = useTheme();
  const prefs = { ...DEFAULT_REMINDERS, ...data.settings.reminders };
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<TimeField | null>(null);
  const petName = data.settings.pet && !data.settings.pet.hidden ? data.settings.pet.name : null;

  const refresh = useCallback(() => void pushStatus().then(setStatus), []);
  useEffect(refresh, [refresh]);

  const update = (patch: Partial<ReminderPrefs>) => {
    updateSettings({ reminders: { ...prefs, ...patch } });
    void syncReminders();
  };

  const turnOn = async () => {
    if (!signedIn) return notify('Sign in first', 'Reminders are sent through your Plan account.');
    setBusy(true);
    try {
      const s = await enablePush();
      setStatus(s);
      if (s === 'on') {
        haptic('success');
        update({ on: true });
      }
    } catch (e) {
      notify('Couldn’t turn on notifications', e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      update({ on: false });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const active = status === 'on' && prefs.on;

  const rows: { key: keyof ReminderPrefs; title: string; text: string }[] = [
    { key: 'logged', title: 'Payments logged automatically', text: 'Right away, when Apple Pay or a scan adds a payment' },
    { key: 'bills', title: 'Bills due', text: 'The day before a scheduled payment' },
    { key: 'review', title: 'Payments to review', text: 'When auto-logged or scanned payments are waiting' },
    { key: 'assign', title: 'Money to assign', text: 'After income arrives' },
    { key: 'overspent', title: petName ? `${petName} gets worried` : 'Overspending', text: 'When a category goes over budget' },
    { key: 'recap', title: 'Monthly recap', text: 'On the 1st of each month' },
  ];

  return (
    <Screen back="close" modal title="Notifications" maxWidth={560}>
      <View style={{ gap: 18 }}>
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 22 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={active ? 'notifications' : 'notifications-outline'} size={26} color={colors.accent} />
          </View>
          {status === 'needsInstall' ? (
            <>
              <Txt variant="h3" center>
                Add Plan to your Home Screen first
              </Txt>
              <Txt tone="soft" center>
                On iPhone, notifications work from the Home Screen app (iOS 16.4 or later). In Safari, tap Share, then Add to Home Screen. Open Plan from there and come back here.
              </Txt>
            </>
          ) : status === 'unsupported' ? (
            <>
              <Txt variant="h3" center>
                Not available here
              </Txt>
              <Txt tone="soft" center>
                This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari, or the Home Screen app on iPhone.
              </Txt>
            </>
          ) : status === 'denied' ? (
            <>
              <Txt variant="h3" center>
                Notifications are blocked
              </Txt>
              <Txt tone="soft" center>
                Allow notifications for Plan in your browser or phone settings, then come back here.
              </Txt>
              <Button title="Check again" small variant="soft" onPress={refresh} />
            </>
          ) : active ? (
            <>
              <Txt variant="h3" center>
                Notifications are on
              </Txt>
              <Txt tone="soft" center>
                Reminders come to this device. Turn them on on your other devices too.
              </Txt>
              <Button title="Turn off" small variant="soft" loading={busy} onPress={() => void turnOff()} />
            </>
          ) : (
            <>
              <Txt variant="h3" center>
                Gentle reminders, only when useful
              </Txt>
              <Txt tone="soft" center>
                Bills, payments to review, money to assign and a daily nudge. Pick exactly which ones below.
              </Txt>
              <Button title={signedIn ? 'Turn on notifications' : 'Sign in to turn on'} icon="notifications-outline" loading={busy} onPress={() => (signedIn ? void turnOn() : router.push('/account'))} />
              {!pushConfigured() && (
                <Txt variant="caption" tone="muted" center>
                  Notifications aren’t set up on this site yet.
                </Txt>
              )}
            </>
          )}
        </Card>

        {!active && (
          <Txt variant="caption" tone="muted" center>
            Turn on notifications to choose your reminders.
          </Txt>
        )}
        {/* Greyed out and not tappable until notifications are on for this device. */}
        <View pointerEvents={active ? 'auto' : 'none'} accessibilityElementsHidden={!active} style={{ gap: 18, opacity: active ? 1 : 0.4 }}>
          <SectionTitle title="Remind me about" />
          <Card style={{ gap: 4 }}>
            <View style={{ paddingVertical: 10, gap: 8 }}>
              <Row style={{ gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="strong">Daily nudge</Txt>
                  <Txt variant="caption" tone="muted">
                    Only if you haven’t logged anything that day
                  </Txt>
                </View>
                <Toggle label="Daily nudge" value={prefs.daily} onChange={(v) => update({ daily: v })} />
              </Row>
              {prefs.daily && <FieldRow icon="time-outline" label="At" value={time12(prefs.dailyTime)} onPress={() => setPicking('dailyTime')} />}
            </View>
            {rows.map((r) => (
              <View key={r.key}>
                <Divider />
                <Row style={{ gap: 12, paddingVertical: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="strong">{r.title}</Txt>
                    <Txt variant="caption" tone="muted">
                      {r.text}
                    </Txt>
                  </View>
                  <Toggle label={r.title} value={prefs[r.key] !== false} onChange={(v) => update({ [r.key]: v })} />
                </Row>
              </View>
            ))}
          </Card>

          <SectionTitle title="Privacy and quiet" />
          <Card style={{ gap: 4 }}>
            <View style={{ paddingVertical: 10, gap: 8 }}>
              <Row style={{ gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="strong">Quiet hours</Txt>
                  <Txt variant="caption" tone="muted">
                    Reminders due then wait until quiet hours end
                  </Txt>
                </View>
                <Toggle label="Quiet hours" value={prefs.quiet} onChange={(v) => update({ quiet: v })} />
              </Row>
              {prefs.quiet && (
                <Row style={{ gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <FieldRow icon="moon-outline" label="From" value={time12(prefs.quietStart!)} onPress={() => setPicking('quietStart')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldRow icon="sunny-outline" label="Until" value={time12(prefs.quietEnd!)} onPress={() => setPicking('quietEnd')} />
                  </View>
                </Row>
              )}
            </View>
            <Divider />
            <Row style={{ gap: 12, paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt variant="strong">Show amounts and names</Txt>
                <Txt variant="caption" tone="muted">
                  Off: notifications say “A bill is due tomorrow” without details, so nothing private shows on your lock screen or reaches the server.
                </Txt>
              </View>
              <Toggle label="Show amounts and names" value={prefs.details} onChange={(v) => update({ details: v })} />
            </Row>
          </Card>
        </View>
      </View>

      <PickerSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={picking ? TIME_TITLES[picking] : ''}
        searchPlaceholder="Search, e.g. 9:30"
        selectedKey={picking ? prefs[picking] : null}
        items={TIME_OPTIONS.map((t) => ({ key: t, title: time12(t) }))}
        onSelect={(t) => {
          if (picking) update({ [picking]: t });
          setPicking(null);
        }}
      />
    </Screen>
  );
}
