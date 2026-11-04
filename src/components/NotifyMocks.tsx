import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { ActionSearchScreen, AutomationTabScreen, C, Chip, Group, H, HomeScreen, LinkScreen, ListRow, Phone, Scroller, T, Taps, usePhase, W } from './ShortcutMocks';

/*
 * Drawn iPhone screens for the payment-notification setup guide (iOS 27's Notification automation trigger).
 * Built from the same pieces as the Apple Pay guide (ShortcutMocks), with `app` naming the app that notifies.
 */

function NotifyTriggerScreen() {
  const rows: [string, React.ComponentProps<typeof Ionicons>['name'], string, string][] = [
    ['Time of Day', 'time', '#FF9500', '“At 8:00 AM, weekdays”'],
    ['Wi-Fi', 'wifi', C.blue, '“When my iPhone joins home Wi-Fi”'],
    ['App', 'apps', '#8E8E93', '“When an app is opened”'],
    ['Wallet', 'wallet', '#1C1C1E', '“When I tap a Wallet card or pass”'],
    ['Message', 'chatbubble', C.green, '“When I get a message from Mum”'],
    ['Notification', 'notifications', '#FF3B30', '“When an app sends a notification”'],
    ['Battery Level', 'battery-half', C.green, '“When battery rises above 50%”'],
    ['Charger', 'flash', C.green, '“When connected to power”'],
  ];
  return (
    <Phone>
      <T size={13} weight="bold" style={{ textAlign: 'center', marginTop: 4, marginBottom: 8 }}>
        New Automation
      </T>
      <View style={{ height: H - 60, overflow: 'hidden' }}>
        <Scroller distance={120}>
          <Group>
            {rows.map(([t, ic, color, sub], i) => (
              <ListRow key={t} icon={ic} color={color} title={t} sub={sub} last={i === rows.length - 1} />
            ))}
          </Group>
        </Scroller>
      </View>
      <Taps points={[{ x: 70, y: 30 + 5 * 37 + 20 - 120 }]} />
    </Phone>
  );
}

function NotifyAppScreen({ app }: { app: string }) {
  const phase = usePhase(3);
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 10 }}>
        <Ionicons name="chevron-back" size={15} color={C.blue} />
        <T size={12} weight="semibold">
          Notification
        </T>
        <View style={{ backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
          <T size={9} weight="semibold" color="#fff">
            Next
          </T>
        </View>
      </View>
      <T size={9} color={C.soft} style={{ paddingHorizontal: 18, marginBottom: 4 }}>
        WHEN A NOTIFICATION COMES FROM
      </T>
      <Group>
        <ListRow icon="bus" color="#E5322D" title={app} right={<Ionicons name="checkmark" size={13} color={C.blue} />} last />
      </Group>
      <T size={9} color={C.soft} style={{ paddingHorizontal: 18, marginTop: 12, marginBottom: 4 }}>
        MESSAGE CONTAINS (OPTIONAL)
      </T>
      <Group>
        <View style={{ height: 30, justifyContent: 'center', paddingHorizontal: 10 }}>
          <T size={10} color={phase >= 1 ? C.text : C.soft}>
            {phase >= 1 ? '$' : 'Any message'}
          </T>
        </View>
      </Group>
      <Group style={{ marginTop: 12 }}>
        <ListRow icon="checkmark-circle" color="#8E8E93" title="Run After Confirmation" right={<View />} />
        <ListRow icon="flash" color={C.green} title="Run Immediately" last right={phase >= 2 ? <Ionicons name="checkmark" size={13} color={C.blue} /> : <View />} />
      </Group>
      <Taps key={phase} points={[[{ x: 90, y: 44 + 18 }, { x: 90, y: 44 + 37 + 12 + 16 + 15 }, { x: W - 30, y: 44 + 37 + 28 + 30 + 12 + 37 + 18 }][phase]]} />
    </Phone>
  );
}

function NotifyFieldsScreen({ app }: { app: string }) {
  const phase = usePhase(5, 1500);
  const rows: [string, React.ReactNode][] = [
    ['token', <T key="t" size={8.5} color={C.soft}>Xk29…</T>],
    ['amount', <Chip key="a" label="Message" />],
    ['merchant', <T key="m" size={8.5}>{app}</T>],
    [
      'card',
      <View key="c" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <T size={8.5}>{`${app}: `}</T>
        <Chip label="Message" />
      </View>,
    ],
  ];
  const shown = rows.slice(0, Math.min(rows.length, phase + 1));
  return (
    <Phone>
      <Group style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 30, paddingHorizontal: 10 }}>
          <T size={10}>Request Body</T>
          <T size={10} color={C.blue} weight="semibold">
            JSON
          </T>
        </View>
        {shown.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <Ionicons name="remove-circle" size={12} color="#FF3B30" />
            <T size={9.5} style={{ width: 52 }}>
              {k}
            </T>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>{v}</View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: C.line }}>
          <Ionicons name="add-circle" size={12} color={C.green} />
          <T size={9.5}>Add new field</T>
        </View>
      </Group>
      <T size={9} color={C.soft} style={{ textAlign: 'center', marginTop: 12 }}>
        {['token: paste your key', 'amount: Shortcut Input › Message', `merchant: type ${app}`, `card: “${app}: ” then Message`, 'All four, in lowercase'][phase]}
      </T>
      {phase < 4 && <Taps key={phase} points={[{ x: 70, y: 10 + 30 + (phase + 1) * 30 + 15 }]} />}
    </Phone>
  );
}

function NotifySaveScreen({ app }: { app: string }) {
  return (
    <Phone>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, marginBottom: 12 }}>
        <Ionicons name="chevron-back" size={15} color={C.blue} />
        <T size={12} weight="semibold">
          Notification
        </T>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      </View>
      <Group>
        <ListRow icon="notifications" color="#FF3B30" title={`When ${app} sends a notification`} sub="Run Immediately" right={<View />} />
        <ListRow icon="globe" color="#34C759" title="Get Contents of URL" sub="POST · log_payment" last right={<View />} />
      </Group>
      <Taps points={[{ x: W - 26, y: 12 }]} />
    </Phone>
  );
}

/** One per guide step, in order. */
export function notifyMocks(app: string): React.ComponentType[] {
  return [
    HomeScreen,
    AutomationTabScreen,
    NotifyTriggerScreen,
    () => <NotifyAppScreen app={app} />,
    () => <ActionSearchScreen title={`When ${app} notifies…`} />,
    () => <LinkScreen title={`When ${app} notifies`} />,
    () => <NotifyFieldsScreen app={app} />,
    () => <NotifySaveScreen app={app} />,
  ];
}
