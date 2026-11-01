import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { View } from 'react-native';
import { haptic, Row, Tap, Txt } from '@/components/ui';
import { RADIUS } from '@/theme';

/** A label + value with a Copy button (keys show only their first characters). */
export function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Row style={{ gap: 10, paddingVertical: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label">{label}</Txt>
        <Txt variant="caption" tone="muted" numberOfLines={1}>
          {secret ? `${value.slice(0, 6)}••••••••` : value}
        </Txt>
      </View>
      <Tap
        onPress={async () => {
          await Clipboard.setStringAsync(value);
          haptic('success');
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.pill, backgroundColor: copied ? '#14B57A22' : '#9A5CF522' }}
      >
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#14B57A' : '#9A5CF5'} />
        <Txt variant="label" style={{ color: copied ? '#14B57A' : '#9A5CF5' }}>
          {copied ? 'Copied' : 'Copy'}
        </Txt>
      </Tap>
    </Row>
  );
}
