import { router } from 'expo-router';
import React, { useState } from 'react';
import { friendlyError, useCloud } from '@/cloud/cloudStore';
import { leaveBudget, stopSharing } from '@/cloud/sync';
import { useStore } from '@/store/store';
import type { BudgetData } from '@/store/types';
import { Sheet } from './Sheet';
import { Button, TextField, Txt } from './ui';

/** Deleting a budget can't be undone, so the user types its name to confirm (like GitHub's repo delete). */
export function DeleteBudgetSheet({ budget, onClose }: { budget: BudgetData | null; onClose: () => void }) {
  const deleteBudget = useStore((s) => s.deleteBudget);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = useStore((s) => (budget ? s.sync[budget.id] : undefined));
  const cloudReady = useCloud((s) => s.status === 'ready');
  const matches = !!budget && typed.trim().toLowerCase() === budget.name.trim().toLowerCase();

  return (
    <Sheet
      visible={!!budget}
      onClose={() => {
        setTyped('');
        onClose();
      }}
      title="Delete budget"
    >
      {budget && (
        <>
          <Txt tone="soft">
            This permanently deletes “{budget.name}” from this device: {budget.accounts.length} accounts, {budget.transactions.length} transactions and every plan. This can’t be undone.
          </Txt>
          {meta && (
            <Txt tone="warning" style={{ marginTop: 10 }}>
              {meta.role === 'owner' ? 'You own this shared budget, so its cloud copy will be deleted for everyone too.' : 'You’ll also leave this shared budget; the owner and other members keep it.'}
            </Txt>
          )}
          {!!err && (
            <Txt tone="danger" style={{ marginTop: 10 }}>
              {err}
            </Txt>
          )}
          <TextField containerStyle={{ marginTop: 16 }} label={`Type “${budget.name}” to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
          <Button
            title="Delete forever"
            variant="danger"
            icon="trash-outline"
            disabled={!matches}
            style={{ marginTop: 16 }}
            loading={busy}
            onPress={async () => {
              if (meta && cloudReady) {
                setBusy(true);
                try {
                  await (meta.role === 'owner' ? stopSharing(budget.id) : leaveBudget(budget.id));
                } catch (e) {
                  setErr(friendlyError(e));
                  setBusy(false);
                  return;
                }
                setBusy(false);
              }
              const onlyOne = Object.keys(useStore.getState().budgets).length === 1;
              setTyped('');
              onClose();
              // Leave every screen that showed this budget before it disappears.
              if (router.canDismiss()) router.dismissAll();
              if (onlyOne) router.replace('/onboarding');
              else router.navigate('/');
              deleteBudget(budget.id);
            }}
          />
        </>
      )}
    </Sheet>
  );
}
