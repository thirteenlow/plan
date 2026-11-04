import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { BrandMark } from '@/components/BrandMark';
import { FeatureTour } from '@/components/FeatureTour';
import { FormatEditor, type FormatValue, guessFormat } from '@/components/FormatEditor';
import { Screen } from '@/components/Screen';
import { Button, notify, TextField, Txt } from '@/components/ui';
import { useCloud } from '@/cloud/cloudStore';
import { useAccountGate } from '@/cloud/gate';
import { useStore } from '@/store/store';
import { pickImport } from '@/utils/importExport';
import { LIMITS, validateName } from '@/utils/validation';

type Template = 'default' | 'demo' | 'import';

export default function Onboarding() {
  const createBudget = useStore((s) => s.createBudget);
  const hasBudgets = useStore((s) => Object.keys(s.budgets).length > 0);
  const firstName = useCloud((s) => s.user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const [step, setStep] = useState<1 | 2>(1);
  const [template, setTemplate] = useState<Template>('default');
  const [name, setName] = useState(firstName ? `${firstName}’s Plan`.slice(0, LIMITS.budgetName) : 'My Plan');
  const [nameError, setNameError] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatValue>(guessFormat);
  const [busy, setBusy] = useState(false);
  const gate = useAccountGate();
  // A brand-new account starts with the feature tour (not when adding another budget later).
  const [touring, setTouring] = useState(!hasBudgets);

  const next = (t: Template) => {
    if (t === 'default') {
      const error = validateName(name, { label: 'Name', max: LIMITS.budgetName });
      setNameError(error);
      if (error) return;
    }
    setTemplate(t);
    setStep(2);
  };

  const greet = () => {
    if (firstName) useStore.getState().updateSettings({ ownerName: firstName.slice(0, LIMITS.ownerName) });
  };

  const start = async () => {
    if (template === 'import') {
      setBusy(true);
      try {
        const result = await pickImport(format);
        if (!result) return;
        if (!useStore.getState().importBudget(result.data, result.name)) return notify('Can’t import that file', 'It isn’t a budget export, or it’s damaged.');
        greet();
        router.replace('/');
      } catch (e) {
        notify('Import failed', e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
      return;
    }
    createBudget(template === 'demo' ? 'Demo Plan' : name, format.currency, template, format.dateFormat);
    greet();
    router.replace(template === 'demo' ? '/' : '/setup');
  };

  if (gate) return gate;
  if (touring) return <FeatureTour onDone={() => setTouring(false)} />;

  if (step === 2) {
    return (
      <Screen
        back="back"
        onBack={() => setStep(1)}
        title="Choose your format"
        subtitle={template === 'default' ? 'Step 2 of 6 · change it any time in Settings' : 'Change it any time in Settings'}
        maxWidth={560}
        footer={<Button title={template === 'demo' ? 'Open the demo' : template === 'import' ? 'Choose export file' : 'Next: categories'} loading={busy} onPress={() => void start()} />}
      >
        <FormatEditor value={format} onChange={setFormat} />
      </Screen>
    );
  }

  return (
    <Screen back={hasBudgets ? 'close' : undefined} maxWidth={420}>
      <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 28 }}>
        <BrandMark size={64} />
        <Txt variant="title" center style={{ marginTop: 18 }}>
          Name your plan
        </Txt>
        <Txt tone="soft" center style={{ marginTop: 6 }}>
          Step 1 of 6 · you can rename it later
        </Txt>
      </View>
      <TextField
        icon="create-outline"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setNameError(null);
        }}
        maxLength={LIMITS.budgetName}
        error={nameError}
        onSubmitEditing={() => next('default')}
        accessibilityLabel="Plan name"
      />
      <View style={{ gap: 10, marginTop: 16 }}>
        <Button title="Continue" onPress={() => next('default')} />
        <Button title="Import a plan" variant="soft" icon="download-outline" onPress={() => next('import')} />
        <Button title="Try a demo plan" variant="ghost" icon="sparkles-outline" onPress={() => next('demo')} />
      </View>
    </Screen>
  );
}
