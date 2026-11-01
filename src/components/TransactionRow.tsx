import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { useLookups } from '@/hooks/useBudget';
import { useStore } from '@/store/store';
import { RTA, type Transaction } from '@/store/types';
import { FLAG_COLORS, RADIUS, useTheme } from '@/theme';
import { ACCOUNT_TYPE_INFO } from '@/utils/icons';
import { formatMoney } from '@/utils/money';
import { haptic, IconBadge, Row, Tap, Txt } from './ui';

export function useTxLabels() {
  const { accounts, categories, payees } = useLookups();
  return (tx: Pick<Transaction, 'payeeId' | 'transferAccountId' | 'categoryId' | 'subtransactions' | 'amount'>) => {
    const payee = tx.transferAccountId
      ? `${tx.amount < 0 ? 'Transfer to' : 'Transfer from'} ${accounts.get(tx.transferAccountId)?.name ?? 'account'}`
      : (tx.payeeId && payees.get(tx.payeeId)?.name) || 'No payee';
    let category: string;
    if (tx.subtransactions?.length) category = `Split (${tx.subtransactions.length})`;
    else if (tx.categoryId === RTA) category = 'Ready to Assign';
    else if (tx.categoryId) category = categories.get(tx.categoryId)?.name ?? 'Deleted category';
    else if (tx.transferAccountId) category = 'Transfer';
    else category = 'Uncategorized';
    return { payee, category };
  };
}

export function TransactionRow({
  tx,
  onPress,
  showAccount,
  upcoming,
  selecting,
  selected,
}: {
  tx: Transaction;
  onPress?: () => void;
  showAccount?: boolean;
  upcoming?: boolean;
  /** Multi-select mode: shows a checkbox instead of the category badge */
  selecting?: boolean;
  selected?: boolean;
}) {
  const { colors, shadow } = useTheme();
  const labels = useTxLabels();
  const { accounts, categories } = useLookups();
  const toggleCleared = useStore((s) => s.toggleCleared);
  const { payee, category } = labels(tx);
  const account = accounts.get(tx.accountId);
  const badgeName = tx.transferAccountId ? 'transfer' : category === 'Uncategorized' ? payee : category;
  const icon = tx.transferAccountId ? 'swap-horizontal' : tx.categoryId === RTA ? 'arrow-down' : tx.subtransactions?.length ? 'git-branch' : undefined;
  const subtitle = tx.memo ? `${category} · ${tx.memo}` : category;
  const needsCategory = !tx.categoryId && !tx.transferAccountId && !tx.subtransactions?.length && account?.onBudget && !tx.isStartingBalance;

  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${payee}, ${formatMoney(tx.amount)}, ${category}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderRadius: RADIUS.lg,
          padding: 14,
          opacity: upcoming ? 0.6 : 1,
          borderWidth: 1.5,
          borderColor: selected ? colors.accent : 'transparent',
        },
        shadow,
        { shadowOpacity: shadow.shadowOpacity * 0.6 },
      ]}
    >
      {selecting && (
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.accent : colors.muted} />
      )}
      <View>
        <IconBadge name={badgeName} icon={icon ?? (account && !account.onBudget ? ACCOUNT_TYPE_INFO[account.type].icon : undefined)} size={42} />
        {!tx.approved && <View style={{ position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface }} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ gap: 6 }}>
          <Txt variant="strong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {payee}
          </Txt>
          {tx.flag && <Ionicons name="flag" size={12} color={FLAG_COLORS[tx.flag]} />}
          {upcoming && <Ionicons name="time-outline" size={12} color={colors.muted} />}
        </Row>
        {tx.subtransactions?.length ? (
          // Splits list every category as a small pill, in the order they were entered.
          <Row style={{ flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
            {tx.subtransactions.map((sub) => (
              <View key={sub.id} style={{ backgroundColor: colors.sunken, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Txt variant="caption" tone="soft" numberOfLines={1} style={{ fontSize: 11 }}>
                  {(sub.categoryId && categories.get(sub.categoryId)?.name) || 'Uncategorized'} · {formatMoney(Math.abs(sub.amount))}
                </Txt>
              </View>
            ))}
          </Row>
        ) : (
          <Txt variant="caption" tone={needsCategory ? 'warning' : 'muted'} numberOfLines={1}>
            {needsCategory ? 'Needs a category' : subtitle}
          </Txt>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Txt variant="strong" tone={tx.amount > 0 ? 'positive' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
          {formatMoney(tx.amount, { sign: true })}
        </Txt>
        <Row style={{ gap: 6 }}>
          {showAccount && (
            <Txt variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: 120 }}>
              {account?.name}
            </Txt>
          )}
        {!upcoming && !selecting && (
          <Tap
            hitSlop={10}
            onPress={() => {
              haptic();
              toggleCleared(tx.id);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: tx.cleared !== 'uncleared' }}
            accessibilityLabel={tx.cleared === 'reconciled' ? 'Reconciled' : tx.cleared === 'cleared' ? 'Cleared' : 'Uncleared'}
          >
            {tx.cleared === 'reconciled' ? (
              <Ionicons name="lock-closed" size={14} color={colors.positive} />
            ) : (
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: tx.cleared === 'cleared' ? colors.positive : 'transparent',
                  borderWidth: tx.cleared === 'cleared' ? 0 : 1.5,
                  borderColor: colors.muted,
                }}
              >
                <Txt style={{ fontSize: 10, color: tx.cleared === 'cleared' ? '#FFF' : colors.muted, fontWeight: '700' }}>C</Txt>
              </View>
            )}
          </Tap>
        )}
        </Row>
      </View>
    </Tap>
  );
}
