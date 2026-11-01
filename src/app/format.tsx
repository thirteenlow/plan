import React, { useState } from 'react';
import { FormatEditor, type FormatValue } from '@/components/FormatEditor';
import { Screen } from '@/components/Screen';
import { Button, haptic } from '@/components/ui';
import { useActiveBudget, useStore } from '@/store/store';
import { goBack } from '@/utils/nav';

export default function FormatScreen() {
  const data = useActiveBudget();
  const updateSettings = useStore((s) => s.updateSettings);
  const [format, setFormat] = useState<FormatValue>({ currency: data.settings.currency, dateFormat: data.settings.dateFormat });

  return (
    <Screen
      back="back"
      title="Currency & formats"
      subtitle="Amounts are stored exactly; this only changes how they look"
      maxWidth={560}
      footer={
        <Button
          title="Save"
          onPress={() => {
            haptic('success');
            updateSettings({ currency: format.currency, dateFormat: format.dateFormat });
            goBack();
          }}
        />
      }
    >
      <FormatEditor value={format} onChange={setFormat} />
    </Screen>
  );
}
