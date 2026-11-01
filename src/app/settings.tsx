import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useCloud } from '@/cloud/cloudStore';
import { DeleteBudgetSheet } from '@/components/DeleteBudgetSheet';
import { Sheet } from '@/components/Sheet';
import { Button, Card, Divider, notify, Row, Segmented, Tap, TextField, Txt } from '@/components/ui';
import { useUi } from '@/hooks/useBudget';
import { LIMITS } from '@/utils/validation';
import { useActiveBudget, useStore } from '@/store/store';
import type { ThemePref } from '@/store/types';
import { useTheme } from '@/theme';
import { shortDate, today } from '@/utils/date';
import { exportBudget, pickImport } from '@/utils/importExport';
import { formatMoney } from '@/utils/money';
import type { IconName } from '@/utils/icons';

export default function SettingsScreen() {
  const data = useActiveBudget();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const updateSettings = useStore((s) => s.updateSettings);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cloud = useCloud();
  const cloudLabel =
    cloud.status === 'ready' ? (cloud.user?.email ?? 'Signed in') : cloud.status === 'unconfigured' ? 'Not set up' : cloud.status === 'signedOut' ? 'Sign in' : 'Finish setup';

  const exportData = async () => {
    try {
      await exportBudget(data);
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : undefined);
    }
  };

  const importData = async () => {
    try {
      const result = await pickImport({ currency: data.settings.currency, dateFormat: data.settings.dateFormat });
      if (!result) return;
      // Imports always become a new budget, so nothing existing is overwritten.
      if (!useStore.getState().importBudget(result.data, result.name)) return notify('Can’t import that file', 'It isn’t a budget export, or it’s damaged.');
      notify('Budget imported', 'It’s been added as a new budget.');
      if (router.canDismiss()) router.dismissAll();
    } catch (e) {
      notify('Import failed', e instanceof Error ? e.message : undefined);
    }
  };

  const unapproved = data.transactions.filter((t) => !t.approved).length;

  return (
    <Screen back="back" title="Settings">
      <Group title="Budget">
        <Item icon="albums-outline" label="Budgets" value={data.name} onPress={() => router.push('/budgets')} />
        <Item icon="grid-outline" label="Categories & groups" value={`${data.categories.length}`} onPress={() => router.push('/categories')} />
        <Item icon="people-outline" label="Payees" value={`${data.payees.length}`} onPress={() => router.push('/payees')} />
        <Item icon="repeat-outline" label="Scheduled transactions" value={`${data.scheduled.length}`} onPress={() => router.push('/scheduled')} />
        <Item icon="checkmark-circle-outline" label="Review & approve" value={unapproved ? `${unapproved} waiting` : 'All caught up'} onPress={() => {
            useUi.getState().setSpendingFilter('unapproved');
            router.navigate('/spending');
          }} />
      </Group>

      <Group title="Account & sync">
        <Item icon="cloud-outline" label="Account & sharing" value={cloudLabel} onPress={() => router.push('/account')} />
      </Group>

      <Group title="Preferences">
        <Item icon="person-outline" label="Your name" value={data.settings.ownerName || 'Not set'} onPress={() => setNameDraft(data.settings.ownerName ?? '')} />
        <View style={{ paddingVertical: 10, gap: 10 }}>
          <Txt variant="body">Appearance</Txt>
          <Segmented<ThemePref>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
        <Item icon="cash-outline" label="Currency & formats" value={`${data.settings.currency.code} · ${formatMoney(1234567, { c: data.settings.currency })} · ${shortDate(today(), data.settings.dateFormat)}`} onPress={() => router.push('/format')} />
      </Group>

      <Group title="Automation">
        <Item icon="phone-portrait-outline" label="Apple Pay auto-log" value="iPhone" onPress={() => router.push('/apple-pay')} />
        <Item icon="scan-outline" label="Screenshot capture" value="iPhone" onPress={() => router.push('/screenshot-capture')} />
      </Group>

      <Group title="Data">
        <Item icon="shield-checkmark-outline" label="Privacy policy" onPress={() => router.push('/privacy')} />
        <Item icon="share-outline" label="Export" value="Plan & Register CSV" onPress={() => void exportData()} />
        <Item icon="download-outline" label="Import" value="Zip or CSV files" onPress={() => void importData()} />
      </Group>

      <Group title="How it works">
        <Rule n={1} title="Give every dollar a job" text="Assign money until Ready to Assign is zero." />
        <Rule n={2} title="Plan for true expenses" text="Targets turn big costs into monthly amounts." />
        <Rule n={3} title="Roll with the punches" text="Overspent? Move money from elsewhere." />
      </Group>

      <Button title="Delete this budget" variant="danger" icon="trash-outline" style={{ marginTop: 24 }} onPress={() => setDeleting(true)} />
      <DeleteBudgetSheet budget={deleting ? data : null} onClose={() => setDeleting(false)} />

      <Txt variant="caption" tone="muted" center style={{ marginTop: 18 }}>
        Plan · end-to-end encrypted
      </Txt>

      <Sheet visible={nameDraft !== null} onClose={() => setNameDraft(null)} title="Your name">
        <TextField value={nameDraft ?? ''} onChangeText={setNameDraft} maxLength={LIMITS.ownerName} autoFocus placeholder="Used to greet you on Home" />
        <Button
          title="Save"
          style={{ marginTop: 14 }}
          onPress={() => {
            updateSettings({ ownerName: nameDraft?.trim() || undefined });
            setNameDraft(null);
          }}
        />
      </Sheet>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <>
      <Txt variant="overline" tone="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>
        {title}
      </Txt>
      <Card style={{ paddingVertical: 4 }}>
        {items.map((c, i) => (
          <View key={i}>
            {i > 0 && <Divider />}
            {c}
          </View>
        ))}
      </Card>
    </>
  );
}

function Item({ icon, label, value, onPress }: { icon: IconName; label: string; value?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <Txt variant="body" style={{ flex: 1 }}>
        {label}
      </Txt>
      {!!value && (
        <Txt variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Txt>
      )}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Tap>
  );
}

function Rule({ n, title, text }: { n: number; title: string; text: string }) {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 12, paddingVertical: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="label" tone="accent">
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="strong">{title}</Txt>
        <Txt variant="caption" tone="muted">
          {text}
        </Txt>
      </View>
    </Row>
  );
}
