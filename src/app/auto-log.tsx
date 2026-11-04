import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PickerSheet } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, Row, TextField, Toggle, Txt } from '@/components/ui';
import { accountForCard } from '@/cloud/inbox';
import { appsToWatch, importNativePayments, PaymentNotifications } from '@/cloud/nativePayments';
import { useActiveBudget, useStore } from '@/store/store';
import { useTheme } from '@/theme';

const SIMPLYGO = 'simplygo';
const PACKAGE = /^[a-z][\w]*(\.[\w]+)+$/;

/** Android app: Plan reads payment notifications itself (no MacroDroid, no server). */
export default function AutoLogScreen() {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  const saved = PaymentNotifications?.getConfig() ?? { wallets: false, apps: [] };
  const names = saved.apps.filter((a) => !PACKAGE.test(a));
  const [access, setAccess] = useState(() => PaymentNotifications?.hasAccess() ?? false);
  const [wallets, setWallets] = useState(saved.wallets);
  const [simplyGo, setSimplyGo] = useState(names.includes(SIMPLYGO));
  const [more, setMore] = useState(names.filter((n) => n !== SIMPLYGO).join(', '));
  const [picking, setPicking] = useState(false);

  // Coming back from Android Settings: see whether access was allowed, and log anything already kept.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setAccess(PaymentNotifications?.hasAccess() ?? false);
      importNativePayments();
    });
    return () => sub.remove();
  }, []);

  const save = (next: { wallets?: boolean; simplyGo?: boolean; more?: string }) => {
    const w = next.wallets ?? wallets;
    const s = next.simplyGo ?? simplyGo;
    const extra = (next.more ?? more).split(',').map((x) => x.trim()).filter(Boolean);
    PaymentNotifications?.configure(w, appsToWatch([...(s ? ['SimplyGo'] : []), ...extra]));
  };

  const accounts = data.accounts.filter((a) => a.onBudget && !a.closed);
  const fallback = accountForCard(data, null);
  const fallbackName = accounts.find((a) => a.id === fallback)?.name;
  const on = access && (wallets || simplyGo || !!more.trim());

  return (
    <Screen back="close" modal title="Payment auto-log" maxWidth={560}>
      <View style={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={on ? 'checkmark-circle' : 'phone-portrait-outline'} size={30} color={colors.accent} />
          </View>
          <Txt variant="h2" center>
            {on ? 'Auto-log is on' : 'Tap to pay, and it’s logged'}
          </Txt>
          <Txt tone="soft" center>
            Plan reads your payment notifications and logs each one. Review them in Spending.
          </Txt>
        </View>

        <Card style={{ gap: 10 }}>
          <Row style={{ gap: 10 }}>
            <Ionicons name={access ? 'checkmark-circle' : 'notifications-outline'} size={20} color={access ? colors.positive : colors.accent} />
            <Txt variant="strong" style={{ flex: 1 }}>
              Notification access
            </Txt>
            <Txt variant="label" tone={access ? 'positive' : 'muted'}>
              {access ? 'Allowed' : 'Off'}
            </Txt>
          </Row>
          <Txt variant="caption" tone="muted">
            Plan only keeps notifications with an amount, from the apps you turn on below. They stay on this phone.
          </Txt>
          {!access && <Button title="Allow notification access" icon="open-outline" onPress={() => PaymentNotifications?.openAccessSettings()} />}
        </Card>

        <Card style={{ gap: 4 }}>
          <Row style={{ gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="strong">Google & Samsung Wallet</Txt>
              <Txt variant="caption" tone="muted">
                Every tap to pay
              </Txt>
            </View>
            <Toggle
              label="Google and Samsung Wallet"
              value={wallets}
              onChange={(v) => {
                setWallets(v);
                save({ wallets: v });
              }}
            />
          </Row>
          <Divider />
          <Row style={{ gap: 12, paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="strong">SimplyGo fares</Txt>
              <Txt variant="caption" tone="muted">
                From each Trip Fare Alert
              </Txt>
            </View>
            <Toggle
              label="SimplyGo fares"
              value={simplyGo}
              onChange={(v) => {
                setSimplyGo(v);
                save({ simplyGo: v });
              }}
            />
          </Row>
          <Divider />
          <View style={{ paddingTop: 8 }}>
            <TextField
              icon="apps-outline"
              label="More apps"
              value={more}
              onChangeText={setMore}
              onBlur={() => save({})}
              maxLength={120}
              placeholder="e.g. Grab, DBS digibank"
              autoCapitalize="words"
            />
          </View>
        </Card>

        <Card style={{ gap: 4 }}>
          <FieldRow icon="card-outline" label="Log to" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
          <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
            For cards that don’t match an account name. Add the card’s last 4 digits to match (e.g. “DBS Visa 1234”).
          </Txt>
        </Card>

        <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
          If something’s off
        </Txt>
        <Card style={{ gap: 12 }}>
          {[
            ['Nothing shows up', 'Check the app’s payment notifications are on. Samsung Wallet: Settings › Notifications › Payments.'],
            ['It stops after a while', 'Set Plan’s battery use to Unrestricted in Android Settings › Apps.'],
            ['Can’t allow access', 'For an app installed outside the Play Store: Settings › Apps › Plan › ⋮ › Allow restricted settings.'],
          ].map(([t, d]) => (
            <View key={t}>
              <Txt variant="strong">{t}</Txt>
              <Txt variant="caption" tone="soft">
                {d}
              </Txt>
            </View>
          ))}
        </Card>

        <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
          <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
            Notifications are read on this phone and never sent to Plan’s server.
          </Txt>
        </Row>
      </View>

      <PickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Log payments to"
        searchable={false}
        selectedKey={fallback}
        items={accounts.map((a) => ({ key: a.id, title: a.name }))}
        onSelect={(k) => {
          haptic();
          updateSettings({ payAccountId: k });
          setPicking(false);
        }}
      />
    </Screen>
  );
}
