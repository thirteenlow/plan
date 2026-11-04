import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import type { AutoLogSource, BudgetData } from '@/store/types';
import { useTheme } from '@/theme';
import { KIND_ICON, lastCaught } from '@/utils/autoLogSources';
import { shortDate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

/** What a source's row says: off, the last payment it logged, or that nothing has come in yet. */
export function sourceStatus(data: BudgetData, source: AutoLogSource): string {
  if (!source.enabled) return 'Off';
  const t = lastCaught(data, source);
  if (!t) return 'Nothing logged yet';
  const payee = data.payees.find((p) => p.id === t.payeeId)?.name;
  return `Last: ${formatMoney(Math.abs(t.amount))}${payee ? ` · ${payee}` : ''} · ${shortDate(t.date, data.settings.dateFormat)}`;
}

export function SourceIcon({ kind, off }: { kind: AutoLogSource['kind']; off?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: off ? colors.sunken : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={KIND_ICON[kind]} size={18} color={off ? colors.muted : colors.accent} />
    </View>
  );
}
