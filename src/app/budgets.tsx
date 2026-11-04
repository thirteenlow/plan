import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { DeleteBudgetSheet } from '@/components/DeleteBudgetSheet';
import { Sheet } from '@/components/Sheet';
import { Button, Card, Divider, IconButton, Row, Tap, TextField, Txt } from '@/components/ui';
import { useStore } from '@/store/store';
import { useTheme } from '@/theme';
import { shortDate } from '@/utils/date';
import { LIMITS, validateName } from '@/utils/validation';

export default function BudgetsScreen() {
  const budgets = useStore((s) => s.budgets);
  const activeId = useStore((s) => s.activeBudgetId);
  const sync = useStore((s) => s.sync);
  const { switchBudget, renameBudget } = useStore.getState();
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string; error?: string | null } | null>(null);
  const list = Object.values(budgets).sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1));

  return (
    <Screen back="back" title="Budgets" subtitle="Each budget has its own accounts, categories and plan">
      <Card style={{ paddingVertical: 4 }}>
        {list.map((b, i) => (
          <View key={b.id}>
            {i > 0 && <Divider />}
            <Row style={{ gap: 12, paddingVertical: 12 }}>
              <Tap
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                onPress={() => {
                  switchBudget(b.id);
                  router.dismissTo('/');
                }}
              >
                <Ionicons name={b.id === activeId ? 'radio-button-on' : 'radio-button-off'} size={20} color={b.id === activeId ? colors.accent : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Txt variant="strong">{b.name}</Txt>
                  <Txt variant="caption" tone="muted">
                    {sync[b.id] ? (sync[b.id].role === 'owner' ? 'Synced · ' : 'Shared with you · ') : ''}
                    {b.settings.currency.code} · {b.accounts.length} accounts · since {shortDate(b.createdAt)}
                  </Txt>
                </View>
              </Tap>
              <IconButton icon={sync[b.id] ? 'people' : 'person-add-outline'} label={`Share ${b.name}`} tone="plain" size={34} color={sync[b.id] ? colors.accent : undefined} onPress={() => router.push({ pathname: '/share/[id]', params: { id: b.id } })} />
              <IconButton icon="create-outline" label={`Rename ${b.name}`} tone="plain" size={34} onPress={() => setRename({ id: b.id, name: b.name })} />
              <IconButton icon="trash-outline" label={`Delete ${b.name}`} tone="plain" size={34} color={colors.danger} onPress={() => setDeleting(b.id)} />
            </Row>
          </View>
        ))}
      </Card>
      <Button
        title="New budget"
        icon="add"
        variant="soft"
        style={{ marginTop: 16 }}
        onPress={() => router.push('/onboarding')}
      />

      <DeleteBudgetSheet budget={deleting ? budgets[deleting] ?? null : null} onClose={() => setDeleting(null)} />
      <Sheet visible={!!rename} onClose={() => setRename(null)} title="Rename budget">
        <TextField value={rename?.name ?? ''} onChangeText={(name) => setRename(rename && { ...rename, name, error: null })} maxLength={LIMITS.budgetName} error={rename?.error} autoFocus />
        <Button
          title="Save"
          style={{ marginTop: 14 }}
          disabled={!rename?.name.trim()}
          onPress={() => {
            const error = validateName(rename!.name, { label: 'Budget name', max: LIMITS.budgetName });
            if (error) return setRename({ ...rename!, error });
            renameBudget(rename!.id, rename!.name);
            setRename(null);
          }}
        />
      </Sheet>
    </Screen>
  );
}
