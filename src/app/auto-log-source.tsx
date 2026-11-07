import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PickerSheet, type PickerItem } from '@/components/Sheet';
import { Button, Card, confirm, Divider, FieldRow, Row, Segmented, TextField, Toggle, Txt } from '@/components/ui';
import { accountForCard } from '@/cloud/inbox';
import { autoLogPlatform } from '@/cloud/nativePayments';
import { sortedGroups } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import type { AutoLogSource } from '@/store/types';
import { useTheme } from '@/theme';
import { filterOf, KIND_LABEL, lastCaught, shortcutFor, type Platform } from '@/utils/autoLogSources';
import { GetShortcut } from '@/components/GetShortcut';
import { goBack } from '@/utils/nav';
import { SourceIcon, sourceStatus } from '@/components/AutoLogSource';

/** Real alerts and the words that pick out their payments, as examples for writing a filter. */
const FILTER_EXAMPLES: [string, string, string][] = [
  ['Grab', 'Your GrabPay Wallet has been charged SGD 14.60 for booking A-7XK2…', 'has been charged'],
  ['SimplyGo', 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int', 'Fare'],
];

/** How to set a source up on this device: a guide to open, or a line saying what's needed. */
function setupFor(s: AutoLogSource, platform: Platform): { route?: { pathname: string; params?: Record<string, string> }; note: string } {
  const reads = 'Nothing to set up: Plan reads its notifications. Keep Read notifications on.';
  if (s.kind === 'tap' && s.match === 'Apple Pay') return platform === 'ios' ? { route: { pathname: '/apple-pay' }, note: 'An iPhone automation sends each tap to Plan.' } : { note: 'Set this up on your iPhone.' };
  if (s.kind === 'tap') return platform === 'android-app' ? { note: reads } : platform === 'android-web' ? { route: { pathname: '/wallet-pay' }, note: 'MacroDroid sends each tap to Plan.' } : { note: 'Set this up on your Android phone.' };
  if (s.kind === 'app')
    return platform === 'android-app'
      ? { note: reads }
      : platform === 'desktop'
        ? { note: 'Set this up on your phone.' }
        : { route: { pathname: '/notify-pay', params: { app: s.name, filter: filterOf(s) } }, note: platform === 'ios' ? `An iPhone automation sends each ${s.name} alert to Plan (iOS 27+).` : `MacroDroid sends each ${s.name} alert to Plan.` };
  return platform === 'ios' ? { route: { pathname: '/email-pay', params: { id: s.id } }, note: 'An iPhone automation sends each alert email to Plan.' } : { note: 'Email alerts need an iPhone for now. On Android, add the bank’s app as a source instead.' };
}

/** One Auto-log source: on or off, how to set it up here, and where its payments go. */
export default function AutoLogSourceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const { colors } = useTheme();
  const sources = data.settings.autoLogSources ?? [];
  const source = sources.find((s) => s.id === id);
  const [picker, setPicker] = useState<'account' | 'category' | null>(null);
  if (!source)
    return (
      <Screen back="close" modal title="Source">
        <Txt tone="muted">This source was removed.</Txt>
      </Screen>
    );

  const update = (patch: Partial<AutoLogSource>) => updateSettings({ autoLogSources: sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const platform = autoLogPlatform();
  const setup = setupFor(source, platform);
  // iPhone: a ready-made shortcut sets the whole thing up.
  const oneTap = platform === 'ios' ? shortcutFor(source) : undefined;
  const currency = data.settings.currency.code;
  const accounts = data.accounts.filter((a) => a.onBudget && !a.closed);
  const fallbackName = accounts.find((a) => a.id === accountForCard(data, null))?.name;
  const account = accounts.find((a) => a.id === source.accountId);
  const category = data.categories.find((c) => c.id === source.categoryId);
  const categoryItems: PickerItem[] = [
    { key: '', title: 'Last used for each payee', subtitle: 'Plan learns as you categorize' },
    ...sortedGroups(data)
      .filter(({ group }) => !group.isCreditCardPayments)
      .flatMap(({ group, categories }) => categories.map((c) => ({ key: c.id, title: c.name, section: group.name }))),
  ];
  const remove = async () => {
    if (!(await confirm(`Remove ${source.name}?`, 'Its payments stop being logged. Ones already logged stay in Spending.', 'Remove', true))) return;
    updateSettings({ autoLogSources: sources.filter((s) => s.id !== id) });
    goBack();
  };

  return (
    <Screen back="close" modal title={source.name} subtitle={KIND_LABEL[source.kind]} maxWidth={560}>
      <View style={{ gap: 16 }}>
        <Card style={{ gap: 10 }}>
          <Row style={{ gap: 12 }}>
            <SourceIcon kind={source.kind} off={!source.enabled} />
            <View style={{ flex: 1 }}>
              <Txt variant="strong">{source.enabled ? 'On' : 'Off'}</Txt>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {sourceStatus(data, source)}
              </Txt>
            </View>
            <Toggle label={`Log ${source.name} payments`} value={source.enabled} onChange={(v) => update({ enabled: v })} />
          </Row>
          {source.kind !== 'tap' && (
            <TextField
              icon={source.kind === 'email' ? 'mail-outline' : 'apps-outline'}
              label={source.kind === 'email' ? 'Name' : 'App name, as on your phone'}
              value={source.name}
              // Apps and emails are matched by their name, so it changes with it.
              onChangeText={(t) => update({ name: t, match: t })}
              maxLength={40}
              autoCapitalize="words"
            />
          )}
        </Card>

        {source.kind !== 'tap' && (
          <Card style={{ gap: 10 }}>
            <Txt variant="strong">{source.kind === 'app' ? 'Which alerts to log' : 'Which emails'}</Txt>
            <TextField
              icon="funnel-outline"
              label={source.kind === 'app' ? 'Only alerts containing' : 'Subject contains (optional)'}
              value={filterOf(source)}
              onChangeText={(t) => update({ filter: t })}
              placeholder={source.kind === 'app' ? 'Any alert with an amount' : 'Any email from the sender'}
              maxLength={60}
              autoCapitalize="none"
            />
            <Txt variant="caption" tone="muted">
              {source.kind === 'app'
                ? 'Copy a few words that every payment alert has and other alerts don’t. Use the same words in the automation’s filter. Leave it empty to log any alert with an amount (offers and rewards are skipped).'
                : 'Words the subject of every alert email has. Use the same in the automation.'}
            </Txt>
            {source.kind === 'app' && (
              <View style={{ gap: 6 }}>
                {FILTER_EXAMPLES.map(([app, alert, words]) => (
                  <View key={app} style={{ backgroundColor: colors.sunken, borderRadius: 10, padding: 10, gap: 2 }}>
                    <Txt variant="caption" tone="soft">
                      {app}: “{alert}”
                    </Txt>
                    <Txt variant="caption">
                      Words: <Txt variant="caption" tone="accent">{words}</Txt>
                    </Txt>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {oneTap ? (
          <GetShortcut
            name={source.name}
            link={oneTap}
            what={source.kind === 'tap' ? 'tap' : 'payment'}
            logged={!!lastCaught(data, source)}
            status={sourceStatus(data, source)}
            onManual={setup.route ? () => router.push(setup.route as never) : undefined}
          />
        ) : (
          <Card style={{ gap: 10 }}>
            <Txt variant="strong">Set up</Txt>
            <Txt variant="caption" tone="muted">
              {setup.note}
            </Txt>
            {setup.route && <Button title="Show me the steps" icon="list-outline" onPress={() => router.push(setup.route as never)} />}
          </Card>
        )}

        <Card style={{ gap: 4 }}>
          <FieldRow icon="card-outline" label="Log to" value={account?.name ?? `Default${fallbackName ? ` (${fallbackName})` : ''}`} onPress={() => setPicker('account')} />
          <Divider />
          <FieldRow icon="pricetag-outline" label="Category for new payees" value={category?.name ?? 'Last used for each payee'} onPress={() => setPicker('category')} />
          {source.match !== 'Apple Pay' && (
            <>
              <Divider />
              <View style={{ paddingVertical: 10, gap: 8 }}>
                <Txt variant="label" tone="soft" style={{ marginLeft: 4 }}>
                  Money in (transfers, refunds)
                </Txt>
                <Segmented
                  options={[
                    { value: 'log', label: 'Log it' },
                    { value: 'ignore', label: 'Leave it out' },
                  ]}
                  value={source.moneyIn ?? 'log'}
                  onChange={(v) => update({ moneyIn: v })}
                />
              </View>
            </>
          )}
        </Card>

        <View style={{ gap: 8 }}>
          <Txt variant="label" tone="muted" style={{ marginLeft: 4 }}>
            How Plan reads each payment
          </Txt>
          <Card style={{ gap: 12 }}>
            {[
              ['cash-outline', 'Amount', `The amount paid, in ${currency} when it shows more than one currency.`],
              ['person-outline', 'Payee', source.kind === 'tap' ? 'The shop the wallet names. If it names none, the payee from your bank’s alert for the same payment.' : 'A “Merchant” or “To” line, or who it says you paid. Otherwise the app’s name.'],
              ['card-outline', 'Account', source.accountId ? 'Always the one in Log to above.' : 'The card or account it names, if one matches. Otherwise your default account.'],
              ['swap-vertical-outline', 'Money in', 'Transfers to you, refunds and cashback are logged as income. Top-ups and declined payments are skipped.'],
            ].map(([icon, t, d]) => (
              <Row key={t} style={{ gap: 12, alignItems: 'flex-start' }}>
                <Ionicons name={icon as 'cash-outline'} size={18} color={colors.accent} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Txt variant="strong">{t}</Txt>
                  <Txt variant="caption" tone="soft">
                    {d}
                  </Txt>
                </View>
              </Row>
            ))}
          </Card>
        </View>

        {source.kind !== 'tap' && (
          <Card style={{ gap: 8 }}>
            <Row style={{ gap: 12 }}>
              <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
              <Txt variant="strong" style={{ flex: 1 }}>
                Use AI when Plan can’t read it
              </Txt>
              <Toggle label="Use AI when Plan can’t read it" value={source.ai !== false} onChange={(v) => update({ ai: v })} />
            </Row>
            <Txt variant="caption" tone="muted">
              Only payments Plan can’t make sense of. Their text goes to the AI to read, and Plan doesn’t keep it. Needs your Plan account.
            </Txt>
          </Card>
        )}

        <Button title={`Remove ${source.name}`} variant="danger" icon="trash-outline" onPress={() => void remove()} />
      </View>

      <PickerSheet
        visible={picker === 'account'}
        onClose={() => setPicker(null)}
        title="Log to"
        searchable={false}
        selectedKey={source.accountId ?? ''}
        items={[{ key: '', title: `Default${fallbackName ? ` (${fallbackName})` : ''}`, subtitle: 'Or the account the card matches' }, ...accounts.map((a) => ({ key: a.id, title: a.name }))]}
        onSelect={(k) => {
          update({ accountId: k || undefined });
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker === 'category'}
        onClose={() => setPicker(null)}
        title="Category for new payees"
        selectedKey={source.categoryId ?? ''}
        items={categoryItems}
        onSelect={(k) => {
          update({ categoryId: k || undefined });
          setPicker(null);
        }}
      />
    </Screen>
  );
}
