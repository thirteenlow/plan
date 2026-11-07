import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PickerSheet, type PickerItem } from '@/components/Sheet';
import { Button, Card, Divider, FieldRow, haptic, Row, SectionTitle, Tap, Toggle, Txt } from '@/components/ui';
import { accountForCard } from '@/cloud/inbox';
import { autoLogPlatform, importNativePayments, PaymentNotifications } from '@/cloud/nativePayments';
import { useActiveBudget, useStore } from '@/store/store';
import type { AutoLogSource } from '@/store/types';
import { useTheme } from '@/theme';
import { SourceIcon, sourceStatus } from '@/components/AutoLogSource';
import { defaultSources, KIND_LABEL, newSource, presetsFor } from '@/utils/autoLogSources';

/** Auto-log: where automatic payments come from, on every device. Each source opens its own options and setup. */
export default function AutoLogScreen() {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  const platform = autoLogPlatform();
  const native = platform === 'android-app';
  const sources = data.settings.autoLogSources;
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const saved = PaymentNotifications?.getConfig();
  const [access, setAccess] = useState(() => PaymentNotifications?.hasAccess() ?? false);
  const [paused, setPaused] = useState(saved?.paused ?? false);

  // First visit: start with what this kind of phone can do.
  useEffect(() => {
    if (!sources) updateSettings({ autoLogSources: defaultSources(platform) });
  }, [sources, platform, updateSettings]);

  // Coming back from Android Settings: see whether access was allowed, and log anything already kept.
  useEffect(() => {
    if (!native) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setAccess(PaymentNotifications?.hasAccess() ?? false);
      void importNativePayments();
    });
    return () => sub.remove();
  }, [native]);

  const list = sources ?? [];
  const setSources = (next: AutoLogSource[]) => updateSettings({ autoLogSources: next });
  const add = (s: AutoLogSource) => {
    haptic('success');
    setSources([...list, s]);
    setAdding(false);
    router.push({ pathname: '/auto-log-source', params: { id: s.id } });
  };

  const taken = new Set(list.map((s) => s.name.toLowerCase()));
  const items: PickerItem[] = [
    ...presetsFor(platform)
      .filter((p) => !taken.has(p.name.toLowerCase()))
      .map((p) => ({ key: `preset:${p.name}`, title: p.name, subtitle: p.hint, section: KIND_LABEL[p.kind], left: <SourceIcon kind={p.kind} /> })),
    ...(platform === 'ios' || platform === 'desktop'
      ? [{ key: 'email', title: 'Another bank’s emails', subtitle: 'Any alert email with an amount', section: KIND_LABEL.email, left: <SourceIcon kind="email" /> }]
      : []),
  ];
  const pick = (key: string) => {
    if (key === 'email') return add(newSource({ kind: 'email', name: 'Bank emails', match: 'Bank emails' }));
    const preset = presetsFor(platform).find((p) => `preset:${p.name}` === key);
    if (preset) add(newSource(preset));
  };

  const accounts = data.accounts.filter((a) => a.onBudget && !a.closed);
  const fallback = accountForCard(data, null);
  const fallbackName = accounts.find((a) => a.id === fallback)?.name;
  const reading = access && !paused;

  return (
    <Screen back="close" modal title="Auto-log" maxWidth={560}>
      <View style={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 10, marginTop: 4 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash-outline" size={30} color={colors.accent} />
          </View>
          <Txt variant="h2" center>
            Payments, logged for you
          </Txt>
          <Txt tone="soft" center>
            Add where your payments come from. Each one goes straight to Spending to review.
          </Txt>
        </View>

        {platform === 'desktop' && (
          <Card style={{ gap: 6, backgroundColor: colors.accentSoft }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
              <Txt variant="strong" style={{ flex: 1 }}>
                Set this up on your phone
              </Txt>
            </Row>
            <Txt variant="caption" tone="soft">
              Auto-log runs on your iPhone or Android phone, so sources are added and set up there. Open Plan on your phone and go to Settings › Auto-log. Here you can see your sources and change where their payments go.
            </Txt>
          </Card>
        )}

        {native && (
          <Card style={{ gap: 10 }}>
            <Row style={{ gap: 10 }}>
              <Ionicons name={reading ? 'checkmark-circle' : 'notifications-outline'} size={20} color={reading ? colors.positive : colors.accent} />
              <View style={{ flex: 1 }}>
                <Txt variant="strong">Read notifications</Txt>
                <Txt variant="caption" tone={reading ? 'positive' : 'muted'}>
                  {!access ? 'Needs access in Android Settings' : paused ? 'Off · Plan isn’t reading anything' : 'On'}
                </Txt>
              </View>
              <Toggle
                label="Read notifications"
                value={reading}
                onChange={(v) => {
                  // No access yet: only Android Settings can grant it.
                  if (v && !access) return PaymentNotifications?.openAccessSettings();
                  setPaused(!v);
                  PaymentNotifications?.setPaused(!v);
                }}
              />
            </Row>
            <Txt variant="caption" tone="muted">
              Plan only keeps notifications with an amount, from the sources below. They stay on this phone.
            </Txt>
            {!access && <Button title="Allow notification access" icon="open-outline" onPress={() => PaymentNotifications?.openAccessSettings()} />}
            {access && paused && <Button title="Remove access in Android Settings" variant="soft" small icon="open-outline" onPress={() => PaymentNotifications?.openAccessSettings()} />}
          </Card>
        )}

        <View style={{ gap: 8 }}>
          <SectionTitle title="Sources" />
          {list.length > 0 && (
            <Card padded={false} style={{ paddingHorizontal: 16 }}>
              {list.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <Divider />}
                  <Tap
                    onPress={() => router.push({ pathname: '/auto-log-source', params: { id: s.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.name}, ${sourceStatus(data, s)}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}
                  >
                    <SourceIcon kind={s.kind} off={!s.enabled} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="strong" numberOfLines={1} tone={s.enabled ? 'default' : 'muted'}>
                        {s.name}
                      </Txt>
                      <Txt variant="caption" tone="muted" numberOfLines={1}>
                        {sourceStatus(data, s)}
                      </Txt>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </Tap>
                </View>
              ))}
            </Card>
          )}
          {platform !== 'desktop' ? (
            <Button title="Add a source" variant="soft" icon="add" onPress={() => setAdding(true)} />
          ) : (
            !list.length && (
              <Txt variant="caption" tone="muted" style={{ marginLeft: 4 }}>
                No sources yet. Add them on your phone.
              </Txt>
            )
          )}
        </View>

        <Card style={{ gap: 4 }}>
          <FieldRow icon="card-outline" label="Default account" value={fallbackName ?? 'Choose an account'} onPress={() => setPicking(true)} />
          <Txt variant="caption" tone="muted" style={{ marginHorizontal: 4 }}>
            Used when Plan can’t tell which card paid. Each source can have its own.
          </Txt>
        </Card>

        <Row style={{ gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 }}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
          <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
            {native
              ? 'Notifications are read on this phone and never sent to Plan’s server.'
              : 'Your automations send only the payment’s text. It waits on the server unencrypted until Plan picks it up, then it’s deleted.'}
          </Txt>
        </Row>
      </View>

      <PickerSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Add a source"
        items={items}
        onSelect={pick}
        searchPlaceholder="Search, or type any app’s name"
        // Any other app: typed as it appears on the phone.
        onCreate={(q) => add(newSource({ kind: 'app', name: q, match: q }))}
        createLabel="Add app"
      />
      <PickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Default account"
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
