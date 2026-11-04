import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { signOutEverywhereOnDevice } from '@/cloud';
import { useCloud } from '@/cloud/cloudStore';
import { DeleteBudgetSheet } from '@/components/DeleteBudgetSheet';
import { Sheet } from '@/components/Sheet';
import { Button, Card, confirm, Divider, GradientCard, notify, Row, Segmented, Tap, TextField, Txt } from '@/components/ui';
import { isAndroidDevice, requirePro, usePlan } from '@/cloud/pro';
import { petInfo } from '@/engine/pet';
import { useUi } from '@/hooks/useBudget';
import { LIMITS } from '@/utils/validation';
import { useActiveBudget, useStore } from '@/store/store';
import type { ThemePref } from '@/store/types';
import { RADIUS, useTheme } from '@/theme';
import { shortDate, today } from '@/utils/date';
import { exportBudget, pickImport } from '@/utils/importExport';
import { formatMoney } from '@/utils/money';
import type { IconName } from '@/utils/icons';

export default function SettingsScreen() {
  const data = useActiveBudget();
  const { colors } = useTheme();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const updateSettings = useStore((s) => s.updateSettings);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const cloud = useCloud();
  // Signed in, including while still finishing setup or unlocking.
  const canLogOut = !!cloud.user && cloud.status !== 'signedOut' && cloud.status !== 'unconfigured';
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
  const { plan, expiresAt } = usePlan();
  const pro = plan !== 'free';
  const planUntil = expiresAt ? shortDate(expiresAt.slice(0, 10), data.settings.dateFormat) : null;

  return (
    <Screen back="back" title="Settings">
      {pro ? (
        // Pro members get a membership card instead of an upgrade row.
        <Tap scale accessibilityRole="button" accessibilityLabel="Plan Pro membership" onPress={() => router.push('/pro')} style={{ marginTop: 18 }}>
          <GradientCard style={{ padding: 18 }}>
            <Row style={{ gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="sparkles" size={22} color={colors.onGradient} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="label" style={{ color: colors.onGradient, opacity: 0.85 }}>
                  {plan === 'trial' ? 'PRO TRIAL' : 'PRO MEMBER'}
                </Txt>
                <Txt variant="h3" style={{ color: colors.onGradient }}>
                  Plan Pro
                </Txt>
                <Txt variant="caption" style={{ color: colors.onGradient, opacity: 0.9 }}>
                  {plan === 'trial' ? (planUntil ? `Trial ends ${planUntil}` : 'Trial active') : planUntil ? `Active until ${planUntil}` : 'Active · no end date'}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onGradient} />
            </Row>
          </GradientCard>
        </Tap>
      ) : (
        <Group title="Plan Pro">
          <Item icon="sparkles-outline" label="Plan Pro" value="Upgrade" onPress={() => router.push('/pro')} />
        </Group>
      )}

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
        <Item icon="notifications-outline" label="Notifications" value={data.settings.reminders?.on ? 'On' : 'Off'} onPress={() => router.push('/notifications')} />
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

      <Group title="Companion">
        <Item
          icon="paw-outline"
          label={data.settings.pet ? data.settings.pet.name : 'Pick a companion'}
          value={data.settings.pet ? `${petInfo(data.settings.pet.kind).label} · ${data.settings.pet.hidden ? 'Hidden' : 'Roaming'}` : 'A pet that reacts to your spending'}
          onPress={() => router.push('/pet')}
        />
      </Group>

      <Group title="Automation">
        {isAndroidDevice() ? (
          <>
            <Item icon="phone-portrait-outline" label="Google Pay auto-log" value="Android" pro={!pro} onPress={() => requirePro('applePay') && router.push('/wallet-pay')} />
            <Item icon="bus-outline" label="SimplyGo fare auto-log" value="Android" pro={!pro} onPress={() => requirePro('notifyPay') && router.push('/notify-pay')} />
          </>
        ) : (
          <>
            <Item icon="phone-portrait-outline" label="Apple Pay auto-log" value="iPhone · iOS 17+" pro={!pro} onPress={() => requirePro('applePay') && router.push('/apple-pay')} />
            <Item icon="bus-outline" label="SimplyGo fare auto-log" value="iPhone · iOS 27+" pro={!pro} onPress={() => requirePro('notifyPay') && router.push('/notify-pay')} />
          </>
        )}
        <Item icon="scan-outline" label="AI receipt scan" value="Any device" pro={!pro} onPress={() => requirePro('screenshot') && router.push('/screenshot-capture')} />
      </Group>

      <Group title="Data">
        <Item icon="shield-checkmark-outline" label="Privacy policy" onPress={() => router.push('/privacy')} />
        <Item icon="share-outline" label="Export" value="CSV + full backup" onPress={() => void exportData()} />
        <Item icon="download-outline" label="Import" value="Zip or CSV files" onPress={() => void importData()} />
      </Group>

      <Group title="How it works">
        <Rule n={1} title="Give every dollar a job" text="Assign money until Ready to Assign is zero." />
        <Rule n={2} title="Plan for true expenses" text="Targets turn big costs into monthly amounts." />
        <Rule n={3} title="Roll with the punches" text="Overspent? Move money from elsewhere." />
      </Group>

      {canLogOut && (
        <Button
          title="Log out"
          variant="outline"
          icon="log-out-outline"
          style={{ marginTop: 24 }}
          onPress={async () => {
            if (!(await confirm('Log out', 'Your budgets stay on your account and are removed from this device.', 'Log out'))) return;
            await signOutEverywhereOnDevice();
            // The budgets are gone from this device: go home, where the sign-in gate takes over.
            router.replace('/');
          }}
        />
      )}
      <Button title="Delete this budget" variant="danger" icon="trash-outline" style={{ marginTop: canLogOut ? 10 : 24 }} onPress={() => setDeleting(true)} />
      <DeleteBudgetSheet budget={deleting ? data : null} onClose={() => setDeleting(false)} />

      <Txt variant="caption" tone="muted" center style={{ marginTop: 18 }}>
        Plan · encrypted
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

function Item({ icon, label, value, onPress, pro }: { icon: IconName; label: string; value?: string; onPress?: () => void; pro?: boolean }) {
  const { colors } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={17} color={colors.accent} />
      </View>
      <Txt variant="body" style={{ flex: 1 }}>
        {label}
      </Txt>
      {pro && (
        <View style={{ backgroundColor: colors.accent, borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Txt variant="caption" style={{ color: colors.onGradient, fontSize: 10 }}>
            PRO
          </Txt>
        </View>
      )}
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
