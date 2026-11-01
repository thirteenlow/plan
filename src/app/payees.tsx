import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ActionSheet, PickerSheet, Sheet } from '@/components/Sheet';
import { Button, Card, confirm, Divider, EmptyState, IconBadge, Tap, TextField, Txt } from '@/components/ui';
import { useLookups } from '@/hooks/useBudget';
import { useActiveBudget, useStore } from '@/store/store';
import { RTA } from '@/store/types';
import { LIMITS, validateName } from '@/utils/validation';

export default function PayeesScreen() {
  const data = useActiveBudget();
  const { categories } = useLookups();
  const { renamePayee, mergePayees, deletePayee } = useStore.getState();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string; error?: string | null } | null>(null);
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data.transactions) if (t.payeeId) m.set(t.payeeId, (m.get(t.payeeId) ?? 0) + 1);
    return m;
  }, [data.transactions]);

  const list = data.payees.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  const target = data.payees.find((p) => p.id === menu);

  return (
    <Screen back="back" title="Payees" subtitle={`${data.payees.length} payees`}>
      <TextField icon="search" placeholder="Search payees" value={q} onChangeText={setQ} maxLength={LIMITS.search} autoCorrect={false} />
      {list.length === 0 ? (
        <EmptyState icon="people-outline" title="No payees" message="Payees are created when you add transactions." />
      ) : (
        <Card style={{ paddingVertical: 4, marginTop: 14 }}>
          {list.map((p, i) => {
            const cat = p.lastCategoryId === RTA ? 'Ready to Assign' : p.lastCategoryId ? categories.get(p.lastCategoryId)?.name : undefined;
            return (
              <View key={p.id}>
                {i > 0 && <Divider inset={48} />}
                <Tap onPress={() => setMenu(p.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 }}>
                  <IconBadge name={p.name} icon="person" size={36} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="strong" numberOfLines={1}>
                      {p.name}
                    </Txt>
                    <Txt variant="caption" tone="muted" numberOfLines={1}>
                      {counts.get(p.id) ?? 0} transactions{cat ? ` · auto-categorizes to ${cat}` : ''}
                    </Txt>
                  </View>
                </Tap>
              </View>
            );
          })}
        </Card>
      )}

      <ActionSheet
        visible={!!target}
        onClose={() => setMenu(null)}
        title={target?.name}
        actions={
          target
            ? [
                { label: 'Rename', icon: 'pencil', onPress: () => setRename({ id: target.id, name: target.name }) },
                { label: 'Combine into another payee', icon: 'git-merge-outline', hint: 'Moves all transactions and removes this payee', onPress: () => setMergeFrom(target.id) },
                {
                  label: 'Delete',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: async () => {
                    if (await confirm('Delete payee', `Transactions from “${target.name}” will have no payee.`, 'Delete', true)) deletePayee(target.id);
                  },
                },
              ]
            : []
        }
      />
      <Sheet visible={!!rename} onClose={() => setRename(null)} title="Rename payee">
        <TextField value={rename?.name ?? ''} onChangeText={(name) => setRename(rename && { ...rename, name, error: null })} maxLength={LIMITS.payeeName} error={rename?.error} autoFocus />
        <Button
          title="Save"
          style={{ marginTop: 14 }}
          disabled={!rename?.name.trim()}
          onPress={() => {
            const current = data.payees.find((p) => p.id === rename!.id)?.name;
            const error = validateName(rename!.name, { label: 'Payee', max: LIMITS.payeeName, existing: data.payees.map((p) => p.name), current });
            if (error) return setRename({ ...rename!, error: error.includes('already exists') ? `${error} Use “Combine” to merge them.` : error });
            renamePayee(rename!.id, rename!.name);
            setRename(null);
          }}
        />
      </Sheet>
      <PickerSheet
        visible={!!mergeFrom}
        onClose={() => setMergeFrom(null)}
        title="Combine into"
        items={data.payees.filter((p) => p.id !== mergeFrom).map((p) => ({ key: p.id, title: p.name }))}
        onSelect={async (into) => {
          const from = data.payees.find((p) => p.id === mergeFrom);
          const to = data.payees.find((p) => p.id === into);
          setMergeFrom(null);
          if (from && to && (await confirm('Combine payees', `All transactions from “${from.name}” will move to “${to.name}”.`, 'Combine'))) mergePayees([from.id], to.id);
        }}
      />
    </Screen>
  );
}
