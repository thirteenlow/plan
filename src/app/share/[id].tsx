import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Button, Card, confirm, Divider, haptic, IconBadge, IconButton, Row, TextField, Txt } from '@/components/ui';
import { friendlyError, useCloud } from '@/cloud/cloudStore';
import { requirePro } from '@/cloud/pro';
import { inviteMember, leaveBudget, listMembers, type Member, removeMember, shareBudget, stopSharing } from '@/cloud/sync';
import { useStore } from '@/store/store';
import { useTheme } from '@/theme';
import { cleanTyping } from '@/utils/validation';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ShareBudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const budget = useStore((s) => s.budgets[id]);
  const meta = useStore((s) => s.sync[id]);
  const { status, user } = useCloud();
  const { colors } = useTheme();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!meta || status !== 'ready') return;
    try {
      setMembers(await listMembers(id));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }, [id, meta, status]);

  useEffect(() => {
    if (!meta || status !== 'ready') return;
    let cancelled = false;
    listMembers(id)
      .then((m) => !cancelled && setMembers(m))
      .catch((e) => !cancelled && setErr(friendlyError(e)));
    return () => {
      cancelled = true;
    };
  }, [id, meta, status]);

  if (!budget) return null;
  const isOwner = meta?.role === 'owner';

  const run = async (name: string, fn: () => Promise<void>, success?: string) => {
    setBusy(name);
    setErr(null);
    setOk(null);
    try {
      await fn();
      if (success) setOk(success);
      haptic('success');
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  if (status !== 'ready') {
    return (
      <Screen back="back" title="Share budget" subtitle={budget.name} maxWidth={560}>
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 26 }}>
          <Ionicons name="people-outline" size={30} color={colors.accent} />
          <Txt variant="h3" center>
            Sign in to share
          </Txt>
          <Txt tone="soft" center>
            Sharing needs an account so everyone sees the same budget. Your data is end-to-end encrypted.
          </Txt>
          <Button title={status === 'unconfigured' ? 'See setup steps' : 'Sign in'} onPress={() => router.push('/account')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
        </Card>
      </Screen>
    );
  }

  if (!meta) {
    return (
      <Screen back="back" title="Share budget" subtitle={budget.name} maxWidth={560}>
        <Card style={{ gap: 10 }}>
          <Txt variant="h3">Share “{budget.name}”</Txt>
          <Txt tone="soft">
            This uploads an encrypted copy of the budget. You can then invite people by the email they use to sign in to Plan. Everyone can add transactions and assign money; only you can invite or remove people.
          </Txt>
          {!!err && (
            <Txt variant="caption" tone="danger">
              {err}
            </Txt>
          )}
          <Button title="Share this budget" icon="people-outline" loading={busy === 'share'} onPress={() => run('share', () => shareBudget(id).then(refresh))} style={{ marginTop: 6 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back="back" title="Share budget" subtitle={`${budget.name} · ${isOwner ? 'you own this budget' : 'shared with you'}`} maxWidth={560}>
      {isOwner && (
        <Card style={{ gap: 12 }}>
          <Txt variant="h3">Invite someone</Txt>
          <TextField
            icon="mail-outline"
            placeholder="their-email@example.com"
            value={email}
            onChangeText={(t) => setEmail(cleanTyping(t, 254).replace(/\s/g, ''))}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={254}
          />
          <Button
            title="Send invite"
            icon="person-add-outline"
            disabled={!EMAIL.test(email)}
            loading={busy === 'invite'}
            onPress={() =>
              requirePro('sharing') &&
              run(
                'invite',
                async () => {
                  await inviteMember(id, email);
                  setEmail('');
                  await refresh();
                },
                'Added! It will appear on their devices within a minute.',
              )
            }
          />
          <Txt variant="caption" tone="muted">
            They need to have signed in to Plan once and created their password.
          </Txt>
        </Card>
      )}
      {(err || ok) && (
        <Txt variant="caption" tone={err ? 'danger' : 'positive'} style={{ marginTop: 10, marginLeft: 4 }}>
          {err ?? ok}
        </Txt>
      )}

      <Txt variant="overline" tone="muted" style={{ marginTop: 22, marginBottom: 10, marginLeft: 4 }}>
        People with access
      </Txt>
      <Card style={{ paddingVertical: 4 }}>
        {members === null ? (
          <ActivityIndicator style={{ paddingVertical: 16 }} />
        ) : (
          members.map((m, i) => (
            <View key={m.user_id}>
              {i > 0 && <Divider inset={48} />}
              <Row style={{ gap: 12, paddingVertical: 12 }}>
                <IconBadge name={m.email} icon="person" size={36} />
                <View style={{ flex: 1 }}>
                  <Txt variant="strong" numberOfLines={1}>
                    {m.display_name || m.email}
                    {m.user_id === user?.id ? ' (you)' : ''}
                  </Txt>
                  <Txt variant="caption" tone="muted" numberOfLines={1}>
                    {m.role === 'owner' ? 'Owner' : 'Can edit'} · {m.email}
                  </Txt>
                </View>
                {isOwner && m.role !== 'owner' && (
                  <IconButton
                    icon="person-remove-outline"
                    label={`Remove ${m.email}`}
                    tone="plain"
                    color={colors.danger}
                    onPress={async () => {
                      if (await confirm('Remove access', `${m.email} will stop receiving updates and the budget key will be changed. They keep any copy already on their device.`, 'Remove', true)) {
                        await run('remove', () => removeMember(id, m.user_id).then(refresh), 'Removed, and the budget key was changed.');
                      }
                    }}
                  />
                )}
              </Row>
            </View>
          ))
        )}
      </Card>

      {isOwner ? (
        <Button
          title="Stop sharing"
          variant="danger"
          icon="cloud-offline-outline"
          style={{ marginTop: 22 }}
          loading={busy === 'stop'}
          onPress={async () => {
            if (await confirm('Stop sharing', 'Deletes the cloud copy for everyone. Each person keeps their own copy, but it stops syncing.', 'Stop sharing', true)) {
              await run('stop', () => stopSharing(id));
            }
          }}
        />
      ) : (
        <Button
          title="Leave budget"
          variant="danger"
          icon="exit-outline"
          style={{ marginTop: 22 }}
          loading={busy === 'leave'}
          onPress={async () => {
            if (await confirm('Leave budget', 'You’ll stop receiving updates. A copy stays on this device as a personal budget.', 'Leave', true)) {
              await run('leave', () => leaveBudget(id));
            }
          }}
        />
      )}
    </Screen>
  );
}
