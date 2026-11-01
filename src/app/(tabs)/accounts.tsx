import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { HeaderPill, Screen } from '@/components/Screen';
import { TabMenu } from '@/components/TabMenu';
import { Button, Card, Divider, EmptyState, GradientCard, IconBadge, IconButton, Row, Tap, Txt } from '@/components/ui';
import { useBalances } from '@/hooks/useBudget';
import { useActiveBudget } from '@/store/store';
import type { Account } from '@/store/types';
import { useTheme } from '@/theme';
import { shortDate } from '@/utils/date';
import { ACCOUNT_GRADIENTS, ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { formatMoney } from '@/utils/money';

type Section = 'cash' | 'credit' | 'tracking' | 'closed';

export default function AccountsScreen() {
  const data = useActiveBudget();
  const balances = useBalances();
  const [collapsed, setCollapsed] = useState<Set<Section>>(new Set(['closed']));

  const open = data.accounts.filter((a) => !a.closed).sort((a, b) => a.sort - b.sort);
  const sections: { key: Section; title: string; list: Account[] }[] = [
    { key: 'cash', title: 'Cash', list: open.filter((a) => a.onBudget && !isCreditType(a.type)) },
    { key: 'credit', title: 'Credit', list: open.filter((a) => isCreditType(a.type)) },
    { key: 'tracking', title: 'Tracking', list: open.filter((a) => !a.onBudget) },
    { key: 'closed', title: 'Closed', list: data.accounts.filter((a) => a.closed) },
  ];
  const sum = (list: Account[]) => list.reduce((s, a) => s + (balances[a.id]?.working ?? 0), 0);

  let assets = 0;
  let debts = 0;
  for (const a of data.accounts) {
    const b = balances[a.id]?.working ?? 0;
    if (b >= 0) assets += b;
    else debts -= b;
  }

  const toggle = (k: Section) => {
    const next = new Set(collapsed);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setCollapsed(next);
  };

  return (
    <Screen
      largeTitle
      title="Accounts"
      right={
        <HeaderPill>
          <IconButton icon="add" label="Add account" tone="plain" size={36} onPress={() => router.push('/account-edit')} />
          <TabMenu plain title="Accounts" actions={[{ label: 'Add account', icon: 'add-circle-outline', onPress: () => router.push('/account-edit') }]} />
        </HeaderPill>
      }
      tabBarPadding
    >
      <GradientCard>
        <Txt variant="label" tone="inverse" center style={{ opacity: 0.9 }}>
          Net Worth
        </Txt>
        <Txt variant="display" tone="inverse" center style={{ fontSize: 36, marginTop: 6 }} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(assets - debts)}
        </Txt>
        <Row style={{ marginTop: 16, gap: 12 }}>
          {(
            [
              ['arrow-down', 'Assets', assets],
              ['arrow-up', 'Debts', -debts],
            ] as const
          ).map(([icon, label, v]) => (
            <Row key={label} style={{ flex: 1, gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={14} color="#FFF" />
              </View>
              <View>
                <Txt variant="caption" tone="inverse" style={{ opacity: 0.85 }}>
                  {label}
                </Txt>
                <Txt variant="strong" tone="inverse">
                  {formatMoney(v)}
                </Txt>
              </View>
            </Row>
          ))}
        </Row>
      </GradientCard>

      {data.accounts.length === 0 ? (
        <EmptyState icon="wallet-outline" title="Add your first account" message="Start with the account you spend from most. Its balance becomes money you can assign." action="Add account" onAction={() => router.push('/account-edit')} />
      ) : (
        sections.map(({ key, title, list }) => {
          if (list.length === 0) return null;
          const isOpen = !collapsed.has(key);
          return (
            <View key={key} style={{ marginTop: 20 }}>
              <SectionToggle title={key === 'closed' ? `Closed (${list.length})` : title} total={key === 'closed' ? undefined : sum(list)} open={isOpen} onPress={() => toggle(key)} />
              {isOpen && (
                <Card padded={false} style={{ paddingHorizontal: 14 }}>
                  {list.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 && <Divider inset={54} />}
                      <AccountRow account={a} balance={balances[a.id]?.working ?? 0} cleared={balances[a.id]?.cleared ?? 0} />
                    </View>
                  ))}
                </Card>
              )}
            </View>
          );
        })
      )}

      <Button title="Add Account" icon="add-circle-outline" variant="soft" style={{ marginTop: 24 }} onPress={() => router.push('/account-edit')} />
    </Screen>
  );
}

function SectionToggle({ title, total, open, onPress }: { title: string; total?: number; open: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textSoft} />
      <Txt variant="h3" style={{ flex: 1 }}>
        {title}
      </Txt>
      {total !== undefined && (
        <Txt variant="strong" tone={total < 0 ? 'danger' : 'soft'}>
          {formatMoney(total)}
        </Txt>
      )}
    </Tap>
  );
}

function AccountRow({ account, balance, cleared }: { account: Account; balance: number; cleared: number }) {
  const { colors } = useTheme();
  const info = ACCOUNT_TYPE_INFO[account.type];
  return (
    <Tap
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: account.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${formatMoney(balance)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: account.closed ? 0.6 : 1 }}
    >
      <IconBadge name={account.name} icon={info.icon} colors={ACCOUNT_GRADIENTS[account.type]} size={42} />
      <View style={{ flex: 1 }}>
        <Txt variant="strong" numberOfLines={1}>
          {account.name}
        </Txt>
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {account.lastReconciledAt ? `Reconciled ${shortDate(account.lastReconciledAt)}` : `Cleared ${formatMoney(cleared)}`}
        </Txt>
      </View>
      <Txt variant="strong" tone={balance < 0 ? 'danger' : balance > 0 ? 'positive' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
        {formatMoney(balance)}
      </Txt>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Tap>
  );
}
